// Editing a project's config file for the user, without a parser: adding an animation (keyframes + the `animate-*` name) to tailwind.config.js (Tailwind 3) or to
// global.css (Tailwind 4). The file stays the user's own text: only the new entry is inserted, inside `theme.extend`, and the result is always valid.
import { configToV4 } from "./theme-v4.js";
import { cleanEngine } from "./config-file.js";

/** A copy of the source with comments and the insides of strings blanked (same length), so braces and keys can be found by position. */
function masked(src, keepStrings = false) {
    let out = "", i = 0, q = null;
    while (i < src.length) {
        const c = src[i], n = src[i + 1];
        if (q) { if (c === "\\") { out += "  "; i += 2; continue; } if (c === q) { q = null; out += c; } else out += keepStrings || c === "\n" ? c : " "; i++; continue; }
        if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; }
        if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); const end = e < 0 ? src.length : e + 2; out += src.slice(i, end).replace(/[^\n]/g, " "); i = end; continue; }
        if (c === "/" && n === "/") { const e = src.indexOf("\n", i); const end = e < 0 ? src.length : e; out += " ".repeat(end - i); i = end; continue; }
        out += c; i++;
    }
    return out;
}
/** Index of the `}` that closes the `{` at `open` (in masked source), or -1. */
function closeOf(m, open) { let d = 0; for (let i = open; i < m.length; i++) { if (m[i] === "{") d++; else if (m[i] === "}" && --d === 0) return i; } return -1; }
const lineIndent = (src, i) => /^[ \t]*/.exec(src.slice(src.lastIndexOf("\n", i - 1) + 1))[0];
const indentJson = (v, pad) => JSON.stringify(v, null, 2).replace(/\n/g, `\n${pad}`);
const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

