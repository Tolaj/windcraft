// End to end: on a project board with more frames than previews it can hold, the frames that match the selected tag load their previews first.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { missingPrerequisite, chromePath, startStack, seed, within } from "./helpers.js";

const skip = missingPrerequisite();
let stack, ids, browser;
before(async () => {
    if (skip) return;
    stack = await startStack();
    ids = await seed();
    browser = await chromium.launch({ executablePath: chromePath(), headless: true });
});
after(async () => { if (skip) return; if (browser) await within(browser.close()); if (stack) await within(stack.stop(), 20000); });

test("selecting a tag loads the previews of the frames that match it first", { skip: skip || false, timeout: 240000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    // 70 frames in seven groups of ten (a row each, as on a real board: more frames in view than the board keeps live at once); three of every ten carry the tag "wanted"
    for (let i = 0; i < 70; i++) {
        const wanted = i % 10 >= 7;
        const r = await ctx.request.post(`${stack.base}/api/components`, { data: { title: `Frame ${String(i).padStart(2, "0")}`, category: "apps-general", description: "x", htmlCode: `<div class="p-8"><h1 class="text-2xl">Frame ${i}</h1></div>`, tags: wanted ? "wanted" : "other", project: ids.project, kind: "page", group: `Group ${Math.floor(i / 10)}` } });
        assert.equal(r.status(), 201, `frame ${i} saved`);
    }
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.locator("#board").waitFor({ timeout: 60000 });
    // a middle zoom where all the frames are near enough to count, so the limit (not the distance) decides which get a preview
    await page.evaluate(async () => {
        const b = document.getElementById("board"), r = b.getBoundingClientRect();
        let n = 0;
        while (parseFloat(document.getElementById("zoomLabel").textContent) < 12 && n++ < 200) b.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -20, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll(".fwrap iframe").length >= 20, null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        window.__added = [];
        const t0 = performance.now();
        new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
            if (n.nodeName !== "IFRAME") return;
            const w = n.closest(".fwrap");
            window.__added.push({ t: Math.round(performance.now() - t0), title: w.querySelector(".flabel").textContent, match: w.style.opacity !== "0.18" });
        }))).observe(document.getElementById("world"), { childList: true, subtree: true });
    });
    await page.locator('#fTags [data-tag="wanted"]').click();
    await page.waitForTimeout(3500);

    // the matching frames that are in or near view (what the board counts as near: the screen and 400 px around it)
    const wanted = await page.evaluate(() => {
        const r = document.getElementById("board").getBoundingClientRect(), m = 400;
        return [...document.querySelectorAll(".fwrap")].filter((w) => w.style.opacity !== "0.18").map((w) => {
            const q = w.getBoundingClientRect();
            return { title: w.querySelector(".flabel").textContent, near: q.right > r.left - m && q.left < r.right + m && q.bottom > r.top - m && q.top < r.bottom + m, live: Boolean(w.querySelector("iframe")) };
        });
    });
    assert.equal(wanted.length, 21, "twenty-one frames match the tag");
    const near = wanted.filter((w) => w.near);
    assert.ok(near.length >= 10, `enough matching frames are in view to matter (${near.length})`);
    assert.ok(near.every((w) => w.live), `every matching frame in view has its preview (${JSON.stringify(near.filter((w) => !w.live).map((w) => w.title))})`);
    assert.ok(await page.evaluate(() => document.querySelectorAll(".fwrap iframe").length) <= 40, "and the board still holds no more than 40 previews");
    const added = await page.evaluate(() => window.__added);
    const lastMatch = Math.max(0, ...added.filter((a) => a.match).map((a) => a.t));
    const firstOther = Math.min(Infinity, ...added.filter((a) => !a.match).map((a) => a.t));
    assert.ok(lastMatch <= firstOther, `the matching previews were added before any other (matches by ${lastMatch} ms, others from ${firstOther} ms)`);
    await ctx.close();
});
