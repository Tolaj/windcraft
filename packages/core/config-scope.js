// One setting, two levels (like CSS): Tailwind's defaults, then the project's config, then a page's own changes. This is the one place that
// works out what an editor shows for a level and what it stores from it; the project page (Config tab) and the editor (a page's tab) both use it.
//   project level   shown: defaults + project's changes    stored: only what differs from Tailwind's defaults
//   page level      shown: defaults + project + page       stored: only what differs from the project's (defaults + project's changes)
import { TAILWIND_DEFAULTS, withDefaults, onlyChanges } from "./tailwind-defaults.js";
import { configError, cleanConfig, pageTheme } from "./theme.js";

const parse = (text) => { try { const v = typeof text === "string" ? JSON.parse(text || "{}") : text; return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };

/** The JSON text a level's editor opens with. `projectConfig` and `pageConfig` are what is stored (JSON text or objects); pass no `pageConfig` for the project level. */
export function configText(projectConfig, pageConfig) {
    const base = pageConfig === undefined ? parse(projectConfig) : JSON.parse(pageTheme({ config: cleanConfig(parse(projectConfig)) }, pageConfig).config || "{}");
    return JSON.stringify(withDefaults(base), null, 2);
}

/** What to store for the text typed in a level's editor: { stored } (JSON text of the changes, "" for none) or { error }. `projectConfig` is given for the page level only. */
export function configStore(text, projectConfig) {
    const error = configError(text);
    if (error) return { error };
    const against = projectConfig === undefined ? TAILWIND_DEFAULTS : withDefaults(parse(projectConfig)); // what the level inherits
    const changes = onlyChanges(parse(text), against);
    return { stored: Object.keys(changes).length ? JSON.stringify(changes) : "" };
}

/** The top-level sections a stored config changes (for "changed on this page: screens, colors"). */
export const changedSections = (config) => Object.keys(parse(config));
