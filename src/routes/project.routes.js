import crypto from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import Project from "../models/project.model.js";
import Component from "../models/component.model.js";
import FigmaSource from "../models/figmaSource.model.js";
import { listProjects, getActiveProject, setActiveProject, publishState, setPublished } from "../services/project.service.js";
import { buildDesignGuide } from "../services/guide.service.js";
import { syncPartsOf } from "../services/import.service.js";
import { planeOf } from "../services/plane.service.js";
import { categories } from "./home.routes.js";
import { normalizeTheme } from "@windcraft/core/theme.js";

// ── Pages ────────────────────────────────────────────────────────────────────
export const projectPages = express.Router();

projectPages.get("/", async (req, res) => {
    try {
        const projects = (await listProjects(req.session.user.id)).map((p) => ({
            ...p,
            catNames: p.cats.map((c) => ({ slug: c.slug, name: categories[c.slug]?.name || c.slug, count: c.count })),
            catSlugs: p.cats.map((c) => c.slug).join(" "),
            tagList: p.tags.join("\u0001"),
        }));
        // every category used across the projects, with how many designs: the filter chips
        const all = {};
        projects.forEach((p) => p.cats.forEach((c) => { all[c.slug] = (all[c.slug] || 0) + c.count; }));
        const catChips = Object.entries(all).sort((a, b) => b[1] - a[1]).map(([slug, count]) => ({ slug, name: categories[slug]?.name || slug, count }));
        // every tag across the projects, with how many projects use it: the tag chips
        const tagCount = {};
        projects.forEach((p) => p.tags.forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
        const tagChips = Object.entries(tagCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
        res.render("main/projects", { layout: "main", activePage: "projects", title: "Projects", user: req.session.user, projects, catChips, tagChips });
    } catch (error) {
        console.error("Projects page error:", error);
        res.status(500).render("error", { layout: "main", title: "Error", message: "Failed to load projects" });
    }
});

// A markdown guide generated from the user's designs (agents read the same with the get_design_guide tool)
projectPages.get("/design-guide.md", async (req, res) => {
    try {
        const { markdown } = await buildDesignGuide(req.session.user.id);
        res.type("text/markdown; charset=utf-8");
        if (req.query.download) res.attachment("design-guide.md");
        res.send(markdown);
    } catch (error) {
        console.error("Design guide error:", error);
        res.status(500).type("text/plain").send("Could not build the design guide");
    }
});

projectPages.get("/:id", async (req, res) => {
    // The page opens at once with a spinner; the board's data (all the frames' code) comes from /api/projects/:id/board
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new Error("bad id");
        const project = await Project.findOne({ _id: req.params.id, owner: req.session.user.id }).select("name").lean();
        if (!project) throw new Error("missing");
        res.render("main/project", { layout: "canvas", projectId: String(project._id), title: project.name, projectName: project.name });
    } catch {
        res.status(404).render("error", { layout: "main", title: "Not found", message: "That project doesn't exist.", user: req.session.user });
    }
});

/** Everything the project board opens with: the project, its frames and parts (with their code) and the lists the panels need. */
async function boardData(userId, projectId) {
    const project = await Project.findOne({ _id: projectId, owner: userId }).lean();
    if (!project) return null;
    const [active, items, others] = await Promise.all([ // (three independent reads, together)
        getActiveProject(userId),
        Component.find({ createdBy: userId, project: project._id })
        .select("title description kind parent order group tags version htmlCode board category useAsReference twConfig isPublished updatedAt")
        .sort("order createdAt")
        .lean(),
        Project.find({ owner: userId }).select("name").sort("name").lean(),
    ]);
    const data = {
        project: { id: String(project._id), name: project.name, shareToken: project.shareToken || "", theme: normalizeTheme(project.theme), description: project.description, brief: project.brief || "", autoParts: project.autoParts !== false, active: Boolean(active && String(active._id) === String(project._id)) },
        categories: Object.entries(Object.entries(categories).reduce((g, [slug, c]) => ((g[c.group] ||= []).push({ slug, name: c.name }), g), {})).map(([group, list]) => ({ group, items: list })), // for each design's category
        projects: others.map((x) => ({ id: String(x._id), name: x.name })), // for "Move to project"
        items: items.map((c) => ({
            id: String(c._id), title: c.title, useAsReference: c.useAsReference !== false, twConfig: c.twConfig || null, group: c.group || "", description: c.description, kind: c.kind, parent: c.parent ? String(c.parent) : null,
            version: c.version || 1, tags: c.tags || [], category: c.category || "", isPublished: c.isPublished === true, htmlCode: c.htmlCode, frameW: c.frameW || null, board: c.board && Number.isFinite(c.board.x) ? { x: c.board.x, y: c.board.y, ...(Number.isFinite(c.board.w) ? { w: c.board.w } : {}), ...(Number.isFinite(c.board.h) ? { h: c.board.h } : {}) } : null, updatedAt: c.updatedAt,
        })),
    };
    return data;
}

// ── API ──────────────────────────────────────────────────────────────────────
export const projectApi = express.Router();

// frame size: whole pixels, kept sane. A number sets it, null clears it (back to automatic), anything else keeps the old value.
const sizeOf = (p, old) => {
    const out = {};
    [["w", 8000], ["h", 20000]].forEach(([k, max]) => {
        const v = Number.isFinite(p[k]) ? p[k] : p[k] === null ? null : old[k];
        if (Number.isFinite(v)) out[k] = Math.min(max, Math.max(120, Math.round(v)));
    });
    return out;
};

const clean = (b) => ({ name: String(b.name || "").trim().slice(0, 80), description: String(b.description || "").trim().slice(0, 300) });

projectApi.get("/:id/board", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
        const data = await boardData(req.session.user.id, req.params.id);
        if (!data) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || "Could not open the project" });
    }
});

