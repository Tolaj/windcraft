// Tailwind plugins a project can switch on. A plugin is code, and every plugin documents its own way of being installed (an npm install, lines of CSS,
// a script tag), most of them written for a build. A page here has no build, so a plugin is a RECIPE: an ordered list of typed steps that a browser can
// run, written for one of two engines:
//   engine "3"   Tailwind 3.4 play CDN. A plugin is JavaScript: an official one the CDN loads itself, or a CommonJS plugin file loaded from a CDN and handed to
//                `tailwind.config.plugins` through a small `require` stand-in.
//   engine "4"   Tailwind 4 browser build. CSS first: `@import` lines and stylesheets; the browser build cannot run `@plugin` or config files.
// A remote `@import` does not work in the v4 browser build (the whole stylesheet silently fails), so a css4 step holds the CSS itself: the docs flow fetches an
// import and its own imports and writes them in (see plugin-import.js inlineImports).
// Steps: official3 {name} · plugin3 {src} · script {src} · stylesheet {href} · css4 {text}.
// Everything is loaded from https links at pinned versions; nothing is copied into this project. Pure functions: no page, no database.

const JSDELIVR = "https://cdn.jsdelivr.net/npm";
export const ENGINES = Object.freeze(["3", "4"]);
export const DEFAULT_ENGINE = "3";
export const TAILWIND4_SRC = `${JSDELIVR}/@tailwindcss/browser@4.1.11`;
export const OFFICIAL3 = Object.freeze(["forms", "typography", "container-queries"]);
export const MAX_RECIPES = 12, MAX_STEPS = 8, MAX_CSS = 40000;

/** The tested recipes. (aspect-ratio is left out on purpose: Tailwind 3.4 has aspect-* built in, and the old plugin replaces it with a padding trick that breaks it.
 *  v4 has container queries built in; the v4 browser build cannot run the official forms and typography plugins.) */
export const CATALOGUE = Object.freeze([
    { id: "forms", name: "Forms", about: "A clean base style for inputs, selects and checkboxes", engine: "3", steps: [{ type: "official3", name: "forms" }] },
    { id: "typography", name: "Typography", about: "prose classes for long text", engine: "3", steps: [{ type: "official3", name: "typography" }] },
    { id: "container-queries", name: "Container queries", about: "@container and @md: variants", engine: "3", steps: [{ type: "official3", name: "container-queries" }] },
    { id: "preline", name: "Preline 2", about: "Components and behaviour (dropdowns, accordions, tabs)", engine: "3", group: "Third party",
        steps: [{ type: "plugin3", src: `${JSDELIVR}/preline@2.7.0/plugin.js` }, { type: "script", src: `${JSDELIVR}/preline@2.7.0/dist/preline.js` }] },
    { id: "daisyui", name: "daisyUI 4", about: "Component classes like btn and card", engine: "3", group: "Third party", steps: [{ type: "stylesheet", href: `${JSDELIVR}/daisyui@4.12.14/dist/full.min.css` }] },
    { id: "daisyui5", name: "daisyUI 5", about: "Component classes like btn and card", engine: "4", group: "Third party",
        steps: [{ type: "stylesheet", href: `${JSDELIVR}/daisyui@5/daisyui.css` }, { type: "stylesheet", href: `${JSDELIVR}/daisyui@5/themes.css` }] },
]);
const BY_ID = new Map(CATALOGUE.map((r) => [r.id, r]));
/** Kept for the callers that only need the list. */
export const PLUGINS = CATALOGUE;

export const cleanEngine = (e) => (ENGINES.includes(String(e)) ? String(e) : DEFAULT_ENGINE);
/** The catalogue ids kept: only known recipes, once each, in catalogue order. */
export const cleanPlugins = (list) => (Array.isArray(list) ? CATALOGUE.filter((r) => list.includes(r.id)).map((r) => r.id) : []);

