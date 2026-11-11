import { extractParts } from "./extract-parts.js";

// Pure string logic (no DOM) so the same code runs on the server and in the browser.
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);
const SKIP_TOP = new Set(["script", "style", "link", "meta", "title", "noscript", "template"]);
const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

const stripTags = (s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Top-level elements of a markup string, as { tag, html, start, end }. */
export function topLevelElements(markup) {
    const out = [];
    let depth = 0;
    let current = null;
    TAG_RE.lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(markup))) {
        if (m[0].startsWith("<!--")) continue;
        const closing = m[1] === "/";
        const tag = m[2].toLowerCase();
        const selfClosing = VOID.has(tag) || /\/\s*$/.test(m[3]);

        if (!closing && RAW.has(tag)) {
            const close = markup.toLowerCase().indexOf(`</${tag}`, TAG_RE.lastIndex);
            const end = close === -1 ? markup.length : markup.indexOf(">", close) + 1;
            if (depth === 0) out.push({ tag, html: markup.slice(m.index, end), start: m.index, end });
            TAG_RE.lastIndex = end;
            continue;
        }

        if (!closing) {
            if (depth === 0) current = { tag, start: m.index };
            if (selfClosing) {
                if (depth === 0) out.push({ tag, html: m[0], start: m.index, end: TAG_RE.lastIndex });
            } else depth++;
        } else if (depth > 0) {
            depth--;
            if (depth === 0 && current) {
                out.push({ tag: current.tag, html: markup.slice(current.start, TAG_RE.lastIndex), start: current.start, end: TAG_RE.lastIndex });
                current = null;
            }
        }
    }
    return out;
}

function innerHtml(el) {
    const open = el.html.indexOf(">") + 1;
    const close = el.html.toLowerCase().lastIndexOf(`</${el.tag}`);
    return close > open ? el.html.slice(open, close) : "";
}

/**
 * The page's structure as parts ({ name, kind, html }): nav, hero, section, footer. Kept for callers that only want the parts;
 * extractParts (extract-parts.js) is the strict extractor and also finds forms, buttons and a nav that sits inside a section.
 */
export function splitSections(markup, maxSections = 12) {
    return extractParts(markup, { maxParts: maxSections }).filter((p) => p.part).map(({ name, kind, html }) => ({ name, kind, html }));
}

/** Separates a full document into title, assets (styles/links/scripts) and body markup. */
export function parseDocument(html = "") {
    const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const description = (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || "";
    const styles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]);
    const links = [...html.matchAll(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)].map((m) => m[0]);
    const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]);

    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    let body = bodyMatch ? bodyMatch[1] : html.replace(/<head\b[\s\S]*?<\/head>/i, "").replace(/<\/?(?:html|body)\b[^>]*>/gi, "").replace(/<!doctype[^>]*>/i, "");
    body = body
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<link\b[^>]*>/gi, "")
        .trim();

    const heading = stripTags((body.match(/<h[1-2]\b[^>]*>([\s\S]*?)<\/h[1-2]>/i) || [])[1] || "");
    return { title, description, heading, styles, links, scripts, body };
}
