// End to end: a project with more frames than the editor holds opens on one group at a time; the switcher changes group in place, and the Group field suggests the project's groups.
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

test("the editor shows one group of a big project and switches group in place", { skip: skip || false, timeout: 240000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const make = async (n, group) => { for (let i = 0; i < n; i++) { const r = await ctx.request.post(`${stack.base}/api/components`, { data: { title: `${group} ${i}`, category: "apps-general", description: "x", htmlCode: `<div class="p-8"><h1>${group} ${i}</h1></div>`, tags: "t", project: ids.project, kind: "page", group } }); assert.equal(r.status(), 201); } };
    await make(35, "Alpha"); await make(35, "Beta"); // with the seeded frame that is over 60: no "All"

    const api = async (q) => (await ctx.request.get(`${stack.base}/api/projects/${ids.project}/frames${q}`));
    assert.equal((await api("")).status(), 400, "a big project asks which group");
    const beta = (await (await api("?group=Beta")).json()).data;
    assert.equal(beta.frames.length, 35);
    assert.equal(beta.group, "Beta");

    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.locator("#panelBtn").waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    if (!(await page.locator("#leftPanel").isVisible())) await page.locator("#leftBtn").click();
    const sel = page.locator("[data-group-select]:visible").first();
    await sel.waitFor({ timeout: 30000 });
    const options = await sel.locator("option").allTextContents();
    assert.ok(options.some((t) => t.startsWith("Alpha · 35")) && options.some((t) => t.startsWith("Beta · 35")), `the groups are counted (${options})`);
    assert.ok(!options.some((t) => t.startsWith("All frames")), "a big project has no All choice");
    const own = await page.locator(".fwrap").count();
    assert.ok(own < 40, `only the frame's own group is on the canvas (${own})`);

    await sel.selectOption({ label: options.find((t) => t.startsWith("Beta")) });
    await page.waitForFunction(() => document.querySelectorAll(".fwrap").length === 35 && [...document.querySelectorAll(".flabel")].every((l) => l.textContent.includes("Beta")), null, { timeout: 30000 });
    await ctx.close();
});
