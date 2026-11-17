import Component from "../models/component.model.js";
import { rolesOfDesign, ROLES_VERSION } from "@windcraft/core/roles.js";

// Designs saved without going through a save (a bulk insert, a publish of a whole project) have no roles yet, or roles from older rules.
// They are caught up here, a batch at a time, the first time the gallery is asked for a role (and again a minute later, for what was published since).
let checkedAt = 0, running = null;

/** Gives every published design its roles (up to `budgetMs`; what is left waits for the next call). */
export function ensureRoles({ budgetMs = 4000 } = {}) {
    if (Date.now() - checkedAt < 60_000) return Promise.resolve();
    if (running) return running;
    running = (async () => {
        const started = Date.now();
        try {
            while (Date.now() - started < budgetMs) {
                const batch = await Component.find({ isPublished: true, rolesV: { $ne: ROLES_VERSION } }).select("htmlCode category title tags").limit(200).lean();
                if (!batch.length) { checkedAt = Date.now(); return; }
                await Component.bulkWrite(batch.map((c) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { roles: rolesOfDesign(c), rolesV: ROLES_VERSION } } } })));
            }
        } finally { running = null; }
    })();
    return running;
}
