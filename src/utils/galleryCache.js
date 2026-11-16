// A short-lived memory of what the gallery pages ask the database for (the per-category counts, and the designs of a category).
//
// Every trip to the database costs a round trip (200 ms or more when the function and the database are in different regions), and the
// answers change only when a design is saved, published, liked or deleted. So an answer is kept for a short time, and everything is
// forgotten at once when a design is written through the Component model (see the hooks in models/component.model.js).
// bulkWrite is not seen by those hooks (the app uses it only for board positions): at worst an answer is TTL_MS old.

const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 16; // the designs of a category are large: only the most recent categories are kept
const kept = new Map(); // key -> { at, value }
let generation = 0; // counts the forgettings: an answer that was being fetched while a write happened is not kept

export function resetGalleryCache() {
    generation++;
    kept.clear();
}

/** `load` runs the real query; its answer is kept for TTL_MS under `key`. Do not change what it returns: it is shared. */
export async function galleryCache(key, load) {
    const hit = kept.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const started = generation;
    const value = await load();
    if (started === generation) {
        kept.set(key, { at: Date.now(), value });
        if (kept.size > MAX_ENTRIES) kept.delete(kept.keys().next().value); // the oldest goes
    }
    return value;
}
