// End to end: the Code panel's HTML, CSS and JS tabs. What is written in a tab reaches the page, is saved with it, and the script runs in Interact.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { missingPrerequisite, chromePath, startStack, seed } from "./helpers.js";

const skip = missingPrerequisite();
let stack, ids, browser;
before(async () => {
    if (skip) return;
    stack = await startStack();
    ids = await seed();
    browser = await chromium.launch({ executablePath: chromePath(), headless: true });
});
after(async () => { if (skip) return; if (browser) await browser.close(); if (stack) await stack.stop(); });

const frameWith = async (page, id, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { for (const f of page.frames().filter((x) => x !== page.mainFrame())) { try { if (await f.evaluate((i) => Boolean(document.getElementById(i)), id)) return f; } catch { /* still loading */ } } await page.waitForTimeout(250); } throw new Error(`no frame with #${id}`); };
/** Waits until `check` is true of the element in the canvas (the canvas reloads when the code changes, so the frame is found again each time). */
const until = async (page, id, check, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const f = await frameWith(page, id, 3000); if (await f.evaluate(check, id)) return; } catch { /* reloading */ } await page.waitForTimeout(250); } throw new Error(`#${id}: ${check}`); };
const typeInto = async (page, text) => { await page.locator("#codeMount .cm-content").click(); await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.insertText(text); };

test("the CSS and JS tabs write into the page, are saved with it, and the script runs in Interact", { skip: skip || false, timeout: 170000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.scroll}`);
    await page.waitForSelector("#codeBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    await page.locator("#codeBtn").click();
    await page.waitForSelector("#codeMount .cm-content");
    assert.deepEqual(await page.locator("#codeTabs [data-ctab]").allTextContents().then((a) => a.map((t) => t.replace(/\d+/g, ""))), ["HTML", "CSS", "JS"]);
    assert.equal(await page.locator('[data-ctab="html"]').getAttribute("aria-selected"), "true");

    // CSS: the page's own style reaches the canvas
    await page.locator('[data-ctab="css"]').click();
    await typeInto(page, "#r1 { color: rgb(255, 0, 0); }");
    await until(page, "r1", (i) => getComputedStyle(document.getElementById(i)).color === "rgb(255, 0, 0)");

    // JS: a script is kept without running on the canvas (the canvas shows the page at rest)
    await page.locator('[data-ctab="js"]').click();
    await typeInto(page, 'document.getElementById("r1").textContent = "changed by the script";');
    await page.waitForTimeout(1200);
    await until(page, "r1", (i) => document.getElementById(i).textContent === "reveal me");
    await page.waitForFunction(() => document.getElementById("codeJsDot").classList.contains("hidden"));

    // a syntax error is named with its line and marked on the tab, and fixing it clears both
    await typeInto(page, 'let a = ;\nfoo(');
    await page.waitForFunction(() => !document.getElementById("codeJsDot").classList.contains("hidden"), null, { timeout: 8000 });
    assert.match(await page.locator("#codeWarn").textContent(), /Line 1/);
    await typeInto(page, 'document.getElementById("r1").textContent = "changed by the script";');
    await page.waitForFunction(() => document.getElementById("codeJsDot").classList.contains("hidden"), null, { timeout: 8000 });
    await page.waitForTimeout(800);

    // HTML: the tab holds the markup, not the page's own CSS and JS
    await page.locator('[data-ctab="html"]').click();
    const html = await page.locator("#codeMount .cm-content").textContent();
    assert.match(html, /reveal me/);
    assert.doesNotMatch(html, /changed by the script|color: rgb\(255/);

    // it is a change to save, though the markup did not change; the saved page has both
    assert.equal(await page.locator("#saveBtn").isDisabled(), false, "CSS and JS count as unsaved changes");
    await page.locator("#saveBtn").click();
    await page.waitForFunction(() => document.getElementById("saveBtn").disabled, null, { timeout: 15000 });
    const code = (await (await ctx.request.get(`${stack.base}/api/components/${ids.scroll}/export?format=standalone`)).json()).code;
    assert.match(code, /rgb\(255, 0, 0\)/);
    assert.match(code, /changed by the script/);

    // reopened: the tabs hold what was saved, and Interact runs the script
    await page.reload();
    await page.waitForSelector("#codeBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    await page.locator("#codeBtn").click();
    await page.locator('[data-ctab="js"]').click();
    await page.waitForFunction(() => /changed by the script/.test(document.querySelector("#codeMount .cm-content").textContent));
    await page.locator('#toolbar [data-tool="interact"], [data-tool="interact"]').first().click();
    await until(page, "r1", (i) => document.getElementById(i).textContent === "changed by the script", 15000);
    await ctx.close();
});