/** Adds `entry` (a key and its value) to the `section` object of `theme.extend` in a tailwind.config.js. Returns { text, status: "added" | "exists" | "nowhere" }. */
export function addToExtend(text, section, name, value) {
    const src = String(text), m = masked(src), mk = masked(src, true); // mk: comments blanked, strings kept (for names)
    const find = (re, from = 0, to = m.length) => { const x = re.exec(m.slice(from, to)); return x ? { start: from + x.index, open: from + x.index + x[0].length - 1 } : null; };
    let ext = find(/\bextend\s*:\s*\{/);
    if (!ext) {
        const theme = find(/\btheme\s*:\s*\{/);
        if (theme) { const pad = `${lineIndent(src, theme.open)}  `; const empty = /^\s*\}/.test(src.slice(theme.open + 1)); return { status: "added", text: `${src.slice(0, theme.open + 1)}\n${pad}extend: {\n${pad}  ${key(section)}: {\n${pad}    ${key(name)}: ${indentJson(value, `${pad}    `)},\n${pad}  },\n${pad}},${empty ? `\n${lineIndent(src, theme.open)}` : ""}${src.slice(theme.open + 1).replace(empty ? /^\s*/ : /^$/, "")}` }; }
        const root = find(/(module\.exports\s*=|export\s+default|\bconfig\s*(?::\s*[\w.<>]+)?\s*=)\s*\{/);
        if (!root) return { text: src, status: "nowhere" };
        const pad = `${lineIndent(src, root.open)}  `, empty = /^\s*\}/.test(src.slice(root.open + 1));
        return { status: "added", text: `${src.slice(0, root.open + 1)}\n${pad}theme: {\n${pad}  extend: {\n${pad}    ${key(section)}: {\n${pad}      ${key(name)}: ${indentJson(value, `${pad}      `)},\n${pad}    },\n${pad}  },\n${pad}},${empty ? `\n${lineIndent(src, root.open)}` : ""}${src.slice(root.open + 1).replace(empty ? /^\s*/ : /^$/, "")}` };
    }
    const extEnd = closeOf(m, ext.open);
    if (extEnd < 0) return { text: src, status: "nowhere" };
    const sec = find(new RegExp(`(?:^|[\\s{,])${section}\\s*:\\s*\\{`), ext.open + 1, extEnd)
        || (() => { const x = new RegExp(`(?:^|[\\s{,])["']${section}["']\\s*:\\s*\\{`).exec(mk.slice(ext.open + 1, extEnd)); return x ? { start: ext.open + 1 + x.index, open: ext.open + 1 + x.index + x[0].length - 1 } : null; })(); // a quoted key is found in the copy that keeps strings
    const nameRe = new RegExp(`(?:^|[\\s{,])(?:${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|"${name}"|'${name}')\\s*:`);
    if (sec) {
        const secOpen = sec.open, secEnd = closeOf(m, secOpen);
        if (secEnd < 0) return { text: src, status: "nowhere" };
        if (nameRe.test(mk.slice(secOpen + 1, secEnd))) return { text: src, status: "exists" };
        const inner = m.slice(secOpen + 1, secEnd), pad = `${lineIndent(src, secOpen)}  `;
        const hasItems = /\S/.test(inner), needsComma = hasItems && !/,\s*$/.test(inner);
        const at = hasItems ? secOpen + 1 + inner.replace(/\s+$/, "").length : secOpen + 1; // right after the last entry
        const closeIndent = lineIndent(src, secOpen);
        const entry = `${needsComma ? "," : ""}\n${pad}${key(name)}: ${indentJson(value, pad)},`;
        return { status: "added", text: `${src.slice(0, at)}${entry}${hasItems ? "" : `\n${closeIndent}`}${hasItems ? src.slice(at) : src.slice(secOpen + 1).replace(/^\s*/, "")}` };
    }
    // no such section in extend yet: a new one, first in extend
    const pad = `${lineIndent(src, ext.open)}  `, empty = !/\S/.test(m.slice(ext.open + 1, extEnd));
    const block = `\n${pad}${key(section)}: {\n${pad}  ${key(name)}: ${indentJson(value, `${pad}  `)},\n${pad}},`;
    return { status: "added", text: `${src.slice(0, ext.open + 1)}${block}${empty ? `\n${lineIndent(src, ext.open)}` : ""}${src.slice(ext.open + 1).replace(empty ? /^\s*/ : /^$/, "")}` };
}

/** Adds an animation: `keyframes` ({ "0%": { opacity: "0" }, ... }) under `name` and `animation` ("name 0.6s ease-out both") as `animate-<name>`. */
export function addAnimation(text, engine, { name, keyframes, animation }) {
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) return { text, status: "badname" };
    if (cleanEngine(engine) === "4") {
        const src = String(text);
        if (new RegExp(`--animate-${name}\\s*:`).test(src)) return { text: src, status: "exists" };
        const { css } = configToV4({ keyframes: { [name]: keyframes }, animation: { [name]: animation } });
        return { status: "added", text: `${src.replace(/\s*$/, "")}\n\n${css}\n` };
    }
    const a = addToExtend(text, "animation", name, animation);
    if (a.status !== "added") return a;
    const k = addToExtend(a.text, "keyframes", name, keyframes);
    return k.status === "added" ? k : { text, status: k.status === "exists" ? "exists" : k.status };
}

/** The animations of tailwind.config.js a file defines, for a list: names of `animation` entries (best effort, by reading the text). */
export function animationNames(text) {
    const m = masked(String(text)), src = String(text), names = [];
    for (const sec of m.matchAll(/\banimation\s*:\s*\{/g)) { const open = sec.index + sec[0].length - 1, end = closeOf(m, open); if (end < 0) continue; for (const k of src.slice(open + 1, end).matchAll(/(?:^|[\s,{])(?:"([\w-]+)"|'([\w-]+)'|([A-Za-z_$][\w$-]*))\s*:/g)) names.push(k[1] || k[2] || k[3]); }
    return [...new Set(names)];
}