projectApi.get("/", async (req, res) => res.json({ success: true, data: await listProjects(req.session.user.id) }));

projectApi.post("/", async (req, res) => {
    let { name, description } = clean(req.body || {});
    if (!name) return res.status(400).json({ success: false, message: "A project needs a name" });
    if (name === "Untitled project") { // the name New project gives: the next free "Untitled project 2", "3"...
        const taken = new Set((await Project.find({ owner: req.session.user.id, name: /^Untitled project( \d+)?$/ }).select("name").lean()).map((x) => x.name));
        for (let n = 2; taken.has(name); n++) name = `Untitled project ${n}`;
    }
    const p = await Project.create({ name, description, owner: req.session.user.id });
    res.status(201).json({ success: true, data: { id: String(p._id), name: p.name, description: p.description } });
});

/** Turn the share link on (a new link) or off. `{ on: true }` returns { token }. Anyone with the link can look and copy; nobody can change anything. */
projectApi.post("/:id/share", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
    const on = !(req.body && req.body.on === false);
    const token = on ? crypto.randomBytes(16).toString("hex") : "";
    const p = await Project.findOneAndUpdate({ _id: req.params.id, owner: req.session.user.id }, { shareToken: token }, { new: true });
    if (!p) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, token });
});

/** Turn the prototype link on (a new link) or off. `{ on: true }` returns { token }. Anyone with the link can click through the pages; nothing else. */
projectApi.post("/:id/prototype-share", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
    const on = !(req.body && req.body.on === false);
    const p = await Project.findOne({ _id: req.params.id, owner: req.session.user.id });
    if (!p) return res.status(404).json({ success: false, message: "Not found" });
    p.protoToken = on ? p.protoToken || crypto.randomBytes(16).toString("hex") : ""; // turning it on again keeps the link that already works
    await p.save();
    res.json({ success: true, token: p.protoToken });
});

// The frames of one group of a project (or all of them, in a small one), with the list of groups: what the editor loads when you switch group.
projectApi.get("/:id/frames", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
    const project = await Project.findOne({ _id: req.params.id, owner: req.session.user.id }).select("_id").lean();
    if (!project) return res.status(404).json({ success: false, message: "Not found" });
    const q = req.query.group;
    const group = q === undefined || q === "__all" ? null : String(q);
    try {
        const r = await planeOf(req.session.user.id, project._id, { group, strict: true });
        res.json({ success: true, data: r });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

projectApi.put("/:id", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
    const { name, description } = clean(req.body || {});
    const update = {};
    if (name) update.name = name;
    if (req.body && req.body.theme !== undefined) update.theme = normalizeTheme(req.body.theme); // anything invalid falls back to the default, field by field
    if (req.body && req.body.description !== undefined) update.description = description;
    if (req.body && req.body.brief !== undefined) update.brief = String(req.body.brief).slice(0, 4000);
    if (req.body && typeof req.body.autoParts === "boolean") update.autoParts = req.body.autoParts;
    const before = update.autoParts === true ? await Project.findOne({ _id: req.params.id, owner: req.session.user.id }).select("autoParts").lean() : null;
    const p = await Project.findOneAndUpdate({ _id: req.params.id, owner: req.session.user.id }, update, { new: true });
    if (!p) return res.status(404).json({ success: false, message: "Not found" });
    // turned on after being off: the parts of the frames already there are made now (in the background; each frame's parts are made again when it is saved)
    if (before && before.autoParts === false) {
        (async () => {
            const frames = await Component.find({ createdBy: req.session.user.id, project: p._id, kind: "page" });
            for (const f of frames) { try { await syncPartsOf(req.session.user.id, f); } catch (err) { console.error("Parts error:", err); } }
        })();
    }
    // "Publish": every frame of the project in the gallery (true), or none (false)
    const gallery = req.body && typeof req.body.published === "boolean" ? await setPublished(req.session.user.id, p._id, req.body.published) : null;
    res.json({ success: true, data: { id: String(p._id), name: p.name, description: p.description, autoParts: p.autoParts !== false, theme: normalizeTheme(p.theme), ...(gallery ? { published: gallery.published } : {}) } });
});

// Makes this the project Claude works in by default (or clears it with { active: false }).
projectApi.post("/:id/activate", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
    const owned = await Project.exists({ _id: req.params.id, owner: req.session.user.id });
    if (!owned) return res.status(404).json({ success: false, message: "Not found" });
    const on = !(req.body && req.body.active === false);
    await setActiveProject(req.session.user.id, on ? req.params.id : null);
    res.json({ success: true, active: on });
});

