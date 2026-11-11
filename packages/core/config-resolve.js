// What a config file needs from the network, worked out when it is applied (a page can't run `npm install`). `resolveFile` reads the file, finds each package it
// names, looks it up on the jsdelivr CDN and reports line by line: loadable (and where from), built in, or "needs a build" with the reason. The answer is a lock
// ({ specifier: { url } | { css } }, see config-file.js) plus diagnostics ([{ line, level: "ok" | "warn" | "error", message }]). `fetchFn(url, "json" | "text")` is the page's fetch.
import { requiresOf, kindOf, directivesOf, cleanEngine, OFFICIAL, MAX_FILE } from "./config-file.js";

const CDN = "https://cdn.jsdelivr.net/npm";
const API = "https://data.jsdelivr.com/v1/packages/npm";
const PKG = /^(@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/i;

/** "@scope/pkg/sub/path" -> { pkg: "@scope/pkg", sub: "sub/path" } */
export function splitSpec(spec) {
    const parts = String(spec).replace(/^(\.\/)?node_modules\//, "").split("/");
    const n = parts[0].startsWith("@") ? 2 : 1;
    return { pkg: parts.slice(0, n).join("/"), sub: parts.slice(n).join("/") };
}

async function versionOf(pkg, fetchFn) {
    const r = await fetchFn(`${API}/${pkg}/resolved`, "json").catch(() => null);
    if (!r || !r.version) throw new Error(`Couldn't find "${pkg}" on npm.`);
    return r.version;
}
const stripDot = (p) => String(p).replace(/^\.\//, "");
const fromExports = (ex, key) => { const e = ex && (ex[key] || (key === "." && typeof ex === "string" ? ex : null)); if (!e) return null; if (typeof e === "string") return e; return e.require || e.default || e.node || null; };

/** The file of an npm package a config means by `require("spec")`: { url, version, note? }, or throws a plain message. A project's package.json would pin a version; with
 *  none here, the newest version is tried first, then the newest of each older major (Preline's current version, for one, is for Tailwind 4 and has no plugin file). */
export async function resolveRequire(spec, fetchFn) {
    const { pkg, sub } = splitSpec(spec);
    if (!PKG.test(pkg)) throw new Error(`"${spec}" isn't an npm package name.`);
    const latest = await versionOf(pkg, fetchFn);
    try { return await fromVersion(spec, pkg, sub, latest, fetchFn); }
    catch (first) {
        if (!/Couldn't (find|load)|ES module/.test(first.message)) throw first;
        const list = await fetchFn(`${API}/${pkg}`, "json").catch(() => null);
        const seen = new Set([latest.split(".")[0]]);
        const older = ((list && list.versions) || []).map((v) => v.version).filter((v) => /^\d+\.\d+\.\d+$/.test(v) && !seen.has(v.split(".")[0]) && Number(v.split(".")[0]) < Number(latest.split(".")[0]));
        for (const v of older) { const major = v.split(".")[0]; if (seen.has(major)) continue; seen.add(major); try { const r = await fromVersion(spec, pkg, sub, v, fetchFn); return { ...r, note: `${latest} (the newest) doesn't have it, so ${v} is used` }; } catch { /* next major */ } }
        throw first;
    }
}

async function fromVersion(spec, pkg, sub, version, fetchFn) {
    const [flat, pj] = await Promise.all([fetchFn(`${API}/${pkg}@${version}?structure=flat`, "json").catch(() => ({ files: [] })), fetchFn(`${CDN}/${pkg}@${version}/package.json`, "json").catch(() => ({}))]);
    const files = new Set(((flat && flat.files) || []).map((f) => f.name));
    const key = sub ? `./${sub}` : ".";
    const cands = [fromExports(pj.exports, key), sub ? `${sub}` : pj.main, sub ? `${sub}.js` : "index.js", sub ? `${sub}/index.js` : null, sub ? `${sub}.cjs` : "plugin.js"].filter(Boolean).map(stripDot);
    const file = cands.find((c) => files.has(`/${c}`)) || (files.size ? null : cands[0]);
    if (!file) throw new Error(`Couldn't find ${sub ? `"${sub}" in` : "the main file of"} ${pkg}@${version}.`);
    const text = await fetchFn(`${CDN}/${pkg}@${version}/${file}`, "text").catch(() => { throw new Error(`Couldn't load ${file} from ${pkg}@${version}.`); });
    if (text.length > 300000) throw new Error(`${file} is too large to load here.`);
    if (/^\s*(import|export)\s/m.test(text) && !/module\.exports|\bexports\./.test(text)) throw new Error(`${pkg} ships this as an ES module, not a plugin file a page can load. Check whether it has a CommonJS build.`);
    const others = [...new Set([...text.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).filter((r) => r !== "tailwindcss/plugin"))];
    if (others.length) throw new Error(`Needs a build: ${pkg} also requires ${others.slice(0, 3).join(", ")}${others.length > 3 ? "…" : ""}, which only npm provides.`);
    return { url: `${CDN}/${pkg}@${version}/${file}`, version };
}

const CSS_FILES = 40, CSS_BYTES = 36000;
/** Writes a stylesheet's `@import`s into it, recursively (paths resolved against the file they are in). Rejects with a plain message. */
export async function inlineCss(url, fetchFn) {
    const seen = new Set(); let bytes = 0;
    async function load(u, depth) {
        if (seen.has(u)) return "";
        if (seen.size >= CSS_FILES || depth > 4) throw new Error("That stylesheet imports too many files to include.");
        seen.add(u);
        const text = await fetchFn(u, "text").catch(() => { throw new Error(`Couldn't load ${u}`); });
        bytes += text.length;
        if (bytes > CSS_BYTES) throw new Error("That stylesheet is too large to include here.");
        let out = "", last = 0;
        for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*([^;]*);/g)) {
            const target = new URL(m[1], u).href;
            out += text.slice(last, m.index) + (/^https:\/\//.test(target) ? await load(target, depth + 1) : "");
            last = m.index + m[0].length;
        }
        return out + text.slice(last);
    }
    return (await load(url, 0)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** A v4 `@import` specifier as a link: an https link stays; "./node_modules/pkg/x.css" and "pkg/x.css" go to the CDN; the project's own files give null. */
export async function importUrl(spec, fetchFn) {
    if (/^https:\/\//i.test(spec)) return spec;
    if (/^\.{1,2}\/(?!node_modules\/)/.test(spec) || spec.startsWith("/")) return null;
    const { pkg, sub } = splitSpec(spec);
    if (!sub || !PKG.test(pkg)) return null;
    return `${CDN}/${pkg}@${await versionOf(pkg, fetchFn)}/${sub}`;
}

const diag = (line, level, message) => ({ line, level, message });

/** Reads a config file and reports what a page can and can't do with it. `engine` "3": text is tailwind.config.js; "4": global.css. Returns { lock, diagnostics }. */
export async function resolveFile({ engine, text }, fetchFn) {
    const lock = {}, diagnostics = [];
    if (String(text).length > MAX_FILE) return { lock, diagnostics: [diag(0, "error", `The file is longer than ${MAX_FILE} characters.`)] };
    if (cleanEngine(engine) === "3") {
        const seen = new Map();
        const jobs = requiresOf(text).map(async ({ spec, line }) => {
            const kind = kindOf(spec);
            if (kind === "official") return diagnostics.push(diag(line, "ok", `${spec}: built into the Tailwind CDN (${OFFICIAL[spec]}).`));
            if (kind === "builtin") return diagnostics.push(diag(line, "ok", `${spec}: built in.`));
            if (kind === "relative") return diagnostics.push(diag(line, "error", `${spec} is a file in your own project, which a page can't reach.`));
            if (spec === "tailwindcss" || spec.startsWith("tailwindcss/")) return diagnostics.push(diag(line, "warn", `${spec} isn't available here; remove it.`));
            if (!seen.has(spec)) seen.set(spec, resolveRequire(spec, fetchFn).then((r) => { lock[spec] = { url: r.url }; return r; }, (e) => ({ error: e.message })));
            const r = await seen.get(spec);
            diagnostics.push(r.error ? diag(line, "error", `${spec}: ${r.error}`) : diag(line, "ok", `${spec}: loaded from ${r.url.replace(CDN + "/", "")}${r.note ? ` (${r.note})` : ""}.`));
        });
        await Promise.all(jobs);
    } else {
        const jobs = directivesOf(text).map(async ({ kind, spec, line }) => {
            if (kind === "plugin") return diagnostics.push(diag(line, "error", `@plugin "${spec}" needs a build: the Tailwind 4 browser build can't run plugins. If the plugin also supports Tailwind 3, switch to Tailwind 3 and add it with require().`));
            if (kind === "source") return diagnostics.push(diag(line, "ok", "@source: skipped. A build scans files with it; the browser reads the page itself."));
            if (/^tailwindcss(\/|$)/.test(spec)) return diagnostics.push(diag(line, "ok", `${spec}: built in.`));
            try {
                const url = await importUrl(spec, fetchFn);
                if (!url) return diagnostics.push(diag(line, "error", `"${spec}" is a file in your own project, which a page can't reach.`));
                lock[spec] = { css: await inlineCss(url, fetchFn) };
                diagnostics.push(diag(line, "ok", `${spec}: included (${lock[spec].css.length} characters), with the files it imports.`));
            } catch (e) { diagnostics.push(diag(line, "error", `${spec}: ${e.message}`)); }
        });
        await Promise.all(jobs);
    }
    diagnostics.sort((a, b) => a.line - b.line);
    return { lock, diagnostics };
}
