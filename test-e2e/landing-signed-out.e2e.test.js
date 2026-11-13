// End to end: the landing page for someone signed out: the sidebar starts closed, New design asks to sign in, the hero offers Get started and Documentation. Signed in, the sidebar starts open.
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

test("signed out: sidebar closed, New design goes to sign in, hero shows Get started and Documentation; signed in: sidebar open", { skip: skip || false, timeout: 120000 }, async () => {
    const out = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await out.newPage();
    await page.goto(`${stack.base}/`);
    await page.locator("#sidebar").waitFor({ state: "attached", timeout: 30000 });
    assert.equal(await page.locator("#sidebar").evaluate((e) => e.style.marginLeft), "-256px", "signed out: the sidebar starts closed");
    const nav = page.locator("#navNewDesign");
    assert.match((await nav.textContent()).trim(), /New design/);
    assert.match(await nav.getAttribute("href"), /\/auth\/sign-in/, "New design leads to the sign-in page");
    assert.ok(await page.getByRole("link", { name: "Documentation" }).first().isVisible(), "the hero links to the documentation");
    assert.ok(await page.getByRole("link", { name: "Get started" }).first().isVisible(), "and offers Get started");
    await page.getByRole("link", { name: "New design" }).click();
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 15000 });
    await out.close();

    const inn = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await inn.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const p2 = await inn.newPage();
    await p2.goto(`${stack.base}/`);
    await p2.locator("#sidebar").waitFor({ state: "attached", timeout: 30000 });
    assert.equal(await p2.locator("#sidebar").evaluate((e) => e.style.marginLeft), "0px", "signed in: the sidebar starts open");
    assert.ok(await p2.getByRole("link", { name: "Open your projects" }).isVisible(), "signed in: the hero keeps Open your projects");
    await inn.close();
});

test("the categories on the landing page are in A to Z order", { skip: skip || false, timeout: 120000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    for (const c of ["marketing-team", "forms-authentication", "marketing-hero", "apps-tables"]) {
        const r = await ctx.request.post(`${stack.base}/api/components`, { data: { title: `Sample ${c}`, category: c, description: "x", htmlCode: "<div class='p-6'>x</div>", tags: "t", isPublished: true, project: ids.project, kind: "page" } });
        assert.equal(r.status(), 201);
    }
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/`);
    await page.locator("#contentGrid .component-card h4").first().waitFor({ state: "attached", timeout: 30000 });
    const names = (await page.locator("#contentGrid .component-card h4").allTextContents()).map((t) => t.trim());
    assert.ok(names.length >= 4, `the cards are there (${names})`);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })), `the cards are A to Z (${names})`);
    await ctx.close();
});
