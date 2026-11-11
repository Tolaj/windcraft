// A page's own Tailwind changes (`theme.extend`, JSON), over the project's config file. The editor shows Tailwind's defaults with the page's changes laid over them,
// and stores only what differs from the defaults. (The project's file is real JavaScript or CSS, see config-file.js; it is run in the preview, not read here.)
import { TAILWIND_DEFAULTS, withDefaults, onlyChanges } from "./tailwind-defaults.js";
import { configError } from "./theme.js";

const parse = (text) => { try { const v = typeof text === "string" ? JSON.parse(text || "{}") : text; return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };

/** The JSON text the page's editor opens with: the defaults, with what the page changes over them. */
export const configText = (pageConfig) => JSON.stringify(withDefaults(parse(pageConfig)), null, 2);

/** What to store for the text typed in the page's editor: { stored } (JSON text of the changes, "" for none) or { error }. */
export function configStore(text) {
    const error = configError(text);
    if (error) return { error };
    const changes = onlyChanges(parse(text), TAILWIND_DEFAULTS);
    return { stored: Object.keys(changes).length ? JSON.stringify(changes) : "" };
}

/** The top-level sections a stored config changes (for "changed on this page: screens, colors"). */
export const changedSections = (config) => Object.keys(parse(config));
