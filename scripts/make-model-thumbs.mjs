// Makes the picture of each free 3D model in the editor's models dialog: the model drawn by the editor's own 3D runtime on a transparent background, cropped to
// its outline and centred with even space around it, as a small WebP. They are saved as data URLs in packages/editor/design/editor/model-thumbs.js, so the
// dialog needs no image files and no network for them.
// Run it when the list of models (SAMPLE_MODELS in packages/core/model3d.js) changes:  node scripts/make-model-thumbs.mjs
// (needs Chrome, and the network to fetch the models and Three.js from the CDN; each model is 2 to 12 MB, so a full run takes a few minutes)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SAMPLE_MODELS, MODEL_SCRIPT, sampleUrl } from "../packages/core/model3d.js";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../packages/editor/design/editor/model-thumbs.js");
const SIZE = 192; // the picture, in px (the tile shows it at about 100 to 200)
// a little from the side and above (most models read best that way), and smaller than the runtime's default framing: that frames a model tightly (its
// bounding sphere is 72% of the view), which cuts the ends off a long one such as a sneaker or a sofa. A set `model-size` (px of the 384) gives every
// model room; the crop below takes the empty space away again.
const VIEW = "rotation:0 -32 0; camera-angle:12; model-size:170";
const only = process.argv.slice(2);
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter((p) => p && fs.existsSync(p))[0];
if (!chrome) throw new Error("Chrome was not found (set CHROME_PATH)");

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
page.on("pageerror", (e) => console.log("  page error:", e.message.slice(0, 160)));
await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent"><div id="stage" style="width:384px;height:384px"></div><script>${MODEL_SCRIPT.replace(/^\/\*wc-model\*\//, "")}</script>`);

// one model: load it, draw it, find where it is in the picture (its alpha), crop to that, and fit it in a SIZE × SIZE square with space around
const render = (src, view, size) => page.evaluate(async ([src, view, size]) => {
    const stage = document.getElementById("stage");
    stage.innerHTML = `<wc-model src="${src}" style="width:384px;height:384px"></wc-model>`;
    const m = stage.firstChild;
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("the model did not load in 120 s")), 120000); m.addEventListener("load", () => { clearTimeout(t); res(); }); m.addEventListener("error", (e) => { clearTimeout(t); rej(new Error(String(e.detail || "load error"))); }); });
    await new Promise((r) => setTimeout(r, 300));
    const png = m._snap(view, 384);
    stage.innerHTML = ""; // lets go of its 3D context
    if (!png) throw new Error("no picture");
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = png; });
    const c = document.createElement("canvas"); c.width = c.height = 384;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, 384, 384).data;
    let x0 = 384, y0 = 384, x1 = -1, y1 = -1;
    for (let j = 0; j < 384; j++) for (let i = 0; i < 384; i++) if (d[(j * 384 + i) * 4 + 3] > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    if (x1 < 0) throw new Error("the picture is empty");
    const w = x1 - x0 + 1, h = y1 - y0 + 1, pad = size * 0.1, k = (size - 2 * pad) / Math.max(w, h);
    const o = document.createElement("canvas"); o.width = o.height = size;
    const ox = o.getContext("2d");
    ox.imageSmoothingQuality = "high";
    ox.drawImage(c, x0, y0, w, h, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
    return { url: o.toDataURL("image/webp", 0.88), w, h };
}, [src, view, size]);

const out = {};
for (const m of SAMPLE_MODELS) {
    if (only.length && !only.includes(m.id)) continue;
    process.stdout.write(`${m.id.padEnd(26)}`);
    try {
        const r = await render(sampleUrl(m), VIEW, SIZE);
        out[m.id] = r.url;
        console.log(`${Math.round(r.url.length / 1024)} KB  (the model is ${r.w}×${r.h} of 384)`);
    } catch (e) { console.log("FAILED:", e.message.slice(0, 120)); }
}
await browser.close();

// keep the pictures of models not rendered this time (when only some were asked for)
let keep = {};
if (only.length && fs.existsSync(OUT)) keep = (await import(`${OUT}?t=${Date.now()}`)).THUMBS;
const all = { ...keep, ...out };
const body = SAMPLE_MODELS.filter((m) => all[m.id]).map((m) => `    ${JSON.stringify(m.id)}: ${JSON.stringify(all[m.id])},`).join("\n");
fs.writeFileSync(OUT, `// Made by scripts/make-model-thumbs.mjs: the picture of each free 3D model (a transparent WebP, as a data URL). Do not edit by hand.\nexport const THUMBS = {\n${body}\n};\n`);
console.log(`\n${Object.keys(all).length} of ${SAMPLE_MODELS.length} pictures saved to ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
