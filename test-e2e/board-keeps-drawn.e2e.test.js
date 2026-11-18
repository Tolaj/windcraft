// End to end: a frame that has been drawn on a project board stays there, even past the number of live previews the board keeps (it becomes a static copy).
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

test("a drawn frame stays drawn after the board's live limit is passed", { skip: skip || false, timeout: 240000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    for (let i = 0; i < 30; i++) {
        const r = await ctx.request.post(`${stack.base}/api/components`, { data: { title: `Keep ${String(i).padStart(2, "0")}`, category: "apps-general", description: "x", htmlCode: `<div class="p-8"><h1 class="text-2xl font-bold text-red-600">Keep ${i}</h1></div>`, tags: "k", project: ids.project, kind: "page", group: `Group ${Math.floor(i / 10)}` } });
        assert.equal(r.status(), 201);
    }
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.__KEEP_MAX = 6; });
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.locator("#board").waitFor({ timeout: 60000 });
    await page.evaluate(async () => {
        const b = document.getElementById("board"), r = b.getBoundingClientRect();
        let n = 0;
        while (parseFloat(document.getElementById("zoomLabel").textContent) < 12 && n++ < 200) b.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -20, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    });
    // everything the board can draw gets drawn, one after another, with only 6 live at a time
    await page.waitForFunction(() => document.querySelectorAll(".fwrap iframe").length >= 25, null, { timeout: 120000 });
    await page.waitForTimeout(6000);
    // pan away (the board counts what is live against its limit each time the view changes), then let it settle
    await page.evaluate(() => { const b = document.getElementById("board"); b.dispatchEvent(new WheelEvent("wheel", { deltaY: 3000, bubbles: true, cancelable: true })); });
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => {
        const all = [...document.querySelectorAll(".fwrap")];
        const withFrame = all.filter((w) => w.querySelector("iframe")).length;
        const frozen = all.filter((w) => w.querySelector('iframe[sandbox=""]')).length;
        const styled = [...document.querySelectorAll('iframe[sandbox=""]')].filter((f) => /tailwindcss v\d/.test(f.srcdoc || "") && (!/Keep \d/.test(f.srcdoc || "") || /text-red-600/.test(f.srcdoc || ""))).length;
        const bad = [...document.querySelectorAll('iframe[sandbox=""]')].filter((f) => !(/tailwindcss v\d/.test(f.srcdoc || "") && (!/Keep \d/.test(f.srcdoc || "") || /text-red-600/.test(f.srcdoc || "")))).map((f) => ({ len: (f.srcdoc || "").length, tw: /tailwindcss v\d/.test(f.srcdoc || ""), red: /text-red-600/.test(f.srcdoc || ""), head: (f.srcdoc || "").slice(0, 200) }));
        return { total: all.length, withFrame, frozen, styled, bad };
    });
    assert.ok(r.frozen > 0, `some frames became static copies: ${JSON.stringify(r)}`);
    assert.equal(r.styled, r.frozen, `every static copy carries its styling: ${JSON.stringify(r)}`);
    assert.ok(r.withFrame >= 25, `no drawn frame went away: ${JSON.stringify(r)}`);
    await ctx.close();
});
