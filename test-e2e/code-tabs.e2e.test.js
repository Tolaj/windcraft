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
    assert.deepEqual(await page.locator("#codeTabs [data-ctab]").allTextContents().then((a) => a.map((t) => t.replace(/\d+/g, ""))), ["HTML", "CSS", "JS", "Config"]);
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
    await page.waitForFunction(() => /^Saved/.test(document.getElementById("saveState").textContent.trim()), null, { timeout: 15000 }); // not just a disabled button: it is disabled while saving too
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

test("the Config tab holds the project's Tailwind file, which applies by itself; the panel has no config row", { skip: skip || false, timeout: 170000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#codeBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    await page.locator("#codeBtn").click();
    await page.locator('[data-ctab="config"]').click();
    await page.waitForSelector("#codeConfig [data-ta]", { state: "visible" });
    assert.equal(await page.locator("#codeMount").isVisible(), false, "the code editor makes room for the config");
    assert.equal(await page.locator("#codeFormat").isVisible(), false, "Format is for code, not for the config");
    assert.equal(await page.locator("#codeConfig [data-tabs]").isVisible(), false, "one file: no file tabs");
    assert.equal(await page.locator("#codeConfig [data-apply]").isVisible(), false, "no Apply: it applies itself");
    assert.equal(await page.locator("#codeConfig .cfe-res").isVisible(), false, "no result column");
    assert.match(await page.locator("#codeConfig [data-status]").textContent(), /Every page uses this file/);
    assert.equal(await page.locator("#codeConfig [data-diag]").isVisible(), false, "no extra row: the hint shares the line with Reset");
    assert.doesNotMatch(await page.locator("#inspector").textContent(), /Tailwind config/, "the page's panel has no config row");
    // typing in the project's file reaches the canvas by itself
    await page.locator("#codeConfig [data-ta]").fill('module.exports = {\n  theme: { extend: { colors: { proj: "#0f766e" } } },\n};\n');
    await page.waitForFunction(() => /^Applied/.test(document.querySelector("#codeConfig [data-status]").textContent), null, { timeout: 30000 });
    await until(page, "b", (i) => getComputedStyle(document.getElementById(i)).backgroundColor === "rgb(15, 118, 110)", 20000);
    // the "Default values" button shows what is custom and what is Tailwind's default, in a dialog
    await page.locator("#codeConfig [data-values]").click();
    await page.waitForSelector("dialog[open] [data-res] details");
    assert.ok(await page.locator("dialog[open] [data-res] details[open]").count() >= 1, "the sections that were changed are open");
    assert.match(await page.locator("dialog[open] [data-res]").textContent(), /customised[\s\S]*Tailwind default/);
    assert.match(await page.locator("dialog[open] [data-res]").textContent(), /#0f766e/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("dialog[open]").count(), 0);
        // the "i" button shows how to add a plugin; the example for your own plugin is a file that works as it is
    await page.locator("#codeConfig [data-help]").click();
    await page.waitForSelector('dialog[open] [data-example="2"]');
    const example = await page.locator('dialog[open] [data-example="2"]').textContent();
    assert.match(example, /plugin\(function/);
    await page.keyboard.press("Escape");
    await page.locator("#codeConfig [data-ta]").fill(example);
    await page.waitForFunction(() => /^Applied/.test(document.querySelector("#codeConfig [data-status]").textContent), null, { timeout: 30000 });
    assert.match(await page.locator("#codeConfig [data-status]").textContent(), /^Applied to every page/, "the example runs without errors");
    await page.locator("#codeConfig [data-ta]").fill('module.exports = {\n  theme: { extend: { colors: { proj: "#0f766e" } } },\n};\n');
    await page.waitForFunction(() => /^Applied/.test(document.querySelector("#codeConfig [data-status]").textContent), null, { timeout: 30000 });
    // a refresh from elsewhere keeps what is in the tab
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("wc-config-changed")));
    assert.match(await page.locator("#codeConfig [data-ta]").inputValue(), /#0f766e/);
    // back to the code: the editor is where it was
    await page.locator('[data-ctab="html"]').click();
    assert.equal(await page.locator("#codeMount .cm-content").isVisible(), true);
    assert.equal(await page.locator("#codeFormat").isVisible(), true);
    await ctx.close();
});

test("Add a behaviour: the selected element is filled in, the script goes into the JS tab, and it works in Interact", { skip: skip || false, timeout: 170000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#codeBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    // a first click selects the outer box
    const frame = await frameWith(page, "a");
    const box = await frame.locator("#a").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);
    await page.locator("#codeBtn").click();
    await page.locator('[data-ctab="js"]').click();
    assert.equal(await page.locator("#codeBehaviour").isVisible(), true, "the button is on the JS tab");
    await page.locator('[data-ctab="css"]').click();
    assert.equal(await page.locator("#codeBehaviour").isVisible(), false, "and only there");
    await page.locator('[data-ctab="js"]').click();
    await page.locator("#codeBehaviour").click();
    assert.deepEqual(await page.locator('[role=menuitem] .font-medium').allTextContents(), ["Toggle menu", "Modal", "Tabs"]);
    await page.locator('[role=menuitem][data-b="toggle-menu"]').click();
    await page.waitForSelector("#behaviourDlg[open]");
    assert.equal(await page.locator('#behaviourDlg [name="button"]').inputValue(), "#div-1", "the selected element (the page's outer box, which has no id) is filled in with an id it will get");
    assert.match(await page.locator("#behaviourDlg").textContent(), /gets div-1/);
    // an empty field is named, and nothing is added
    await page.locator("#behaviourDlg [data-add]").click();
    assert.match(await page.locator("#behaviourDlg [data-err]").textContent(), /Fill in: Menu/);
    await page.locator('#behaviourDlg [name="menu"]').fill("#b");
    await page.locator("#behaviourDlg [data-add]").click();
    await page.waitForFunction(() => !document.getElementById("behaviourDlg").open);
    const code = await page.locator("#codeMount .cm-content").textContent();
    assert.match(code, /Toggle menu: #div-1 shows and hides #b/);
    assert.match(code, /querySelector\("#b"\)/);
    // the outer box got its id, in the markup
    await page.locator('[data-ctab="html"]').click();
    assert.match(await page.locator("#codeMount .cm-content").textContent(), /id="div-1"/);
    // it runs in Interact
    await page.waitForTimeout(900);
    await page.locator('[data-tool="interact"]').first().click();
    await until(page, "b", (i) => !document.getElementById(i).classList.contains("hidden"));
    await page.waitForTimeout(500);
    const live = await frameWith(page, "div-1");
    await live.locator("#div-1").click({ position: { x: 3, y: 3 } });
    await until(page, "b", (i) => document.getElementById(i).classList.contains("hidden"), 8000);
    await (await frameWith(page, "div-1")).locator("#div-1").click({ position: { x: 3, y: 3 } });
    await until(page, "b", (i) => !document.getElementById(i).classList.contains("hidden"), 8000);
    await ctx.close();
});
