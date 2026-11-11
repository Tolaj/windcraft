// A project's Tailwind config as a real file, the way every Tailwind project has one:
//   Tailwind 3   tailwind.config.js   `module.exports = { theme: { extend: {...} }, plugins: [require("@tailwindcss/typography")] }`
//   Tailwind 4   global.css           `@import "tailwindcss"; @plugin "..."; @source "..."; @theme { ... }`
// Nothing here installs anything: a page has no build. The file is run in the preview as it is written, and the packages it names are loaded from a CDN. What can
// be loaded that way is worked out when the file is applied (config-resolve.js) and kept as a "lock" next to the file: { "<specifier>": { url } | { css } }.
//   plugins the Tailwind CDN carries itself (typography, forms, container queries)  -> `?plugins=`
//   a plugin that is one CommonJS file needing only `tailwindcss/plugin`            -> its file, loaded before the config runs
//   `tailwindcss/colors` and `tailwindcss/defaultTheme`                             -> Tailwind's defaults, built in
//   v4 `@import "pkg/file.css"`                                                     -> the CSS written in (the v4 browser build can't load a remote @import)
//   anything that needs a build (`@plugin` in v4, a plugin that requires other packages) -> a clear message, and it is left out
// Pure functions: no page, no network.
import { TAILWIND_DEFAULTS } from "./tailwind-defaults.js";

export const ENGINES = Object.freeze(["3", "4"]);
export const DEFAULT_ENGINE = "3";
export const cleanEngine = (e) => (ENGINES.includes(String(e)) ? String(e) : DEFAULT_ENGINE);
export const TAILWIND4_SRC = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11";
export const MAX_FILE = 60000;
export const OFFICIAL = Object.freeze({ "@tailwindcss/typography": "typography", "@tailwindcss/forms": "forms", "@tailwindcss/container-queries": "container-queries" });
export const BUILT_IN = Object.freeze(["tailwindcss/plugin", "tailwindcss/colors", "tailwindcss/defaultTheme"]);

/** A page's own file, the same kind as the project's, added on top of it: { js, css, lock }. Anything invalid is dropped. */
export const cleanTw = (t) => ({ js: cleanFile(t && t.js), css: cleanFile(t && t.css), lock: cleanLock(t && t.lock) });
export const hasTw = (t) => Boolean(t && (t.js || t.css));

export const TEMPLATES = Object.freeze({
    "3": { name: "tailwind.config.js", text: `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\n` },
    "4": { name: "global.css", text: `@import "tailwindcss";\n` },
});

/** The same files for one page: they extend the project's. */
export const PAGE_TEMPLATES = Object.freeze({
    "3": { name: "tailwind.config.js (this page)", text: `/** Changes for this page only, on top of the project's config. */\nmodule.exports = {\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\n` },
    "4": { name: "global.css (this page)", text: `/* Changes for this page only, on top of the project's CSS. */\n` },
});

