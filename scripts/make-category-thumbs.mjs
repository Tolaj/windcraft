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
const best = await Component.aggregate([
    { $match: { isPublished: true, category: { $nin: [null, ""] }, kind: { $ne: "section" } } },
    { $sort: { likes: -1, createdAt: 1 } },
    { $group: { _id: "$category", id: { $first: "$_id" }, title: { $first: "$title" }, htmlCode: { $first: "$htmlCode" } } },
    { $sort: { _id: 1 } },
]);
await mongoose.disconnect();

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 600 } })).newPage();
for (const c of best) {
    // a component is a fragment: the page it lives in is a white page of the card's width
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${c.htmlCode}</body></html>`, { waitUntil: "load", timeout: 40000 });
    await page.waitForTimeout(1800); // the Tailwind script and the images
    // a tall design: the top of it. A short one that is full width (a navbar, a banner) is shown whole, a strip across the window. A short one that sits in the middle
    // (a form, a menu, a row of numbers) is cropped closer, around what is on the page, at the shape of the window, so it fills it
    const { h, x0, x1 } = await page.evaluate(() => {
        let x0 = 1e9, x1 = 0;
        const add = (r) => { if (r.width && r.height) { x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); } };
        for (const e of document.body.querySelectorAll("*")) {
            if (/^(IMG|SVG|INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(e.tagName)) add(e.getBoundingClientRect());
            for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); add(rg.getBoundingClientRect()); }
        }
        return { h: Math.ceil(document.body.getBoundingClientRect().height), x0, x1 };
    });
    let clip = { x: 0, y: 0, width: 1280, height: 600 };
    if (h < 560) {
        if (x1 - x0 >= 900) clip = { x: 0, y: 0, width: 1280, height: Math.max(h + 24, 120) };
        else {
            const ch = Math.max(h + 40, 260), cw = Math.round(ch * 1280 / 600);
            clip = { x: Math.max(0, Math.min(1280 - cw, Math.round((x0 + x1) / 2 - cw / 2))), y: 0, width: cw, height: ch };
        }
    }
    fs.writeFileSync(path.join(OUT, `${c._id}.jpg`), await page.screenshot({ type: "jpeg", quality: 82, clip }));
    console.log(`${c._id.padEnd(26)} ${c.title}  [h ${h}, x ${Math.round(x0)}-${Math.round(x1)}]`);
}
await browser.close();
console.log(`\n${best.length} pictures in ${OUT}`);
