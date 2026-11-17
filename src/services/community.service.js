import mongoose from "mongoose";
import Project from "../models/project.model.js";
import Component from "../models/component.model.js";
import User from "../models/user.model.js";
import { normalizeTheme, pageTheme } from "@windcraft/core/theme.js";

const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));

/** The public projects, the newest first, each with its author's name and how many frames it has. */
export async function listCommunity({ limit = 60 } = {}) {
    const projects = await Project.find({ community: true }).sort("-communityAt").limit(limit).select("name description owner communityAt updatedAt remixedFrom").lean();
    if (!projects.length) return [];
    const [authors, counts, tagRows] = await Promise.all([
        User.find({ _id: { $in: [...new Set(projects.map((p) => String(p.owner)))] } }).select("name").lean(),
        Component.aggregate([
            { $match: { project: { $in: projects.map((p) => p._id) }, kind: { $ne: "section" } } },
            { $group: { _id: "$project", n: { $sum: 1 } } },
        ]),
        Component.aggregate([
            { $match: { project: { $in: projects.map((p) => p._id) }, kind: { $ne: "section" }, tags: { $exists: true, $ne: [] } } },
            { $unwind: "$tags" },
            { $group: { _id: { project: "$project", tag: "$tags" } } },
        ]),
    ]);
    const name = new Map(authors.map((u) => [String(u._id), u.name]));
    const n = new Map(counts.map((c) => [String(c._id), c.n]));
    const tags = {};
    tagRows.forEach((t) => { (tags[String(t._id.project)] ||= []).push(t._id.tag); });
    return projects.map((p) => ({
        id: String(p._id), name: p.name, description: p.description, updatedAt: p.communityAt || p.updatedAt,
        author: name.get(String(p.owner)) || "Someone", frames: n.get(String(p._id)) || 0,
        tags: (tags[String(p._id)] || []).sort(), catSlugs: "", tagList: (tags[String(p._id)] || []).sort().join("\u0001"),
        href: `/community/${p._id}`, coverUrl: `/api/community/${p._id}/cover`,
    }));
}

/** A public project with its author, or null. */
export async function communityProject(id) {
    if (!isId(id)) return null;
    const project = await Project.findOne({ _id: id, community: true }).lean();
    if (!project) return null;
    const author = await User.findById(project.owner).select("name").lean();
    return { project, author: (author && author.name) || "Someone" };
}

/** Up to three frames for a public project's card (the same shape as the owner's cover). */
export async function communityCover(project) {
    const items = await Component.find({ project: project._id, kind: { $ne: "section" } }).sort("order createdAt").limit(3).select("htmlCode twConfig board frameW").lean();
    const theme = normalizeTheme(project.theme);
    return items.map((c) => ({ html: c.htmlCode, width: (c.board && c.board.w) || c.frameW || 1280, theme: pageTheme(theme, c.twConfig) }));
}

/**
 * Makes the person's own copy of a public project: a new project in their account with the same frames (code, board places, groups,
 * theme), not in the gallery, with the credit to the author kept. The original is not touched.
 */
export async function remixProject(userId, id) {
    const found = await communityProject(id);
    if (!found) return null;
    const { project, author } = found;
    const copy = await Project.create({
        name: project.name.slice(0, 80), description: project.description, brief: project.brief, sharedHead: project.sharedHead, theme: project.theme,
        autoParts: project.autoParts === true, owner: userId, remixedFrom: { project: project._id, author, name: project.name },
    });
    const items = await Component.find({ project: project._id }).select("-versions -reports -likedBy").lean();
    const ids = new Map(items.map((c) => [String(c._id), new mongoose.Types.ObjectId()]));
    if (items.length) {
        await Component.insertMany(items.map((c) => ({
            _id: ids.get(String(c._id)), title: c.title, category: c.category, description: c.description, htmlCode: c.htmlCode, createdBy: userId, project: copy._id,
            kind: c.kind, parent: c.parent ? ids.get(String(c.parent)) || null : null, board: c.board, twConfig: c.twConfig, order: c.order, frameW: c.frameW,
            group: c.group, profile: c.profile, partHash: c.partHash, useAsReference: c.useAsReference, tags: c.tags, isPublished: false, likes: 0, likedBy: [], version: 1, versions: [],
        })));
    }
    return { id: String(copy._id), frames: items.length };
}
