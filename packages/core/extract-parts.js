// Component extraction from a page, strict on purpose. Only well-defined parts come out; everything else stays in the page.
//
//   Parts (the page's structure; they never overlap, and a page with fewer than two stays one piece)
//     nav      a <nav> with at least two links, a <header> with a <nav> or at least two links, role="navigation" / "banner"
//     hero     the first <section> with one <h1>, a paragraph and a button to press
//     section  a <section> or <article> with a heading (h1 to h4) or an aria-label, and some text of its own
//     footer   a <footer> with links or text, role="contentinfo"
//   Elements (reusable pieces, found anywhere in the page, each style once)
//     form     a <form> with at least one field and a button
//     button   a <button> or a link that looks like one (px-4 or more, a fill or a border) with a short text label
//     nav      also found anywhere inside a page that is not split into parts
//
//   Not extracted: plain <div>s, cards, lists, images, a section with no heading, a nav with one link, an icon-only button,
//   a button with no styling, a form with no field. A sidebar (<aside>) next to the main area makes the page an app shell: it stays whole.
//
// Pure string logic (no DOM) so the same code runs on the server and in the browser.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);
const SKIP = new Set(["script", "style", "link", "meta", "title", "noscript", "template", "svg"]);
const WRAPPERS = new Set(["div", "main", "body", "center"]);
const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;

// an opening tag that ends the open one before it (<li> after <li>, <p> after <p>...), as HTML does
const IMPLIED_END = { li: ["li"], p: ["p"], option: ["option"], dt: ["dt", "dd"], dd: ["dt", "dd"], td: ["td", "th"], th: ["td", "th"], tr: ["tr", "td", "th"] };

const MAX_PARTS = 12, MAX_FORMS = 6, MAX_BUTTONS = 8, MAX_DEPTH = 6;
const MIN_TEXT = 20; // characters of visible text a section or footer must have
const stripTags = (s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** The markup as a tree of { tag, open, start, end, children, parent }, tolerant of unclosed tags. Scripts and styles are left out. */
export function parseTree(markup) {
    const root = { tag: "#root", open: "", start: 0, end: markup.length, children: [], parent: null };
    const stack = [root];
    TAG_RE.lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(markup))) {
        if (m[0].startsWith("<!--")) continue;
        const closing = m[1] === "/", tag = m[2].toLowerCase();
        if (!closing) {
            if (RAW.has(tag)) {
                const close = markup.toLowerCase().indexOf(`</${tag}`, TAG_RE.lastIndex);
                TAG_RE.lastIndex = close === -1 ? markup.length : markup.indexOf(">", close) + 1;
                continue;
            }
            while (stack.length > 1 && (IMPLIED_END[tag] || []).includes(stack[stack.length - 1].tag)) stack.pop().end = m.index;
            const top = stack[stack.length - 1];
            const node = { tag, open: m[0], start: m.index, end: TAG_RE.lastIndex, children: [], parent: top };
            top.children.push(node);
            if (VOID.has(tag) || /\/\s*$/.test(m[3])) continue;
            stack.push(node);
        } else {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tag !== tag) continue;
                for (let j = stack.length - 1; j > i; j--) stack[j].end = m.index; // closed by their parent: they end where it closes
                stack[i].end = TAG_RE.lastIndex;
                stack.length = i;
                break;
            }
        }
    }
    for (let j = stack.length - 1; j > 0; j--) stack[j].end = markup.length;
    return root;
}

const attr = (node, name) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(node.open);
    return m ? (m[1] ?? m[2]) : "";
};
const hasAttr = (node, name) => new RegExp(`\\b${name}\\b`, "i").test(node.open);

/** Every descendant (not the node itself) for which `fn` is true, in document order. */
function find(node, fn, out = []) {
    for (const c of node.children) { if (fn(c)) out.push(c); find(c, fn, out); }
    return out;
}
const isLink = (n) => n.tag === "a" && hasAttr(n, "href");