const SAFE_URL = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[^\s"'<>`\\]*$/;
export const isSafeUrl = (u) => typeof u === "string" && u.length <= 300 && SAFE_URL.test(u);
export const isStylesheet = (url) => /\.css(\?|#|$)/i.test(url);

/** One step, checked: a clean copy, or null when it is not one a page can run. */
export function cleanStep(s) {
    if (!s || typeof s !== "object") return null;
    if (s.type === "official3") return OFFICIAL3.includes(s.name) ? { type: "official3", name: s.name } : null;
    if (s.type === "plugin3") return isSafeUrl(s.src) ? { type: "plugin3", src: s.src } : null;
    if (s.type === "script") return isSafeUrl(s.src) ? { type: "script", src: s.src } : null;
    if (s.type === "stylesheet") return isSafeUrl(s.href) ? { type: "stylesheet", href: s.href } : null;
    if (s.type === "css4") {
        const text = typeof s.text === "string" ? s.text.trim() : "";
        return text && text.length <= MAX_CSS && !/<\/?style|<script/i.test(text) ? { type: "css4", text } : null;
    }
    return null;
}
const RECIPE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** A project's own recipe, checked: { id, name, engine, steps, on }, or null. */
export function cleanRecipe(r) {
    if (!r || typeof r !== "object" || !RECIPE_ID.test(String(r.id))) return null;
    const steps = (Array.isArray(r.steps) ? r.steps : []).map(cleanStep).filter(Boolean).slice(0, MAX_STEPS);
    if (!steps.length) return null;
    const name = String(r.name || r.id).replace(/[<>"`]/g, "").trim().slice(0, 40) || r.id;
    return { id: r.id, name, engine: cleanEngine(r.engine), steps, on: r.on !== false };
}
export function cleanRecipes(list) {
    const out = [];
    for (const r of Array.isArray(list) ? list : []) {
        const c = cleanRecipe(r);
        if (c && !out.some((o) => o.id === c.id) && !BY_ID.has(c.id)) out.push(c);
        if (out.length >= MAX_RECIPES) break;
    }
    return out;
}

// Links of the project's own, as the first version kept them: one script or stylesheet each. They become one-step recipes.
export function cleanCustom(list) {
    const out = [];
    for (const u of Array.isArray(list) ? list : []) { const url = typeof u === "string" ? u.trim() : ""; if (isSafeUrl(url) && !out.includes(url)) out.push(url); if (out.length >= 5) break; }
    return out;
}
export const linkRecipe = (url, engine = DEFAULT_ENGINE) => {
    let host = "link"; try { host = new URL(url).hostname; } catch { /* keep */ }
    const id = `link-${[...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;
    return { id, name: host, engine, steps: [isStylesheet(url) ? { type: "stylesheet", href: url } : { type: "script", src: url }], on: true };
};

/** The recipes a theme runs: the catalogue ones switched on and the project's own, for the theme's engine. */
export function activeRecipes(theme) {
    const t = theme || {}, engine = cleanEngine(t.engine);
    const own = cleanRecipes(t.recipes).filter((r) => r.on);
    return [...cleanPlugins(t.plugins).map((id) => BY_ID.get(id)), ...own].filter((r) => r.engine === engine);
}
const stepsOf = (theme, type) => activeRecipes(theme).flatMap((r) => r.steps.filter((s) => s.type === type));

/** The Tailwind script tag for a theme: the play CDN with the official plugins that are on (engine 3), or the v4 browser build (engine 4). */
export function tailwindTag(theme) {
    if (cleanEngine(theme && theme.engine) === "4") return `<script src="${TAILWIND4_SRC}"><\/script>`;
    const names = [...new Set(stepsOf(theme, "official3").map((s) => s.name))];
    return `<script src="https://cdn.tailwindcss.com${names.length ? `?plugins=${names.join(",")}` : ""}"><\/script>`;
}

/** The CSS the v4 recipes add (inside the `<style type="text/tailwindcss">` block); "" for engine 3. */
export const recipeCss4 = (theme) => (cleanEngine(theme && theme.engine) === "4" ? stepsOf(theme, "css4").map((s) => s.text).join("\n") : "");

// What `require("tailwindcss/plugin")` is in a build: enough of it for a plugin file that needs nothing else. Anything else it asks for fails loudly.
const SHIM = `<script data-wc-plugins>window.__wcP=[];window.module={exports:{}};window.require=function(n){if(n==="tailwindcss/plugin"){var p=function(h,c){return{handler:h,config:c}};p.withOptions=function(f){return function(o){var r=f(o);return{handler:r.handler,config:r.config}}};return p}throw new Error("A Tailwind plugin loaded from a link can only need tailwindcss/plugin, not "+n)}<\/script>`;

/** What a preview document's head needs after the config: each recipe's plugin files, scripts and stylesheets, in order. */
export function pluginHead(theme) {
    const engine = cleanEngine(theme && theme.engine), out = [];
    const recipes = activeRecipes(theme);
    if (engine === "3" && recipes.some((r) => r.steps.some((s) => s.type === "plugin3"))) {
        out.push(SHIM);
        recipes.forEach((r) => r.steps.filter((s) => s.type === "plugin3").forEach((s) => out.push(`<script src="${s.src}"><\/script><script data-wc-plugins>window.__wcP.push(module.exports);module.exports={}<\/script>`)));
        out.push(`<script data-wc-plugins>tailwind.config.plugins=window.__wcP<\/script>`);
    }
    recipes.forEach((r) => r.steps.forEach((s) => {
        if (s.type === "stylesheet") out.push(`<link rel="stylesheet" href="${s.href}">`);
        if (s.type === "script") out.push(`<script src="${s.src}"><\/script>`);
    }));
    return out.join("\n");
}