/** The file text kept: a string within the size limit, else "". */
export const cleanFile = (t) => (typeof t === "string" && t.length <= MAX_FILE ? t : "");
/** Specifier -> { url } | { css }, each checked. */
export function cleanLock(lock) {
    const out = {};
    if (!lock || typeof lock !== "object") return out;
    let size = 0; // a project can only hold so much inlined CSS: the whole theme travels in one request and every page load
    for (const [spec, v] of Object.entries(lock).slice(0, 40)) {
        if (!/^[@A-Za-z0-9.][\w@./~-]{0,120}$/.test(spec) || !v || typeof v !== "object") continue;
        if (typeof v.url === "string" && /^https:\/\/[A-Za-z0-9.-]+\/[^\s"'<>`\\]{1,300}$/.test(v.url)) out[spec] = { url: v.url };
        else if (typeof v.css === "string" && v.css.length <= MAX_FILE && size + v.css.length <= 200000 && !/<\/?style|<script/i.test(v.css)) { out[spec] = { css: v.css }; size += v.css.length; }
    }
    return out;
}

// ── Tailwind 3: tailwind.config.js ────────────────────────────────────────────────────────────────────────────────────────────

/** ES module syntax (import, export default, TypeScript annotations) as CommonJS, line for line, so line numbers stay true. */
export function toCommonJs(text) {
    return String(text)
        .replace(/^[ \t]*import\s+type\b[^;\n]*;?[ \t]*$/gm, "")
        .replace(/^([ \t]*)import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s+(['"][^'"\n]+['"])[ \t]*;?/gm, "$1const $2 = require($3);")
        .replace(/^([ \t]*)import\s+(\{[^}\n]*\})\s+from\s+(['"][^'"\n]+['"])[ \t]*;?/gm, "$1const $2 = require($3);")
        .replace(/^([ \t]*)import\s+(['"][^'"\n]+['"])[ \t]*;?/gm, "$1require($2);")
        .replace(/\bexport\s+default\b/, "module.exports =")
        .replace(/\s+satisfies\s+[A-Za-z_$][\w$.<>]*/g, "")
        .replace(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.<>]*\s*=/g, "$1 $2 =");
}
const blank = (m) => m.replace(/[^\n]/g, " ");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