/** Whether text-level classes say a link or button is a button: padding, and a fill or a border. */
function looksLikeButton(classes) {
    const t = classes.split(/\s+/).filter(Boolean).map((c) => c.replace(/^(?:[\w-]+:)+/, ""));
    // a button has room around its label (px-4 or more); chips, tabs and icon buttons have less
    const padded = t.some((c) => { const m = /^(?:p|px)-(?:(\d+(?:\.5)?)|\[(\d+)px\])$/.exec(c); return m && (m[1] ? Number(m[1]) >= 4 : Number(m[2]) >= 16); });
    const filled = t.some((c) => /^(?:bg-(?!transparent|none)|border(?:$|-(?!0|none|transparent))|ring(?:$|-))/.test(c));
    return padded && filled;
}

/**
 * The page's parts and elements: [{ name, kind, html, reason, part }]. `kind` is nav, hero, section, footer, form or button.
 * `part` is true for the page's structure (nav, hero, section, footer), false for elements (form, button).
 */
export function extractParts(markup, { maxParts = MAX_PARTS } = {}) {
    const root = parseTree(String(markup || ""));
    const src = String(markup || "");
    const html = (n) => src.slice(n.start, n.end);
    const text = (n) => stripTags(html(n));
    const heading = (n) => {
        const h = find(n, (c) => /^h[1-4]$/.test(c.tag))[0];
        return h ? text(h).slice(0, 60) : "";
    };
    const label = (n) => attr(n, "aria-label").trim().slice(0, 60);
    const links = (n) => find(n, isLink);
    const actions = (n) => find(n, (c) => c.tag === "button" || (isLink(c) && looksLikeButton(attr(c, "class"))));
    const role = (n) => attr(n, "role").toLowerCase();

    // ── Parts ──────────────────────────────────────────────────────────────────────────────────────────────────
    let shell = false;
    const asPart = (n) => {
        const r = role(n);
        if (n.tag === "nav" || r === "navigation") {
            return links(n).length >= 2 ? { kind: "nav", name: label(n) || "Navigation", reason: "a nav with at least two links" } : null;
        }
        if (n.tag === "header" || r === "banner") {
            const hasNav = find(n, (c) => c.tag === "nav").length > 0;
            if (hasNav || links(n).length >= 2) return { kind: "nav", name: label(n) || "Header", reason: "a header with a nav or at least two links" };
        }
        if (n.tag === "footer" || r === "contentinfo") {
            return links(n).length >= 1 || text(n).length >= MIN_TEXT ? { kind: "footer", name: label(n) || "Footer", reason: "a footer with links or text" } : null;
        }
        if (["section", "article", "header"].includes(n.tag) || (r === "region" && label(n))) {
            const name = heading(n) || label(n);
            if (!name || text(n).length < MIN_TEXT) return null;
            return { kind: "section", name, reason: "a section with a heading and text" };
        }
        return null;
    };
    const parts = [];
    const walk = (n, depth) => {
        for (const c of n.children) {
            if (SKIP.has(c.tag)) continue;
            if (c.tag === "aside" && depth <= 2) shell = true;
            const p = asPart(c);
            // a section that holds the page's own nav or footer, or several sections, is a container: its parts are the parts
            const chrome = p && p.kind === "section" ? find(c, (x) => ["nav", "header", "footer"].includes(x.tag) && asPart(x)).length : 0;
            const inner = p && p.kind === "section" ? find(c, (x) => x.tag === "section" && asPart(x)).length : 0;
            const container = chrome > 0 || inner >= 2;
            if (p && !container) { parts.push({ ...p, node: c }); continue; } // a part is not looked into: parts never overlap
            if (depth < MAX_DEPTH && (WRAPPERS.has(c.tag) || ["section", "article", "header"].includes(c.tag))) walk(c, depth + 1);
        }
    };
    walk(root, 0);
    let out = [];
    if (!shell && parts.length >= 2) {
        // the hero: the first section with a single h1 and something to press, among the first parts
        const hero = parts.slice(0, 3).find((p) => p.kind === "section" && p.node.tag === "section" && find(p.node, (c) => c.tag === "h1").length === 1
            && find(p.node, (c) => c.tag === "p" && text(c).length >= 40).length > 0 && find(p.node, (c) => (c.tag === "button" || isLink(c)) && looksLikeButton(attr(c, "class"))).length > 0);
        if (hero) { hero.kind = "hero"; hero.reason = "the first section with a single h1, a paragraph and a button"; }
        out = parts.slice(0, maxParts).map((p) => ({ name: p.name, kind: p.kind, html: html(p.node), reason: p.reason, part: true }));
    }

    // ── Elements ───────────────────────────────────────────────────────────────────────────────────────────────
    const forms = [];
    const formSig = new Set();
    const isForm = (n) => n.tag === "form" || role(n) === "form";
    const fieldsOf = (n) => find(n, (c) => c.tag === "select" || c.tag === "textarea" || (c.tag === "input" && !/^(hidden|submit|button|reset|image)$/i.test(attr(c, "type") || "text")));
    for (const f of find(root, isForm)) {
        const fields = fieldsOf(f);
        const hasButton = find(f, (c) => c.tag === "button" || (c.tag === "input" && /^(submit|button)$/i.test(attr(c, "type")))).length > 0;
        if (!fields.length || !hasButton) continue;
        const types = fields.map((c) => (c.tag === "input" ? (attr(c, "type") || "text").toLowerCase() : c.tag));
        const sig = types.join(",") + "|" + fields.map((c) => attr(c, "name")).join(",");
        if (formSig.has(sig)) continue;
        formSig.add(sig);
        const lg = find(f, (c) => c.tag === "legend")[0];
        const name = (lg && text(lg).slice(0, 60)) || label(f) || heading(f)
            || (types.includes("password") ? (types.length >= 3 ? "Sign-up form" : "Sign-in form")
                : types.length === 1 && types[0] === "search" ? "Search form"
                : types.length === 1 && types[0] === "email" ? "Newsletter form"
                : types.includes("textarea") ? "Contact form" : "Form");
        forms.push({ name, kind: "form", html: html(f), reason: "a form with a field and a button", part: false, node: f });
        if (forms.length >= MAX_FORMS) break;
    }

    const buttons = [];
    const seen = new Set();
    const insideForm = (n) => { for (let p = n.parent; p; p = p.parent) if (isForm(p)) return true; return false; };
    const layoutTokens = /^(?:w|h|min-w|max-w|min-h|max-h|m|mx|my|mt|mb|ml|mr|self|order|col|row|z|top|left|right|bottom|inset|basis|grow|shrink|flex-\d)\b|^(?:absolute|relative|fixed|sticky|hidden|block|inline|flex|grid)$/;
    for (const b of find(root, (c) => c.tag === "button" || isLink(c))) {
        const classes = attr(b, "class");
        if (b.tag === "a" && !(role(b) === "button" || looksLikeButton(classes))) continue;
        if (b.tag === "button" && !looksLikeButton(classes)) continue;
        if (insideForm(b) || find(b, (c) => c.tag === "button" || c.tag === "a").length) continue;
        const t = text(b);
        if (t.length < 1 || t.length > 40) continue; // an icon on its own, or a block of text, is not a button
        const sig = `${b.tag}|` + classes.split(/\s+/).filter((c) => c && !layoutTokens.test(c.replace(/^(?:[\w-]+:)+/, ""))).sort().join(" ");
        if (seen.has(sig)) continue;
        seen.add(sig);
        buttons.push({ name: `Button: ${t}`, kind: "button", html: html(b), reason: "a styled button with a text label", part: false });
        if (buttons.length >= MAX_BUTTONS) break;
    }

    // a nav that is not one of the parts (the page was not split, or it sits inside a container): one more element
    const navs = [];
    const inside = (n, list) => list.some((q) => n.start >= q.node.start && n.end <= q.node.end);
    const taken = out.length ? parts.filter((p) => out.some((o) => o.html === html(p.node))) : [];
    for (const n of find(root, (c) => c.tag === "nav" || role(c) === "navigation")) {
        if (links(n).length < 2 || inside(n, taken) || navs.some((q) => n.start >= q.node.start && n.end <= q.node.end)) continue;
        navs.push({ name: label(n) || "Navigation", kind: "nav", html: html(n), reason: "a nav with at least two links", part: false, node: n });
    }

    return [...out, ...navs.map(({ node, ...f }) => f), ...forms.map(({ node, ...f }) => f), ...buttons];
}
