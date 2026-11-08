// Layout lab, experiment 1: can the layout compiler (packages/core/layout-compiler.js) rebuild real components from loose pieces?
//
// For each gallery component (rendered at 1280 wide): keep only its pieces (text, images, buttons, icons: leaves; boxes that
// are seen: surfaces) with where they are, and throw the rest away (every wrapper, flex, grid, margin, padding). The compiler
// writes new code from the pieces alone; that code is rendered and every piece is measured against where it was.
// Then up to two measuring passes write the sizes the layout could not give (as the editor's probe would), and it is measured again.
//
//   node scripts/layout-lab/compile-lab.mjs <gallery dir> <out dir>      (gallery dir: from export.mjs; CHROME=... to pick Chrome)
import { chromium } from "playwright-core";
import fs from "node:fs";
import { compile, emit, codeStats, splitClasses } from "../../packages/core/layout-compiler.js";

const [dir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const only = process.env.ONLY;
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html") && (!only || f.includes(only)));
const W = 1280;
const head = `<meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script>`;
const b = await chromium.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: W, height: 900 } });

/** In the page: the pieces, each marked with data-k, with its rectangle, natural width and classes (plus inherited text classes). */
function extract() {
    const INHERIT = /^(text-|font-|leading-|tracking-|uppercase$|lowercase$|capitalize$|normal-case$|italic$|not-italic$|antialiased$|subpixel-antialiased$|whitespace-|break-|underline$|no-underline$)/;
    const key = (c) => {
        const i = c.lastIndexOf(":"), v = c.slice(0, i + 1), base = c.slice(i + 1);
        let g = base;
        if (/^text-(xs|sm|base|lg|[2-9]?xl|\[\d)/.test(base)) g = "size";
        else if (/^text-(left|center|right|justify|start|end)$/.test(base)) g = "align";
        else if (/^text-(ellipsis|clip|wrap|nowrap|balance|pretty)$/.test(base)) g = "wrap";
        else if (/^text-/.test(base)) g = "color";
        else if (/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d)/.test(base)) g = "weight";
        else if (/^font-/.test(base)) g = "family";
        else if (/^(uppercase|lowercase|capitalize|normal-case)$/.test(base)) g = "case";
        else g = base.replace(/-.*$/, "");
        return v + g;
    };
    const REPLACED = new Set(["IMG", "SVG", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "VIDEO", "CANVAS", "IFRAME", "HR", "PICTURE"]);
    const VOID = new Set(["IMG", "INPUT", "HR", "BR"]);
    // seen: has a size, is not hidden, and is not cut off entirely by a box that clips (overflow hidden) or by the page's left/top
    const clipped = (el, r) => {
        if (r.right <= 0 || r.bottom <= 0) return true;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.overflowX === "visible" && s.overflowY === "visible") continue;
            const q = a.getBoundingClientRect();
            if (r.left >= q.right || r.right <= q.left || r.top >= q.bottom || r.bottom <= q.top) return true;
        }
        return false;
    };
    const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !clipped(el, r); };
    const seen = (cs) => {
        const a = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c !== "transparent" ? 1 : 0; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
        if (a(cs.backgroundColor) > 0.02 || cs.backgroundImage !== "none") return true;
        if (cs.boxShadow !== "none") return true;
        return ["Top", "Right", "Bottom", "Left"].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && a(cs[`border${s}Color`]) > 0.02);
    };
    const atomic = (el) => {
        if (REPLACED.has(el.tagName.toUpperCase())) return true;
        if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
        const kids = [...el.children].filter(vis);
        return kids.length > 0 && kids.every((k) => /^inline/.test(getComputedStyle(k).display) || k.tagName === "BR");
    };
    const out = [];
    let z = 0, k = 0;
    const walk = (el, inherited) => {
        for (const c of [...el.children]) {
            if (["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE"].includes(c.tagName) || !vis(c)) continue;
            const cs = getComputedStyle(c), r = c.getBoundingClientRect();
            if (cs.clip !== "auto" && cs.position === "absolute" && r.width <= 2) continue; // sr-only
            const own = (c.getAttribute("class") || "").split(/\s+/).filter(Boolean);
            const have = new Set(own.map(key));
            const merged = [...inherited.filter((x) => !have.has(key(x))), ...own];
            const isLeaf = atomic(c), isSurface = !isLeaf && seen(cs);
            if (!isLeaf && !isSurface) { walk(c, [...inherited.filter((x) => !have.has(key(x))), ...own.filter((x) => INHERIT.test(x.slice(x.lastIndexOf(":") + 1)))]); continue; }
            const id = String(k++);
            c.setAttribute("data-k", id);
            // the natural width: as wide as its content wants to be (max-content)
            let nat = r.width;
            if (isLeaf) {
                // text: as wide as its words on one line; an image or an icon: its own size (what its classes or the file give)
                const replaced = ["IMG", "SVG", "INPUT", "SELECT", "TEXTAREA", "VIDEO", "CANVAS", "IFRAME", "HR"].includes(c.tagName.toUpperCase());
                const fixedW = own.some((x) => /^w-(\d|\[|px)/.test(x.slice(x.lastIndexOf(":") + 1)));
                const old = c.style.cssText; c.style.width = replaced && !fixedW ? "auto" : fixedW ? "" : "max-content"; c.style.maxWidth = "none"; c.style.minWidth = "0"; c.style.flex = "none"; c.style.alignSelf = "flex-start";
                nat = c.getBoundingClientRect().width; c.style.cssText = old;
            }
            const attrs = [...c.attributes].filter((a) => a.name !== "class" && a.name !== "style").map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join(" ");
            const style = c.getAttribute("style");
            out.push({
                k: id, kind: isLeaf ? "leaf" : "surface", tag: c.tagName.toLowerCase(), z: z++,
                x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, nat,
                replaced: ["IMG", "SVG", "VIDEO", "CANVAS", "IFRAME", "PICTURE"].includes(c.tagName.toUpperCase()),
                fixedW: own.some((x) => /^(w|size)-(\d|\[|px)/.test(x.slice(x.lastIndexOf(":") + 1))) || c.hasAttribute("width"),
                fixedH: own.some((x) => /^(h|size)-(\d|\[|px)/.test(x.slice(x.lastIndexOf(":") + 1))) || c.hasAttribute("height"),
                bt: parseFloat(cs.borderTopWidth) || 0, br: parseFloat(cs.borderRightWidth) || 0, bb: parseFloat(cs.borderBottomWidth) || 0, bl: parseFloat(cs.borderLeftWidth) || 0, block: /^(block|flex|grid|list-item|table)$/.test(cs.display),
                cls: merged.join(" "), attrs: attrs + (style ? ` style="${style.replace(/"/g, "&quot;")}"` : ""), inner: isLeaf ? c.innerHTML : "", void: VOID.has(c.tagName.toUpperCase()),
            });
            if (isSurface) walk(c, []);
        }
    };
    walk(document.body, []);
    return { nodes: out, h: document.documentElement.scrollHeight };
}
const measure = () => [...document.querySelectorAll("[data-k]")].map((el) => { const r = el.getBoundingClientRect(); return { k: el.getAttribute("data-k"), x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; });

const page = await ctx.newPage();
let docHead = head, bodyCls = "";
const render = async (body) => { await page.setContent(`<!doctype html><html><head>${docHead}</head><body class="${bodyCls}">${body}</body></html>`, { waitUntil: "networkidle", timeout: 30000 }); await page.waitForTimeout(500); };
const rows = [];
const byKind = {};
const totals = { comps: 0, leaves: 0, ok0: 0, ok: 0, surf: 0, sok: 0, loc0: 0, loc: 0 };
const orig = { classes: 0, arbitrary: 0, absolute: 0, elements: 0 };
const comp = { classes: 0, arbitrary: 0, absolute: 0, elements: 0, wrappers: 0 };
const seenHtml = new Set();
for (const f of files) {
    const id = f.replace(".html", ""), html = fs.readFileSync(`${dir}/${f}`, "utf8");
    if (seenHtml.has(html)) continue; // the gallery has copies of the same component
    seenHtml.add(html);
    try {
        // the original's head (fonts, Tailwind config) and body classes stay: they are the page's theme, not its layout
        const hm = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i), bm = html.match(/<body[^>]*class="([^"]*)"/i);
        docHead = head + (hm ? hm[1].replace(/<script[^>]*cdn\.tailwindcss\.com[^>]*><\/script>/g, "").replace(/<title>[\s\S]*?<\/title>/i, "") : "");
        bodyCls = bm ? splitClasses(bm[1], "surface").keep.join(" ") : "";
        // styles and font links written in the body are the theme too
        docHead += (html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, "").match(/<style[\s\S]*?<\/style>|<link[^>]*>/gi) || []).join("\n");
        await render(html.replace(/<!doctype[^>]*>|<\/?html[^>]*>|<head[^>]*>[\s\S]*?<\/head>/gi, "").replace(/<body([^>]*)>/i, "<div$1>").replace(/<\/body>/i, "</div>"));
        const { nodes, h } = await page.evaluate(extract);
        fs.writeFileSync(`${outDir}/${id}.nodes.json`, JSON.stringify({ h, nodes }));
        if (process.env.SHOTS) await page.screenshot({ path: `${outDir}/${id}.a-orig.png`, fullPage: true, scale: "css" });
        if (nodes.length < 3) continue;
        // the original's layout code, for comparison: layout classes, arbitrary layout values, absolutes, elements
        const os = await page.evaluate(() => { const all = [...document.body.querySelectorAll("*")].filter((e) => !e.closest("svg") || e.tagName === "svg"); return all.map((e) => e.getAttribute("class") || ""); });
        const pieces = {};
        for (const n of nodes) { const { keep } = splitClasses(n.cls, n.kind); pieces[n.k] = { tag: n.tag, attrs: n.attrs, keep, inner: n.inner, kind: n.kind, void: n.void }; }
        const want = Object.fromEntries(nodes.map((n) => [n.k, n]));
        // which surface holds each piece (the smallest one painted under it): "placed locally" is measured from it
        const holder = {};
        for (const n of nodes) { const s = nodes.filter((o) => o.kind === "surface" && o.z < n.z && o.x <= n.x + 1 && o.y <= n.y + 1 && o.x + o.w >= n.x + n.w - 1 && o.y + o.h >= n.y + n.h - 1).sort((a, b) => a.w * a.h - b.w * b.h)[0]; holder[n.k] = s ? s.k : null; }
        const score = (got) => {
            let ok = 0, sok = 0, lv = 0, sv = 0, loc = 0;
            const bad = [], at = Object.fromEntries(got.map((g) => [g.k, g]));
            for (const g of got) {
                const t0 = want[g.k];
                if (t0 && t0.kind === "leaf") {
                    const h = holder[g.k], gh = h ? at[h] : { x: 0, y: 0 }, th = h ? want[h] : { x: 0, y: 0 };
                    if (gh && Math.max(Math.abs(g.x - gh.x - (t0.x - th.x)), Math.abs(g.y - gh.y - (t0.y - th.y)), Math.abs(g.w - t0.w), Math.abs(g.h - t0.h)) <= 2) loc++;
                }
                const t = want[g.k]; if (!t) continue;
                const e = Math.max(Math.abs(g.x - t.x), Math.abs(g.y - t.y), Math.abs(g.w - t.w), Math.abs(g.h - t.h));
                if (t.kind === "leaf") { lv++; if (e <= 2) ok++; } else { sv++; if (e <= 2) sok++; }
                if (e > 2) bad.push({ k: g.k, kind: t.kind, tag: t.tag, dw: g.w - t.w, dh: g.h - t.h, dx: g.x - t.x, dy: g.y - t.y });
            }
            return { ok, sok, lv, sv, bad, loc };
        };
        const fixes = {};
        let tree, code, s0, s;
        for (let pass = 0; pass < 3; pass++) {
            tree = compile({ x: 0, y: 0, w: W, h }, nodes, { fixes });
            code = emit(tree, pieces);
            await render(code);
            s = score(await page.evaluate(measure));
            if (pass === 0) { s0 = s; if (process.env.SHOTS) await page.screenshot({ path: `${outDir}/${id}.b-comp.png`, fullPage: true }); }
            // sizes that came out different: written explicitly next time (only for the outermost wrong ones first)
            let changed = false;
            for (const d of s.bad) {
                if (fixes[d.k]) continue;
                const t = want[d.k], fx = {};
                if (Math.abs(d.dw) > 2 && (t.kind === "surface" || t.tag !== "span")) fx.w = t.w;
                if (Math.abs(d.dh) > 2 && t.kind === "surface") fx.h = t.h;
                if (fx.w || fx.h) { fixes[d.k] = fx; changed = true; }
            }
            if (!changed) break;
        }
        const st = codeStats(tree);
        const oc = os.join(" ").split(/\s+/).filter(Boolean).filter((c) => /^(-?m[trblxyse]?-|space-|gap-|flex|grid|items-|justify-|self-|p[trblxyse]?-|w-|h-|min-|max-|absolute|relative|inset|top-|left-|right-|bottom-)/.test(c.slice(c.lastIndexOf(":") + 1)));
        orig.classes += oc.length; orig.arbitrary += oc.filter((c) => c.includes("[")).length; orig.absolute += oc.filter((c) => /(^|:)absolute$/.test(c)).length; orig.elements += os.length;
        comp.classes += st.classes; comp.arbitrary += st.arbitrary; comp.absolute += st.absolute; comp.elements += st.elements; comp.wrappers += st.wrappers;
        totals.comps++; totals.leaves += s.lv; totals.ok0 += s0.ok; totals.ok += s.ok; totals.surf += s.sv; totals.sok += s.sok; totals.loc0 += s0.loc; totals.loc += s.loc;
        const absShare = oc.filter((c) => /(^|:)absolute$/.test(c)).length / Math.max(1, nodes.length);
        const kind = absShare > 0.3 ? "absolute export" : "flex/grid";
        (byKind[kind] ||= { comps: 0, leaves: 0, ok0: 0, ok: 0, loc0: 0, loc: 0 });
        Object.entries({ comps: 1, leaves: s.lv, ok0: s0.ok, ok: s.ok, loc0: s0.loc, loc: s.loc }).forEach(([k, v]) => (byKind[kind][k] += v));
        rows.push({ id, kind, pieces: nodes.length, leaves: s.lv, "placed (pass 0)": pct(s0.ok, s0.lv), placed: pct(s.ok, s.lv), "local (pass 0)": pct(s0.loc, s0.lv), local: pct(s.loc, s.lv), surfaces: pct(s.sok, s.sv), fixes: Object.keys(fixes).length, arb: st.arbitrary, abs: st.absolute });
        fs.writeFileSync(`${outDir}/${id}.compiled.html`, code);
        fs.writeFileSync(`${outDir}/${id}.bad.json`, JSON.stringify(s.bad.slice(0, 40), null, 1));
        fs.writeFileSync(`${outDir}/${id}.bad0.json`, JSON.stringify(s0.bad.map((d) => ({ ...d, cls: want[d.k].cls.slice(0, 90), text: (want[d.k].inner || "").replace(/<[^>]+>/g, "").trim().slice(0, 30), nat: want[d.k].nat, w: want[d.k].w })), null, 0));
        fs.writeFileSync(`${outDir}/${id}.code0.html`, emit(compile({ x: 0, y: 0, w: W, h }, nodes), pieces));
    } catch (e) { console.log("skip", id, e.message.slice(0, 100)); }
}
function pct(a, n) { return n ? Math.round((100 * a) / n) + "%" : "-"; }
console.table(rows);
console.log(`components: ${totals.comps}`);
console.log(`leaves placed within 2px: first compile ${pct(totals.ok0, totals.leaves)}, after measuring ${pct(totals.ok, totals.leaves)}  (${totals.ok}/${totals.leaves})`);
console.log(`leaves placed within 2px of their surface: first compile ${pct(totals.loc0, totals.leaves)}, after measuring ${pct(totals.loc, totals.leaves)}`);
for (const [k, t] of Object.entries(byKind)) console.log(`  ${k}: ${t.comps} components, ${t.leaves} leaves | placed ${pct(t.ok0, t.leaves)} -> ${pct(t.ok, t.leaves)} | locally ${pct(t.loc0, t.leaves)} -> ${pct(t.loc, t.leaves)}`);
console.log(`surfaces within 2px: ${pct(totals.sok, totals.surf)}`);
console.log(`layout code, original vs compiled: classes ${orig.classes} vs ${comp.classes}, arbitrary ${orig.arbitrary} vs ${comp.arbitrary}, absolute ${orig.absolute} vs ${comp.absolute}, elements ${orig.elements} vs ${comp.elements} (wrappers ${comp.wrappers})`);
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify({ totals, orig, comp, rows }, null, 1));
await b.close();
