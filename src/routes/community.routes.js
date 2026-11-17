import express from "express";
import { listCommunity, communityProject, communityCover, remixProject } from "../services/community.service.js";
import Component from "../models/component.model.js";
import { boardItem, BOARD_FIELDS, boardCategories } from "./project.routes.js";
import { normalizeTheme } from "@windcraft/core/theme.js";

// ── A public project: open to anyone, the author named; "Edit a copy" makes the visitor their own copy ────────────────────────
export const communityPages = express.Router();
// the Community page: the public projects of everyone, each with its author
communityPages.get("/", async (req, res) => {
    try {
        const projects = await listCommunity();
        const tagCount = {};
        projects.forEach((p) => p.tags.forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
        const tagChips = Object.entries(tagCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
        res.render("main/projects", { layout: "main", activePage: "community", title: "Community", user: req.session?.user || null, community: true, projects, catChips: [], tagChips });
    } catch (error) {
        console.error("Community page error:", error);
        res.status(500).render("error", { layout: "main", title: "Error", message: "Failed to load the Community" });
    }
});
communityPages.get("/:id", async (req, res) => {
    const found = await communityProject(req.params.id);
    const user = req.session?.user || null;
    if (!found) return res.status(404).render("error", { layout: "main", title: "Not found", message: "This project isn't in the Community (any more).", user });
    const { project, author } = found;
    // the same board as the owner's, read-only: it opens with a spinner and takes its data from /api/community/:id/board
    res.render("main/project", { layout: "canvas", title: project.name, projectId: String(project._id), projectName: project.name, readOnly: true, boardUrl: `/api/community/${project._id}/board`, backHref: "/community", backLabel: "Community" });
});

export const communityApi = express.Router();
// everything the read-only board opens with: the same shape as the owner's, without anything private (no share link, no other projects)
communityApi.get("/:id/board", async (req, res) => {
    const found = await communityProject(req.params.id);
    if (!found) return res.status(404).json({ success: false, message: "Not found" });
    const { project, author } = found;
    const me = req.session?.user || null;
    const items = await Component.find({ project: project._id }).select(BOARD_FIELDS).sort("order createdAt").lean();
    res.json({ success: true, data: {
        project: {
            id: String(project._id), name: project.name, description: project.description, brief: "", autoParts: project.autoParts === true, theme: normalizeTheme(project.theme),
            readOnly: true, community: true, canCopy: project.communityCopy !== false, author, mine: Boolean(me && String(project.owner) === String(me.id)), signedIn: Boolean(me),
            credit: project.remixedFrom && project.remixedFrom.author ? { author: project.remixedFrom.author, name: project.remixedFrom.name, id: String(project.remixedFrom.project) } : null,
        },
        categories: boardCategories(), projects: [],
        items: items.map((c) => ({ ...boardItem(c), isPublished: false })),
    } });
});
// the frames of a public project's card
communityApi.get("/:id/cover", async (req, res) => {
    const found = await communityProject(req.params.id);
    if (!found) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: { frames: await communityCover(found.project) } });
});
// "Edit a copy": signed in
communityApi.post("/:id/remix", async (req, res) => {
    if (!req.session?.user) return res.status(401).json({ success: false, message: "Please login to continue" });
    try {
        const found = await communityProject(req.params.id);
        if (found && found.project.communityCopy === false) return res.status(403).json({ success: false, message: "The author has set this project to view only." });
        const made = await remixProject(req.session.user.id, req.params.id);
        if (!made) return res.status(404).json({ success: false, message: "This project isn't in the Community (any more)." });
        res.json({ success: true, data: made });
    } catch (err) {
        console.error("Remix error:", err);
        res.status(500).json({ success: false, message: "Could not make the copy" });
    }
});
