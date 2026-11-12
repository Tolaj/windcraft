// End to end: a project's "Publish all frames" switch. On, every frame is in the gallery; off, none is; making a single frame private turns it off (it reads off the frames).
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

const projectData = async (ctx) => {
    const html = await (await ctx.request.get(`${stack.base}/projects/${ids.project}`)).text();
    return JSON.parse(/<script id="projectData" type="application\/json">(.*?)<\/script>/s.exec(html)[1].replace(/\\u003c/g, "<"));
};
const frames = (data) => data.items.filter((i) => i.kind !== "section");

test("Publish all frames: on publishes every frame, off makes them private, one private frame turns it off (project page and editor)", { skip: skip || false, timeout: 240000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const put = (data) => ctx.request.put(`${stack.base}/api/projects/${ids.project}`, { data });

    await put({ published: false });
    assert.ok(frames(await projectData(ctx)).every((f) => !f.isPublished), "off: all private");
    const on = await (await put({ published: true })).json();
    assert.equal(on.data.published, true);
    assert.ok(frames(await projectData(ctx)).every((f) => f.isPublished), "on: every frame is public");

    const page = await ctx.newPage();
    await page.goto(`${stack.base}/projects/${ids.project}`);
    const box = page.locator("#details [data-publish-toggle]");
    await box.waitFor({ timeout: 30000 });
    assert.equal(await box.isChecked(), true, "the project page shows it on");
    assert.ok((await page.locator("#fCat option").count()) > 1, "the category filter lists the categories the frames are in");
    await box.click();
    await page.waitForFunction(() => !document.querySelector("#details [data-publish-toggle]").checked, null, { timeout: 10000 });
    assert.ok(frames(await projectData(ctx)).every((f) => !f.isPublished), "off from the project page: all private");

    // one frame made public is not all: the switch stays off; all public by hand turns it on in the editor's panel
    await put({ published: true });
    const first = frames(await projectData(ctx))[0];
    assert.equal((await ctx.request.put(`${stack.base}/api/components/${first.id}`, { data: { isPublished: false } })).status(), 200);

    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.locator("#panelBtn").waitFor({ timeout: 60000 });
    if (!(await page.locator("#inspector").isVisible())) await page.locator("#panelBtn").click();
    await page.waitForTimeout(2500);
    await page.mouse.click(1000, 862); // the empty canvas
    const sw = page.locator("#inspector").getByLabel("Publish all frames");
    await sw.waitFor({ timeout: 20000 });
    assert.equal(await sw.isChecked(), false, "one private frame: the switch is off");
    await sw.click();
    await page.waitForFunction(() => document.querySelector("#inspector input[type=checkbox]") && [...document.querySelectorAll("#inspector label")].find((l) => l.textContent.includes("Publish all frames")).querySelector("input").checked, null, { timeout: 10000 });
    assert.ok(frames(await projectData(ctx)).every((f) => f.isPublished), "on in the editor: every frame is public");
    await ctx.close();
});