// Saves frame positions in one call. A null position resets that frame to automatic layout (Tidy up).
projectApi.post("/:id/layout", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
    const owned = await Project.exists({ _id: req.params.id, owner: req.session.user.id });
    if (!owned) return res.status(404).json({ success: false, message: "Not found" });
    const positions = Array.isArray(req.body && req.body.positions) ? req.body.positions.slice(0, 500) : [];
    const valid = positions.filter((p) => mongoose.isValidObjectId(p.id));
    const current = new Map((await Component.find({ _id: { $in: valid.map((p) => p.id) }, createdBy: req.session.user.id, project: req.params.id }).select("board").lean()).map((c) => [String(c._id), c.board]));
    const ops = valid.filter((p) => current.has(String(p.id))).map((p) => {
        // a position keeps the frame's saved size unless a new size comes with it; null resets to automatic layout
        const old = current.get(String(p.id)) || {};
        const board = Number.isFinite(p.x) && Number.isFinite(p.y)
            ? { x: Math.round(p.x), y: Math.round(p.y), ...sizeOf(p, old) }
            : null;
        return { updateOne: { filter: { _id: p.id }, update: { board } } };
    });
    if (ops.length) await Component.bulkWrite(ops);
    res.json({ success: true });
});

// Deleting a project deletes everything in it (every design belongs to a project, so none is left without one).
projectApi.delete("/:id", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Not found" });
    const p = await Project.findOneAndDelete({ _id: req.params.id, owner: req.session.user.id });
    if (!p) return res.status(404).json({ success: false, message: "Not found" });
    const ids = (await Component.find({ createdBy: req.session.user.id, project: p._id }).select("_id").lean()).map((c) => c._id);
    await FigmaSource.deleteMany({ component: { $in: ids } }); // the Figma data kept with those pages goes with them
    await Component.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: ids.length });
});

// ── The share link: look at a project and copy its code, with no account ────────────────────────────────────────
export const sharePages = express.Router();
sharePages.get("/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const project = /^[a-f0-9]{32}$/.test(token) ? await Project.findOne({ shareToken: token }).lean() : null;
    if (!project) return res.status(404).render("error", { layout: "main", title: "Not found", message: "This link doesn't work (any more).", user: req.session?.user || null });
    const items = await Component.find({ project: project._id, kind: { $ne: "section" } }).select("title description kind htmlCode version twConfig").sort("order createdAt").lean();
    const data = {
        project: { name: project.name, theme: normalizeTheme(project.theme) },
        items: items.map((c) => ({ id: String(c._id), title: c.title, description: c.description, kind: c.kind, htmlCode: c.htmlCode, twConfig: c.twConfig || null })),
    };
    res.render("main/share", { layout: "main", title: project.name, user: req.session?.user || null, projectName: project.name, count: items.length, dataJson: JSON.stringify(data).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "") });
});

// ── The prototype: a project's pages, one at a time, full screen (its own view, like Figma's /proto) ─────────────────────────
// /prototype/<token>: open to anyone who has the link. /prototype/<project id>: the owner, signed in (and the Share button there makes the link).
export const protoPages = express.Router();
protoPages.get("/:ref", async (req, res) => {
    const ref = String(req.params.ref || "");
    const me = req.session?.user?.id;
    let project = null, owner = false;
    if (/^[a-f0-9]{32}$/.test(ref)) project = await Project.findOne({ protoToken: ref }).lean();
    else if (mongoose.isValidObjectId(ref) && me) { project = await Project.findOne({ _id: ref, owner: me }).lean(); owner = Boolean(project); }
    if (!project) return res.status(404).render("error", { layout: "main", title: "Not found", message: "This link doesn't work (any more).", user: req.session?.user || null });
    owner = owner || Boolean(me && String(project.owner) === String(me));
    const items = await Component.find({ project: project._id, kind: { $ne: "section" } }).select("title htmlCode kind frameW board twConfig").sort("order createdAt").lean();
    // what is in Preview: the pages, and anything else placed on the canvas (a design is a design: the label page / component does not keep one out of the flow)
    const wanted = items.filter((c) => c.kind === "page" || c.board);
    const shown = (wanted.length ? wanted : items).map((c) => ({
        id: String(c._id), title: c.title, htmlCode: c.htmlCode, twConfig: c.twConfig || null, width: (c.board && Number.isFinite(c.board.w) && c.board.w) || c.frameW || null,
        height: (c.board && Number.isFinite(c.board.h) && c.board.h) || null,
    }));
    const data = { project: { id: String(project._id), name: project.name, theme: normalizeTheme(project.theme) }, items: shown, owner, token: project.protoToken || "" };
    res.render("main/prototype", { layout: "canvas", title: `${project.name} (prototype)`, dataJson: JSON.stringify(data).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, "") });
});
