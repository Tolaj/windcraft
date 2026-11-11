// Turning what a plugin's own documentation says into a recipe (see plugins.js), for a plugin that is not in the catalogue. Two ways in:
//   parseDocs(text)            the lines a doc page tells you to paste (CSS with @import / @source / @plugin, a script or link tag, an npm command)
//   guessFromPackage(info)     what an npm package contains (its files, its package.json), as the CDN lists it
// Both return a DRAFT: { engine, steps, notes, blocked, packages }. `blocked` says why something cannot run without a build; nothing is added until the draft has
// been tested (the sandbox test in the editor). Pure functions: the network is passed in.
import { isSafeUrl, isStylesheet, cleanStep, MAX_STEPS } from "./plugins.js";

const CDN = "https://cdn.jsdelivr.net/npm";
const PKG = String.raw`(@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*`;
const SPEC = new RegExp(String.raw`^(?:\.{0,2}\/)*(?:node_modules\/)?(${PKG})(\/.*)?$`, "i");

/** An `@import` specifier as a CDN link: "./node_modules/preline/variants.css" or "preline/variants.css" -> { url, pkg }; an https link stays; anything else null. */
export function cdnUrl(spec, versionOf = () => "latest") {
    if (/^https:\/\//i.test(spec)) return isSafeUrl(spec) ? { url: spec, pkg: null } : null;
    if (/^(\.\.?\/)+(?!node_modules)/.test(spec) || /^\//.test(spec)) return null; // the project's own file: not reachable from here
    const m = SPEC.exec(spec);
    if (!m || !m[3]) return null; // a bare package name has no file to load
    const pkg = m[1], v = versionOf(pkg);
    const url = `${CDN}/${pkg}${v && v !== "latest" ? `@${v}` : ""}${m[3]}`;
    return isSafeUrl(url) ? { url, pkg } : null;
}

/** Splits CSS into statements: `@import "x";`, or a rule with its balanced braces. Comments are dropped. */
function statements(text) {
    const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
    const out = []; let i = 0;
    while (i < src.length) {
        while (i < src.length && /\s/.test(src[i])) i++;
        if (i >= src.length) break;
        let j = i, depth = 0;
        for (; j < src.length; j++) {
            const c = src[j];
            if (c === "{") depth++;
            else if (c === "}") { depth--; if (depth <= 0) { j++; break; } }
            else if (c === ";" && depth === 0) { j++; break; }
        }
        out.push(src.slice(i, j).trim()); i = j;
    }
    return out.filter(Boolean);
}

/** Reads pasted documentation lines. `versionOf(pkg)` gives the version to pin a package at (a first pass can use the default and read `packages`). */
export function parseDocs(text, { versionOf = () => "latest" } = {}) {
    const steps = [], notes = [], blocked = [], packages = [];
    const seen = new Set(), add = (step) => { const c = cleanStep(step); if (c && !seen.has(JSON.stringify(c))) { seen.add(JSON.stringify(c)); steps.push(c); } };
    const raw = String(text || "");
    // tags first: <script src="…">, <link href="…">
    for (const m of raw.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) { if (isSafeUrl(m[1])) add({ type: "script", src: m[1] }); else notes.push(`Skipped a script link that is not a plain https link: ${m[1].slice(0, 60)}`); }
    for (const m of raw.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) { if (isSafeUrl(m[1])) add({ type: isStylesheet(m[1]) ? "stylesheet" : "script", ...(isStylesheet(m[1]) ? { href: m[1] } : { src: m[1] }) }); }
    let rest = raw.replace(/<script[\s\S]*?<\/script>|<script\b[^>]*>|<link\b[^>]*>/gi, "");
    rest = rest.split("\n").filter((l) => { if (/^\s*(\$\s*)?(npm|npx|yarn|pnpm|bun)\s/i.test(l)) { notes.push("Install commands are not needed here: the files are loaded from a link."); return false; } return true; }).join("\n");
    let css4 = false;
    for (const st of statements(rest)) {
        const line = st.replace(/\s+/g, " ");
        if (/^(npm|npx|yarn|pnpm|bun)\b/i.test(line) || /^\$/.test(line)) { notes.push("Install commands are not needed here: the files are loaded from a link."); continue; }
        if (/^@import\s+["']tailwindcss["']/i.test(line)) continue;
        if (/^@source\b/i.test(line)) { notes.push("`@source` tells a build which files to scan; the browser reads the page itself, so it is skipped."); continue; }
        if (/^@plugin\b/i.test(line)) { blocked.push("`@plugin` needs a build: the Tailwind 4 browser build can't run plugins. If the plugin also supports Tailwind 3, switch the project to engine 3 and add it from its package."); continue; }
        const im = /^@import\s+["']([^"']+)["']\s*([^;]*);?$/i.exec(line);
        if (im) {
            const hit = cdnUrl(im[1], versionOf);
            if (!hit) { blocked.push(`\`@import "${im[1].slice(0, 50)}"\` points at a file in your own project, which a page here can't reach.`); continue; }
            if (hit.pkg) packages.push(hit.pkg);
            add({ type: "css4", text: `@import "${hit.url}"${im[2] ? ` ${im[2].trim()}` : ""};` }); css4 = true; continue;
        }
        if (/require\(|module\.exports|tailwind\.config|^plugins\s*:/i.test(line)) { blocked.push("A `require(...)` in a config file needs a build. Use \"Find a package\" to try loading the plugin from its package."); continue; }
        if (/^@(custom-variant|theme|utility|variant|layer|keyframes|font-face)\b/i.test(line)) { add({ type: "css4", text: st }); css4 = true; continue; }
        if (/^@/.test(line)) { notes.push(`Skipped \`${line.slice(0, 40)}\`: not something a page here can use.`); continue; }
        if (line.length > 1) notes.push(`Skipped: ${line.slice(0, 50)}`);
    }
    if (packages.length && !steps.some((x) => x.type === "script")) notes.push(`This adds ${packages[0]}'s CSS only. If it also has a script, add a Script step, or use "Find a package".`);
    if (steps.length > MAX_STEPS) { steps.length = MAX_STEPS; notes.push(`Only the first ${MAX_STEPS} steps are kept.`); }
    return { engine: css4 ? "4" : null, steps, notes, blocked, packages: [...new Set(packages)], name: packages[0] ? packages[0].replace(/^@[^/]+\//, "") : "" };
}

const range4 = (r) => /(^|[\s|^~>=<])4(\.|\s|$|x|\.\*)/.test(String(r || "")) && !/(^|[\s|^~>=<])3\./.test(String(r || ""));
const BROWSER_JS = [/dist\/index\.global\.js$/, /dist\/[^/]*\.global\.js$/, /dist\/[^/]*\.iife\.js$/, /dist\/[^/]*\.min\.js$/, /dist\/[^/]*\.umd\.js$/, /dist\/[^/]*\.js$/];
const pick = (files, patterns, skip = /(\.map|\.d\.ts|\.esm|\.mjs|\.cjs|chunk|\/types?\/)/i) => { for (const p of patterns) { const f = files.find((x) => p.test(x) && !skip.test(x)); if (f) return f; } return null; };

/**
 * What an npm package offers, as a draft recipe. `info`: { name, version, files: ["/dist/a.js", …], pkg: package.json, mainSource?: the text of its plugin file }.
 * A plugin file that needs anything but `tailwindcss/plugin` is reported as blocked (it was written for a build).
 */
export function guessFromPackage(info, { prefer = "3" } = {}) {
    const { name, version, files = [], pkg = {}, mainSource = "" } = info;
    const base = `${CDN}/${name}@${version}`, steps = [], notes = [], blocked = [];
    const peer = (pkg.peerDependencies && pkg.peerDependencies.tailwindcss) || (pkg.dependencies && pkg.dependencies.tailwindcss) || "";
    const wants4 = range4(peer) || /tailwindcss\s*4|tailwind(css)?-?v?4/i.test(`${pkg.description || ""} ${(pkg.keywords || []).join(" ")}`);
    const pluginFile = files.find((f) => /^\/(plugin|tailwind-plugin)(\/index)?\.c?js$/.test(f)) || files.find((f) => /^\/src\/(plugin|index)\.c?js$/.test(f) && /tailwindcss\/plugin/.test(mainSource));
    const variantsFile = files.find((f) => f === "/variants.css") || files.find((f) => f === "/theme.css");
    // which engine: what the package says it needs; with both a plugin file and CSS variants it supports both, so the project's engine decides
    const engine = pluginFile && variantsFile ? (prefer === "4" ? "4" : "3") : wants4 || (variantsFile && !pluginFile) ? "4" : "3";
    if (pluginFile && variantsFile) notes.push("This package supports both Tailwind 3 and 4; the steps are for the project's engine.");
    if (engine === "3" && pluginFile) {
        const requires = [...mainSource.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).filter((r) => r !== "tailwindcss/plugin" && !r.startsWith("."));
        if (requires.length) blocked.push(`Its plugin file also needs ${[...new Set(requires)].slice(0, 3).join(", ")}, which only a build provides.`);
        else steps.push({ type: "plugin3", src: `${base}${pluginFile}` });
    }
    const variants = variantsFile;
    if (engine === "4" && variants) steps.push({ type: "css4", text: `@import "${base}${variants}";` });
    const css = pick(files.filter((f) => f !== "/variants.css" && f !== "/theme.css"), [/dist\/[^/]*full[^/]*\.min\.css$/, /dist\/[^/]*\.min\.css$/, new RegExp(`dist\\/${name.replace(/^@[^/]+\//, "")}\\.css$`), /dist\/[^/]*\.css$/, /^\/[^/]*\.css$/]);
    if (css) steps.push({ type: "stylesheet", href: `${base}${css}` });
    const own = name.replace(/^@[^/]+\//, "").replace(/[.+*?^${}()|[\]\\]/g, "\\$&");
    const js = pick(files, [new RegExp(`dist\\/${own}(\\.min)?\\.js$`), new RegExp(`(^|\\/)${own}(\\.min)?\\.js$`), ...BROWSER_JS]);
    if (js) steps.push({ type: "script", src: `${base}${js}` });
    if (!steps.length && !blocked.length) blocked.push("No file in this package can be loaded by a page without a build.");
    if (steps.length) notes.push(`Guessed from the files in ${name}@${version}; read the steps and test them.`);
    if (engine === "4" && /@plugin|plugin/i.test(String(pkg.description || "")) && !steps.length) blocked.push("It is a Tailwind 4 plugin, and the browser build can't run plugins.");
    return { engine, steps: steps.slice(0, MAX_STEPS), notes, blocked, packages: [name], name: name.replace(/^@[^/]+\//, "") };
}

/** Looks a package up on the CDN. `fetchFn(url, "json"|"text")` is passed in (the page's fetch). Rejects with a plain message. */
export async function fetchPackage(name, fetchFn) {
    if (!new RegExp(`^${PKG}$`, "i").test(name)) throw new Error("That isn't an npm package name.");
    const resolved = await fetchFn(`https://data.jsdelivr.com/v1/packages/npm/${name}/resolved`, "json").catch(() => null);
    const version = resolved && resolved.version;
    if (!version) throw new Error(`Couldn't find "${name}" on npm.`);
    const [flat, pkg] = await Promise.all([
        fetchFn(`https://data.jsdelivr.com/v1/packages/npm/${name}@${version}?structure=flat`, "json").catch(() => null),
        fetchFn(`${CDN}/${name}@${version}/package.json`, "json").catch(() => ({})),
    ]);
    const files = ((flat && flat.files) || []).map((f) => f.name);
    const mainFile = files.find((f) => /^\/(plugin|tailwind-plugin)(\/index)?\.c?js$/.test(f)) || null;
    const mainSource = mainFile ? await fetchFn(`${CDN}/${name}@${version}${mainFile}`, "text").catch(() => "") : "";
    return { name, version, files, pkg: pkg || {}, mainSource };
}

const MAX_INLINE_FILES = 40, MAX_INLINE_BYTES = 36000;
/**
 * Writes a stylesheet's `@import`s into it, recursively (relative paths resolved against the file they are in). The v4 browser build can't load a remote
 * `@import`, so a recipe keeps the CSS itself. `fetchFn(url, "text")` is passed in. Rejects with a plain message when a file is missing or it grows too large.
 */
export async function inlineCss(url, fetchFn) {
    const seen = new Set(); let bytes = 0;
    async function load(u, depth) {
        if (seen.has(u)) return "";
        if (seen.size >= MAX_INLINE_FILES || depth > 4) throw new Error("That stylesheet imports too many files to include.");
        seen.add(u);
        const text = await fetchFn(u, "text").catch(() => { throw new Error(`Couldn't load ${u}`); });
        bytes += text.length;
        if (bytes > MAX_INLINE_BYTES) throw new Error("That stylesheet is too large to include here.");
        let out = "", last = 0;
        const re = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*([^;]*);/g;
        for (const m of text.matchAll(re)) {
            const target = new URL(m[1], u).href;
            out += text.slice(last, m.index) + (/^https:\/\//.test(target) ? await load(target, depth + 1) : "");
            last = m.index + m[0].length;
        }
        return out + text.slice(last);
    }
    return (await load(url, 0)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Replaces each css4 step that is only a remote `@import` with the CSS itself. Returns { steps, notes, failed } (a step that can't be fetched is kept out and named). */
export async function inlineImports(steps, fetchFn) {
    const out = [], notes = [], failed = [];
    for (const s of steps) {
        const m = s.type === "css4" && /^@import\s+["']?(https:\/\/[^"';\s]+)["']?\s*;?$/i.exec(s.text.trim());
        if (!m) { out.push(s); continue; }
        try { out.push({ type: "css4", text: `/* ${m[1]} */\n${await inlineCss(m[1], fetchFn)}` }); notes.push(`Included the CSS from ${m[1].split("/npm/")[1] || m[1]}, with the files it imports (the Tailwind 4 browser build can't load a remote @import).`); }
        catch (e) { failed.push(e.message); }
    }
    return { steps: out, notes, failed };
}
