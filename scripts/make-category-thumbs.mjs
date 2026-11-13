// Makes the preview picture of each gallery category: a screenshot of the category's best public design (the most liked, then the oldest).
// They are saved in src/public/images/categories/<slug>.jpg and the gallery cards show them inside a small window; a category with no picture keeps the drawn wireframe.
// Run it after the gallery changes:  npm run thumbs:categories   (needs MONGO_URI in .env, Chrome, and the network for the Tailwind CDN)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { chromium } from "playwright-core";
import Component from "../src/models/component.model.js";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/public/images/categories");
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => p && fs.existsSync(p));
if (!chrome) throw new Error("Chrome was not found (set CHROME_PATH)");
if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set (run with --env-file=.env)");

await mongoose.connect(process.env.MONGO_URI);
// Which design shows for a category: the one chosen for it in category-thumb-picks.json (the title starts with the pick, "Hero Sections 09"), else the most liked, then the oldest.
const picks = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "category-thumb-picks.json"), "utf8"));
const all = await Component.find({ isPublished: true, category: { $nin: [null, ""] }, kind: { $ne: "section" } }).select("title category htmlCode likes createdAt").sort({ likes: -1, createdAt: 1 }).lean();
const byCat = new Map();
for (const c of all) (byCat.get(c.category) || byCat.set(c.category, []).get(c.category)).push(c);
const best = [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slug, list]) => {
    const pick = typeof picks[slug] === "string" ? { design: picks[slug] } : picks[slug];
    const chosen = pick && list.find((c) => c.title.startsWith(pick.design));
    const c = chosen || list[0];
    return { _id: slug, title: c.title, htmlCode: c.htmlCode, picked: Boolean(chosen), spec: chosen ? pick : {} };
});
await mongoose.disconnect();

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const composer = await ctx.newPage();
const ASP = 1.5, OUT_W = 1000, OUT_H = Math.round(OUT_W / ASP); // the window on a card is 1.4 to 2.1 times wider than high, and the picture fills it (cut at the sides or the top and bottom): drawn at 1.5, with room around what matters, little of it is cut at any width
const wrap = (html) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${html}</body></html>`;

/** In the page: on a dark background, a dark border is invisible at the size of a thumbnail: it is drawn lighter. */
const boostBorders = () => page.evaluate(() => {
    const rgb = (s) => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lum = (c) => (c[0] + c[1] + c[2]) / 3;
    const under = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const c = rgb(getComputedStyle(p).backgroundColor); if (c && c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
    for (const e of document.body.querySelectorAll("*")) {
        const cs = getComputedStyle(e); if (!(parseFloat(cs.borderTopWidth) > 0) || cs.borderTopStyle === "none") continue;
        const own = rgb(cs.backgroundColor), base = own && own[3] > 0.5 ? own : under(e), bc = rgb(cs.borderTopColor);
        if (bc && lum(base) < 70 && lum(bc) < 110) e.style.setProperty("border-color", "rgba(255,255,255,.5)", "important");
    }
});

/** What is on the page, and where: from the text, images and controls, and the small boxes drawn around them (a card), never the big background of a section. */
const measure = () => page.evaluate(() => {
    const bodyH = Math.ceil(document.body.getBoundingClientRect().height);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (r) => { if (r.width > 0 && r.height > 0) { x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); } };
    for (const e of document.body.querySelectorAll("*")) {
        if (/^(SCRIPT|STYLE|LINK|META|HEAD)$/i.test(e.tagName)) continue;
        const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
        const r = e.getBoundingClientRect();
        if (/^(IMG|SVG|INPUT|TEXTAREA|SELECT|BUTTON|VIDEO|CANVAS)$/i.test(e.tagName)) add(r);
        for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); add(rg.getBoundingClientRect()); }
        const painted = !/rgba?\(0, 0, 0, 0\)/.test(cs.backgroundColor) || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none");
        if (painted && r.width > 40 && r.height > 16 && r.width < 1000 && r.height < 600) add(r);
    }
    return { bodyH, x0, y0, x1, y1 };
});

/** The picture, composed in a canvas: the crop is a window onto the page that may reach past its edges, and what is past them is the page's own edge colour (or `fill`). */
const compose = (b64, o) => composer.evaluate(async ({ b64, o }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = o.outW; c.height = o.outH; const x = c.getContext("2d");
    const sc = o.outW / o.cw, rx = (o.ox - o.cx) * sc, ry = (o.oy - o.cy) * sc, rw = img.width * sc, rh = img.height * sc;
    if (o.fill) { x.fillStyle = o.fill; x.fillRect(0, 0, o.outW, o.outH); }
    else {
        const px = (sx, sy) => { const t = document.createElement("canvas"); t.width = 1; t.height = 1; const g = t.getContext("2d"); g.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
        const W = img.width, H = img.height;
        if (ry > 0) x.drawImage(img, 0, 0, W, 1, rx, 0, rw, ry);
        if (ry + rh < o.outH) x.drawImage(img, 0, H - 1, W, 1, rx, ry + rh, rw, o.outH - (ry + rh));
        if (rx > 0) x.drawImage(img, 0, 0, 1, H, 0, ry, rx, rh);
        if (rx + rw < o.outW) x.drawImage(img, W - 1, 0, 1, H, rx + rw, ry, o.outW - (rx + rw), rh);
        for (const [sx, sy, dx, dy, dw, dh] of [[0, 0, 0, 0, rx, ry], [W - 1, 0, rx + rw, 0, o.outW - (rx + rw), ry], [0, H - 1, 0, ry + rh, rx, o.outH - (ry + rh)], [W - 1, H - 1, rx + rw, ry + rh, o.outW - (rx + rw), o.outH - (ry + rh)]]) if (dw > 0 && dh > 0) { x.fillStyle = px(sx, sy); x.fillRect(dx, dy, dw, dh); }
    }
    x.drawImage(img, rx, ry, rw, rh);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}, { b64, o });

/** Which way the picture is made: "center" puts what is on the page in the middle of the window (and the page's own background carries on around it), "bottom" shows the page from its foot (a footer),
 *  "card" is the one card of the design on a plain background; no mode is the old way: the top of the page, or a closer crop of a short one. */
async function render(c) {
    const spec = c.spec || {};
    await page.setContent(wrap(c.htmlCode), { waitUntil: "load", timeout: 40000 });
    await page.evaluate(async () => { // every picture is fetched (not only the ones the page shows first), and waited for
        document.querySelectorAll("img").forEach((i) => { i.loading = "eager"; });
        await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 15000); }))));
    });
    await page.waitForTimeout(1500);
    if (spec.boost) await boostBorders();
    const m = await measure();
    if (spec.mode === "card") {
        const found = await page.evaluate(() => {
            const rgb = (s) => { const q = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(s); return q ? q[4] === undefined ? 1 : +q[4] : 0; };
            let best = null, area = 0;
            for (const e of document.body.querySelectorAll("*")) {
                const cs = getComputedStyle(e), r = e.getBoundingClientRect();
                if (parseFloat(cs.borderTopLeftRadius) >= 12 && rgb(cs.backgroundColor) > 0.5 && r.width >= 300 && r.width <= 1000 && r.height >= 160 && r.height <= 620 && r.width * r.height > area) { best = e; area = r.width * r.height; }
            }
            if (!best) return false;
            best.setAttribute("data-thumb-card", "1");
            document.documentElement.style.background = "transparent"; document.body.style.background = "transparent";
            for (let p = best.parentElement; p; p = p.parentElement) p.style.setProperty("background", "transparent", "important");
            const r = best.getBoundingClientRect(); return { w: r.width, h: r.height };
        });
        if (!found) throw new Error(`${c.title}: no card found`);
        const png = await page.locator("[data-thumb-card]").screenshot({ type: "png", omitBackground: true });
        const k = 64, cw = Math.max(found.w + 2 * k, (found.h + 2 * k) * ASP), ch = cw / ASP;
        return Buffer.from(await compose(png.toString("base64"), { outW: OUT_W, outH: OUT_H, cw, cx: 0, cy: 0, ox: (cw - found.w) / 2, oy: (ch - found.h) / 2, fill: spec.fill || "#ffffff" }), "base64");
    }
    // no mode given: a tall design shows its top; a short one that is full width (a navbar, a banner) hangs from the top of a white page; a short one in the middle is centered
    const wide = m.x1 - m.x0 >= 900;
    const mode = spec.mode || (m.bodyH >= 560 || wide ? "top" : "center");
    const fillColor = spec.fill || (mode === "top" && m.bodyH < 560 ? "#ffffff" : "");
    const Hc = Math.max(120, Math.min(900, Math.max(m.bodyH, Math.ceil(m.y1) + 24)));
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1280, height: Hc } });
    let cw, ch, cx, cy;
    if (mode === "bottom") { cw = 1280; ch = cw / ASP; cx = 0; cy = Hc - ch; }
    else if (mode === "top") { cw = 1280; ch = cw / ASP; cx = 0; cy = -110; } // (room above the page, so that its first lines are not cut when the window is wide)
    else {
        const k = 72, bw = Math.max(m.x1 - m.x0, 1), bh = Math.max(m.y1 - m.y0, 1);
        cw = Math.max(bw + 2 * k, (bh + 2 * k) * ASP, 640); ch = cw / ASP;
        cx = (m.x0 + m.x1) / 2 - cw / 2; cy = (m.y0 + m.y1) / 2 - ch / 2;
    }
    return Buffer.from(await compose(png.toString("base64"), { outW: OUT_W, outH: OUT_H, cw, cx, cy, ox: 0, oy: 0, fill: fillColor }), "base64");
}

await composer.setContent("<body></body>");
for (const c of best) {
    fs.writeFileSync(path.join(OUT, `${c._id}.jpg`), await render(c));
    console.log(`${c._id.padEnd(26)} ${c.title}${c.picked ? "" : "  (no pick: the most liked)"}`);
}
await browser.close();
console.log(`\n${best.length} pictures in ${OUT}`);
