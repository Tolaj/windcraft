// What the editor loads of a project: its frames, on one canvas. A project of many frames is shown one group at a time (a group is the
// "Public site" or "Cookie Banners" a frame belongs to); a small one is shown whole. The list of groups, with how many frames each has, is always sent.
import mongoose from "mongoose";
import Component from "../models/component.model.js";

/** A project with this many frames or fewer is shown whole; a larger one one group at a time. */
export const ALL_MAX = 60;
/** The most frames of one group loaded at once (a group of more is cut here, and says so). */
export const GROUP_MAX = 100;

/** A frame's saved place and size on the board, or null. */
export const boardOf = (c) => (c.board && Number.isFinite(c.board.x) && Number.isFinite(c.board.y)
    ? { x: c.board.x, y: c.board.y, ...(Number.isFinite(c.board.w) ? { w: c.board.w } : {}), ...(Number.isFinite(c.board.h) ? { h: c.board.h } : {}) }
    : null);

/** The most frames one group holds: past it a frame goes to "Name-1", then "Name-2"... */
export const GROUP_FRAMES = 50;

/**
 * The group a frame is saved into: the one asked for, or, when that holds GROUP_FRAMES frames already, the first "Name-N" with room.
 * A frame already in the group stays (`id` is left out of the count). No group, or no project, is never capped.
 */
export async function fitGroup(userId, projectId, group, id = null) {
    if (!group || !projectId) return group || "";
    const count = (g) => Component.countDocuments({ createdBy: userId, project: projectId, kind: { $ne: "section" }, group: g, ...(id ? { _id: { $ne: id } } : {}) });
    if ((await count(group)) < GROUP_FRAMES) return group;
    const base = group.replace(/-\d+$/, "");
    for (let n = 1; ; n++) {
        const name = `${base.slice(0, 57 - String(n).length)}-${n}`;
        if (name !== group && (await count(name)) < GROUP_FRAMES) return name;
    }
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** The groups of a project's frames, in the order of their first frame, each with its frame count ("" is the frames without a group). */
export async function groupsOf(userId, projectId) {
    const rows = await Component.aggregate([
        { $match: { createdBy: oid(userId), project: oid(projectId), kind: { $ne: "section" } } },
        { $group: { _id: { $ifNull: ["$group", ""] }, count: { $sum: 1 }, order: { $min: "$order" }, created: { $min: "$createdAt" } } },
        { $sort: { order: 1, created: 1 } },
    ]);
    return rows.map((r) => ({ name: r._id, count: r.count }));
}

const item = (p, blankHtmlFor) => ({
    id: String(p._id), title: p.title, group: p.group || "", frameW: p.frameW || null, version: p.version || 1, kind: p.kind, parent: p.parent ? String(p.parent) : null,
    board: boardOf(p), category: p.category, description: p.description, tags: p.tags || [], isPublished: p.isPublished, useAsReference: p.useAsReference !== false, twConfig: p.twConfig || null,
    htmlCode: blankHtmlFor && String(p._id) === String(blankHtmlFor) ? "" : p.htmlCode,
});

/**
 * The frames to put on the editor's canvas.
 * @param {{ group?: string | null, currentId?: any, ownGroup?: string, strict?: boolean }} [opts]
 *   group: a group's name ("" for the frames without one), null for every frame, undefined to choose (whole if the project is small, else `ownGroup`);
 *   currentId: the design being edited: always included, and its code is left out (the page carries it);
 *   strict: asking for every frame of a project too big for that is an error, not a quiet cut.
 * @returns {Promise<{ frames: object[], groups: { name: string, count: number }[], total: number, group: string | null, truncated: boolean }>}
 */
export async function planeOf(userId, projectId, { group, currentId = null, ownGroup = "", strict = false } = {}) {
    const groups = await groupsOf(userId, projectId);
    const total = groups.reduce((n, g) => n + g.count, 0);
    const whole = total <= ALL_MAX;
    let chosen = group === undefined ? (whole ? null : ownGroup) : group;
    if (chosen === null && !whole) {
        if (strict) throw Object.assign(new Error(`This project has ${total} frames: too many for one canvas. Pick a group.`), { status: 400 });
        chosen = ownGroup;
    }
    const notSection = { kind: { $ne: "section" } };
    const current = currentId ? [{ _id: currentId }] : [];
    const inGroup = chosen === null ? notSection : { ...notSection, group: chosen === "" ? { $in: [null, ""] } : chosen };
    const cap = chosen === null ? ALL_MAX : GROUP_MAX;
    const rows = await Component.find({ createdBy: userId, project: projectId, $or: [...current, inGroup] })
        .select("title htmlCode version category description tags isPublished useAsReference kind parent board group frameW twConfig")
        .sort("order createdAt").limit(cap).lean();
    if (currentId && !rows.some((r) => String(r._id) === String(currentId))) { // the design being edited is always on the canvas, even past the cut
        const cur = await Component.findOne({ _id: currentId, createdBy: userId, project: projectId }).select("title htmlCode version category description tags isPublished useAsReference kind parent board group frameW twConfig").lean();
        if (cur) rows.push(cur);
    }
    const wanted = chosen === null ? total : ((groups.find((g) => g.name === chosen) || {}).count || 0); // the frames the choice has
    const loaded = rows.filter((r) => r.kind !== "section" && (chosen === null || (r.group || "") === chosen)).length; // of them, the ones sent
    return { frames: rows.map((r) => item(r, currentId)), groups, total, group: chosen, truncated: wanted > loaded };
}
