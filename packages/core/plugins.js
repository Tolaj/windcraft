// Tailwind plugins a project can switch on. A plugin is code, so it is not part of the JSON config: a project keeps a list of ids (and, optionally, links
// of its own), and a preview document adds what each needs after Tailwind itself. Three kinds, by how they reach a page that has no build step:
//   official   the play CDN loads these itself (`?plugins=forms,typography,...`)
//   plugin     a Tailwind plugin published as one CommonJS file: loaded from a CDN and handed to `tailwind.config.plugins`, through a tiny `require` stand-in
//   css        a stylesheet (and maybe a script) that styles the classes on its own
// Everything is loaded from jsdelivr at pinned versions; nothing is copied into this project. Pure functions: no page, no database.

const JSDELIVR = "https://cdn.jsdelivr.net/npm";

/** The catalogue. (aspect-ratio is left out on purpose: Tailwind 3.4 has aspect-* built in, and the old plugin replaces it with a padding trick that breaks it.) */
export const PLUGINS = Object.freeze([
    { id: "forms", name: "Forms", about: "A clean base style for inputs, selects and checkboxes", kind: "official" },
    { id: "typography", name: "Typography", about: "prose classes for long text", kind: "official" },
    { id: "container-queries", name: "Container queries", about: "@container and @md: variants", kind: "official" },
    { id: "preline", name: "Preline", about: "Components and behaviour (dropdowns, accordions, tabs)", kind: "plugin", group: "Third party",
        plugin: `${JSDELIVR}/preline@2.7.0/plugin.js`, script: `${JSDELIVR}/preline@2.7.0/dist/preline.js` },
    { id: "daisyui", name: "daisyUI", about: "Component classes like btn and card", kind: "css", group: "Third party", css: `${JSDELIVR}/daisyui@4.12.14/dist/full.min.css` },
]);
const BY_ID = new Map(PLUGINS.map((p) => [p.id, p]));
export const MAX_CUSTOM = 5;

/** The ids kept: only known plugins, once each, in catalogue order. */
export const cleanPlugins = (list) => (Array.isArray(list) ? PLUGINS.filter((p) => list.includes(p.id)).map((p) => p.id) : []);

const SAFE_URL = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[^\s"'<>`\\]*$/;
/** Links of the project's own: https only, no quotes or angle brackets, at most 5 of up to 300 characters. */
export function cleanCustom(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const u of list) {
        const url = typeof u === "string" ? u.trim() : "";
        if (url.length <= 300 && SAFE_URL.test(url) && !out.includes(url)) out.push(url);
        if (out.length >= MAX_CUSTOM) break;
    }
    return out;
}
export const isStylesheet = (url) => /\.css(\?|#|$)/i.test(url);

/** The error for a link typed in the "add your own" box, or "". */
export function customError(url, existing = []) {
    const u = String(url || "").trim();
    if (!u) return "Paste a link to a script or a stylesheet.";
    if (!/^https:\/\//i.test(u)) return "It must start with https://";
    if (!SAFE_URL.test(u) || u.length > 300) return "That doesn't look like a plain link.";
    if (existing.includes(u)) return "That link is already added.";
    if (existing.length >= MAX_CUSTOM) return `At most ${MAX_CUSTOM} links.`;
    return "";
}

/** The Tailwind script tag for a theme: the play CDN, with the official plugins the theme has on. */
export function tailwindTag(theme) {
    const official = cleanPlugins(theme && theme.plugins).filter((id) => BY_ID.get(id).kind === "official");
    return `<script src="https://cdn.tailwindcss.com${official.length ? `?plugins=${official.join(",")}` : ""}"><\/script>`;
}

// What `require("tailwindcss/plugin")` is in a build: enough of it for a plugin file that needs nothing else. Anything else it asks for fails loudly.
const SHIM = `<script data-wc-plugins>window.__wcP=[];window.module={exports:{}};window.require=function(n){if(n==="tailwindcss/plugin"){var p=function(h,c){return{handler:h,config:c}};p.withOptions=function(f){return function(o){var r=f(o);return{handler:r.handler,config:r.config}}};return p}throw new Error("A Tailwind plugin loaded from a link can only need tailwindcss/plugin, not "+n)}<\/script>`;

/** What a preview document's head needs after the config: each switched-on plugin's files, then the project's own links. */
export function pluginHead(theme) {
    const ids = cleanPlugins(theme && theme.plugins).map((id) => BY_ID.get(id)).filter((p) => p.kind !== "official");
    const custom = cleanCustom(theme && theme.customPlugins);
    if (!ids.length && !custom.length) return "";
    const out = [];
    const cjs = ids.filter((p) => p.kind === "plugin");
    if (cjs.length) {
        out.push(SHIM);
        cjs.forEach((p) => out.push(`<script src="${p.plugin}"><\/script><script data-wc-plugins>window.__wcP.push(module.exports);module.exports={}<\/script>`));
        out.push(`<script data-wc-plugins>tailwind.config.plugins=window.__wcP<\/script>`);
    }
    ids.forEach((p) => { if (p.css) out.push(`<link rel="stylesheet" href="${p.css}">`); if (p.script) out.push(`<script src="${p.script}"><\/script>`); });
    custom.forEach((u) => out.push(isStylesheet(u) ? `<link rel="stylesheet" href="${u}">` : `<script src="${u}"><\/script>`));
    return out.join("\n");
}
