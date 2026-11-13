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
