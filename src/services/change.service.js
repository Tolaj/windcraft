// Who changed a design, how an AI's change is undone, and the activity log the Connect page shows.
import Component from "../models/component.model.js";
import AiActivity from "../models/aiActivity.model.js";
import { buildProfile } from "./profile.service.js";

/** What a change records: who made it. `actor` is { source, label } ("ai" with a client's name, or "editor"). */
/** @param {{ source?: string, label?: string } | null} [actor] */
export const cleanActor = (actor) => ({ source: (actor && actor.source) || "", label: String((actor && actor.label) || "").slice(0, 80) });

/**
 * Puts the component's current code into its history and moves to `htmlCode` as the next version (the caller saves it).
 * The history entry remembers who made the change that replaced it, and the component who made the current version.
 * @param {any} c
 * @param {string} htmlCode
 * @param {{ note?: string, actor?: { source?: string, label?: string } | null }} [options]
 */
export function pushVersion(c, htmlCode, { note = "", actor } = {}) {
    const by = cleanActor(actor);
    c.versions.push({ version: c.version || 1, htmlCode: c.htmlCode, note, by });
    c.version = (c.version || 1) + 1;
    c.htmlCode = htmlCode;
    c.profile = buildProfile(htmlCode, c.profile);
    c.lastChange = { ...by, at: new Date() };
}

/** Notes what an AI client did, for the Connect page. Never fails the tool that called it. */
export async function logActivity(userId, actor, { action, design, title, project, version }) {
    try {
        await AiActivity.create({ user: userId, label: (actor && actor.label) || "An AI client", action, design, title, project, version });
    } catch (e) {
        console.error("AI activity log:", e.message);
    }
}

export class RevertError extends Error {}

/**
 * Takes a design back: to `toVersion`, or (by default) to what it was before the latest change, which must have been made by an AI. The code
 * it had is kept in its history first, so a revert can itself be reverted. `baseVersion`, when given, must be the current version.
 */
export async function revertDesign(userId, { id, toVersion, baseVersion, actor, onlyAi = true }) {
    if (!/^[a-f0-9]{24}$/i.test(String(id))) throw new RevertError("Invalid design id");
    const c = await Component.findOne({ _id: id, createdBy: userId });
    if (!c) throw new RevertError("Design not found in your library");
    const now = c.version || 1;
    if (baseVersion !== undefined && baseVersion !== null && Number(baseVersion) !== now) {
        throw new RevertError(`The design is now v${now}, not v${Number(baseVersion)}: it changed since. Read it again before reverting.`);
    }
    let target;
    if (toVersion !== undefined && toVersion !== null && toVersion !== "") {
        target = c.versions.find((v) => v.version === Number(toVersion));
        if (!target) throw new RevertError(`There is no saved v${toVersion} to go back to. Its history has ${c.versions.map((v) => `v${v.version}`).join(", ") || "no older versions"}.`);
    } else {
        if (onlyAi && !(c.lastChange && c.lastChange.source === "ai")) {
            throw new RevertError("The latest change to this design was not made by an AI, so there is nothing of an AI's to undo. Pass version to go back to a specific version.");
        }
        target = c.versions[c.versions.length - 1];
        if (!target) throw new RevertError("This design has no older version to go back to.");
    }
    const was = now;
    pushVersion(c, target.htmlCode, { note: `Before reverting to v${target.version}`, actor });
    await c.save();
    return { id: String(c._id), title: c.title, project: c.project, from: was, to: target.version, version: c.version };
}
