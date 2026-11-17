import express from "express";
import { listCommunity, communityProject, communityCover, remixProject } from "../services/community.service.js";
import Component from "../models/component.model.js";
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
    const items = await Component.find({ project: project._id, kind: { $ne: "section" } }).select("title description kind htmlCode version twConfig").sort("order createdAt").lean();
    const data = {
        project: { name: project.name, theme: normalizeTheme(project.theme) },
        items: items.map((c) => ({ id: String(c._id), title: c.title, description: c.description, kind: c.kind, htmlCode: c.htmlCode, twConfig: c.twConfig || null })),
    };
    res.render("main/share", {
        layout: "main", activePage: "community", title: project.name, user, projectName: project.name, count: items.length, community: true,
        projectId: String(project._id), author, mine: Boolean(user && String(project.owner) === String(user.id)), description: project.description,
        credit: project.remixedFrom && project.remixedFrom.author ? { author: project.remixedFrom.author, name: project.remixedFrom.name, id: String(project.remixedFrom.project) } : null,
        dataJson: JSON.stringify(data).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, ""),
    });
});

export const communityApi = express.Router();
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
        const made = await remixProject(req.session.user.id, req.params.id);
        if (!made) return res.status(404).json({ success: false, message: "This project isn't in the Community (any more)." });
        res.json({ success: true, data: made });
    } catch (err) {
        console.error("Remix error:", err);
        res.status(500).json({ success: false, message: "Could not make the copy" });
    }
});