/** Every `require("x")` in a config file: [{ spec, line }] (1-based). */
export function requiresOf(text) {
    const src = stripComments(toCommonJs(text)), out = [];
    src.split("\n").forEach((l, i) => { for (const m of l.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)) out.push({ spec: m[2], line: i + 1 }); });
    return out;
}
export const kindOf = (spec) => (OFFICIAL[spec] ? "official" : BUILT_IN.includes(spec) ? "builtin" : /^\.{0,2}\//.test(spec) ? "relative" : "package");
/** The Tailwind CDN's own plugins the file asks for: ["typography", ...]. */
export const officialsOf = (text) => [...new Set(requiresOf(text).filter((r) => kindOf(r.spec) === "official").map((r) => OFFICIAL[r.spec]))];

/** The Tailwind script tag: the 3.4 play CDN (with the official plugins the file uses) or the v4 browser build. */
export function tailwindTag(theme) {
    if (cleanEngine(theme && theme.engine) === "4") return `<script src="${TAILWIND4_SRC}"><\/script>`;
    const names = [...new Set([...officialsOf((theme && theme.configJs) || TEMPLATES["3"].text), ...officialsOf((theme && theme.page && theme.page.js) || "")])];
    return `<script src="https://cdn.tailwindcss.com${names.length ? `?plugins=${names.join(",")}` : ""}"><\/script>`;
}

const D = TAILWIND_DEFAULTS;
const RUNTIME = (needsDefaults) => `<script data-wc-config>window.__wcMods={};${needsDefaults ? `window.__wcDefaults=${JSON.stringify({ colors: D.colors, defaultTheme: { screens: D.screens, fontFamily: D.fontFamily, fontSize: D.fontSize, spacing: D.spacing, borderRadius: D.borderRadius, boxShadow: D.boxShadow } })};` : ""}window.module={exports:{}};window.__wcReq=function(n){if(Object.prototype.hasOwnProperty.call(__wcMods,n))return __wcMods[n];if(n==="tailwindcss/plugin"){var p=function(h,c){return{handler:h,config:c}};p.withOptions=function(f){return function(o){var r=f(o);return{handler:r.handler,config:r.config}}};return p}if(n==="tailwindcss/colors")return(window.__wcDefaults||{}).colors||{};if(n==="tailwindcss/defaultTheme")return(window.__wcDefaults||{}).defaultTheme||{};if(${JSON.stringify(Object.keys(OFFICIAL))}.indexOf(n)>-1)return{handler:function(){}};console.error("The config needs "+n+", which a page can't load without a build.");return{handler:function(){}}};window.require=__wcReq;function __wcMerge(a,b){var o={};for(var k in a)o[k]=a[k];for(var k in b){var x=a[k],y=b[k];o[k]=k==="plugins"&&Array.isArray(x)&&Array.isArray(y)?x.concat(y):x&&y&&typeof x==="object"&&typeof y==="object"&&!Array.isArray(x)&&!Array.isArray(y)?__wcMerge(x,y):y}return o}<\/script>`;
const safeScript = (s) => String(s).replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** What a Tailwind 3 preview needs after the CDN: the packages the locks hold, then the project's config file and (over it) the page's, each run as written, over the theme's own settings (`base`). */
export function configHead3(theme, base) {
    const project = (theme && theme.configJs) || TEMPLATES["3"].text, page = (theme && theme.page && theme.page.js) || "";
    const lock = { ...cleanLock(theme && theme.lock), ...cleanLock(theme && theme.page && theme.page.lock) }, out = [];
    out.push(RUNTIME(/tailwindcss\/(colors|defaultTheme)/.test(project + page)));
    for (const [spec, v] of Object.entries(lock)) if (v.url) out.push(`<script src="${v.url}"><\/script><script data-wc-config>__wcMods[${JSON.stringify(spec)}]=module.exports;module.exports={}<\/script>`);
    const layer = (file, label) => `(function(){var module={exports:{}},exports=module.exports,require=window.__wcReq;try{\n${safeScript(toCommonJs(file))}\n}catch(e){console.error(${JSON.stringify(label)}+e.message)}var u=module.exports;if(u&&u.__esModule&&u.default)u=u.default;__c=__wcMerge(__c,u||{})})();`;
    out.push(`<script data-wc-theme>(function(){var __c=${JSON.stringify(base).replace(/</g, "\\u003c")};${layer(project, "tailwind.config.js: ")}${page ? layer(page, "tailwind.config.js (this page): ") : ""}tailwind.config=__c})()<\/script>`);
    return out.join("\n");
}

// ── Tailwind 4: global.css ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The CSS file as the v4 browser build can use it: `@import "tailwindcss"`, `@source` and `@plugin` lines dropped, other imports written in from the lock. */
export function css4Of(text, lock) {
    const l = cleanLock(lock);
    return String(text || "")
        .replace(/^[ \t]*@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;[ \t]*$/gm, (m, spec) => (/^tailwindcss(\/|$)/.test(spec) ? "" : l[spec] && l[spec].css ? `/* ${spec} */\n${l[spec].css}` : `/* not loaded: ${spec} */`))
        .replace(/^[ \t]*@(source|plugin)\b[^;]*;[ \t]*$/gm, "")
        .replace(/<\/(style)/gi, "<\\/$1");
}
/** `@plugin`, `@source` and `@import` lines of a v4 file: [{ kind, spec, line }]. */
export function directivesOf(text) {
    const out = [];
    String(text || "").split("\n").forEach((l, i) => {
        const m = /^\s*@(import|plugin|source)\s+(?:url\(\s*)?["']([^"']+)["']/.exec(l);
        if (m) out.push({ kind: m[1], spec: m[2], line: i + 1 });
    });
    return out;
}

// ── Leaving the editor: the same config as files for a real project ─────────────────────────────────────────────────────────────

const versionIn = (url) => (/@(\d+\.\d+\.\d+)(?:\/|$)/.exec(url || "") || [])[1];
/** The packages a config names, as install arguments: official plugins by name, others pinned at the version the editor used. */
export function packagesOf(text, lock) {
    const l = cleanLock(lock), out = [];
    for (const { spec } of requiresOf(text)) {
        const kind = kindOf(spec);
        if (kind === "official") out.push(spec);
        else if (kind === "package") { const pkg = spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/"), v = versionIn(l[spec] && l[spec].url); out.push(v ? `${pkg}@${v}` : pkg); }
    }
    return [...new Set(out)];
}
/** v4 `@import "./node_modules/pkg/x.css"` lines name packages too. */
export const packages4Of = (text) => [...new Set(directivesOf(text).filter((d) => d.kind === "import" && /^(\.\/)?node_modules\//.test(d.spec)).map((d) => d.spec.replace(/^(\.\/)?node_modules\//, "").split("/").slice(0, d.spec.replace(/^(\.\/)?node_modules\//, "").startsWith("@") ? 2 : 1).join("/")))];

/** The project's Tailwind config (and, if the theme carries one, the page's) as the files to copy into a real project, with the install command. `theme` is normalized, with `page`. */
export function toTailwindConfig(theme, themeChoices) {
    const t = theme || {}, engine = cleanEngine(t.engine), page = t.page || {};
    const out = [`// Tailwind ${engine} config from Windcraft. Copy these into your project and run the install command.`];
    if (engine === "3") {
        const project = t.configJs || TEMPLATES["3"].text, pageJs = page.js || "";
        const pkgs = [...new Set([...packagesOf(project, t.lock), ...packagesOf(pageJs, page.lock)])];
        out.push(`\n// npm install -D tailwindcss@3 ${pkgs.join(" ")}`.trimEnd());
        if (themeChoices) out.push(`\n// ── Theme: brand colours, font and corners from the project's Theme settings. Merge into theme.extend of the file below. ──\n// theme.extend = ${JSON.stringify(themeChoices, null, 2).replace(/\n/g, "\n// ")}`);
        out.push(`\n// ── tailwind.config.js (whole project) ──\n${project.trimEnd()}`);
        if (pageJs) out.push(`\n// ── This page's additions. Merge into the file above (its plugins and theme.extend add to the project's). ──\n${pageJs.trimEnd()}`);
    } else {
        const project = t.configCss || TEMPLATES["4"].text, pageCss = page.css || "";
        const pkgs = [...new Set([...packages4Of(project), ...packages4Of(pageCss)])];
        out.push(`\n/* npm install -D tailwindcss@4 @tailwindcss/postcss ${pkgs.join(" ")} */`.replace(/ \*\/$/, pkgs.length ? " */" : " */"));
        out.push(`\n/* ── global.css (whole project) ── */\n${project.trimEnd()}`);
        if (pageCss) out.push(`\n/* ── This page's additions. Add after the file above. ── */\n${pageCss.trimEnd()}`);
    }
    return out.join("\n") + "\n";
}

/** One paragraph for an AI that writes designs for the project: which Tailwind, which plugins, which custom names exist, so its classes work here. `theme` is normalized. */
export function describeSetup(theme) {
    const t = theme || {}, engine = cleanEngine(t.engine);
    const file = engine === "4" ? t.configCss || "" : t.configJs || "";
    const plugins = engine === "3" ? [...new Set(requiresOf(file).filter((r) => kindOf(r.spec) !== "builtin").map((r) => OFFICIAL[r.spec] || r.spec))] : [];
    const lines = [`Tailwind setup: version ${engine}${engine === "3" ? " (the 3.4 play CDN)" : " (the v4 browser build: use v4 class names, for example shadow-xs, rounded-xs, bg-linear-to-r, and no @plugin)"}.`];
    lines.push(plugins.length ? `Plugins in the project's config: ${plugins.join(", ")}. Their classes work (for example prose for typography).` : "No plugins are configured, so classes from plugins (prose, form-input, @container) will not work.");
    lines.push(`Theme classes: brand-50 to brand-950 (brand colour ${t.brand || "#4f46e5"}), gray-* is the ${t.gray || "slate"} palette, font-sans is ${t.font || "Inter"}. Use these instead of hard-coded colours.`);
    if (file.trim() && file.trim() !== TEMPLATES[engine].text.trim()) lines.push(`The project's ${engine === "4" ? "global.css" : "tailwind.config.js"} (use any names it defines):\n${file.trim().slice(0, 1500)}`);
    return lines.join("\n");
}
