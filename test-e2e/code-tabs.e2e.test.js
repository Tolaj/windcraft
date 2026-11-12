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

test("Interactions: a rule on the selected element (chosen from the list or picked on the canvas), an arrow to its target, and it works in Interact", { skip: skip || false, timeout: 170000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#codeBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(1326, 33);
    // select the first button (the outer box's first child) the way the layers panel does
    await page.evaluate(() => document.getElementById("frame").contentWindow.postMessage({ cmd: "select", paths: [[0, 0]] }, "*"));
    await page.waitForSelector('[title^="Add an interaction"]');
    assert.equal(await page.locator("#inspector").textContent().then((t) => /Interactions/.test(t)), true, "the panel has an Interactions section");
    await page.locator('[title^="Add an interaction"]').click();
    // When: Clicked, Do: Show or hide (the defaults); On: the other button, from the list
    assert.equal(await page.locator(".irule select").nth(2).evaluate((e) => e.options[e.selectedIndex].textContent), "Choose an element…", "a new rule has no element chosen yet");
    const widths = await page.locator(".irule .frow > label").evaluateAll((l) => l.map((x) => Math.round(x.getBoundingClientRect().width)));
    assert.equal(new Set(widths).size, 1, `the three rows are the same width (${widths})`);
    const sel = page.locator(".irule select").nth(2);
    const value = await sel.evaluate((s) => [...s.options].find((o) => /#b\b/.test(o.textContent)).value);
    await sel.selectOption(value);
    await page.waitForFunction(() => document.querySelectorAll(".irule").length === 1 && /starts hidden/.test(document.querySelector(".irule").textContent), null, { timeout: 8000 });
    // the canvas outlines the element it acts on (and draws an arrow to it when there is room)
    await page.waitForFunction(() => document.querySelectorAll("#sel .slinks rect").length >= 1, null, { timeout: 8000 });
    // the markup carries the rule, and the script sits in the HTML tab, not in the page's own JS
    await page.locator("#codeBtn").click();
    await page.waitForSelector("#codeMount .cm-content");
    const html = await page.locator("#codeMount .cm-content").textContent();
    assert.match(html, /data-wc-do="click toggle b"/);
    assert.match(html, /wc-interact/);
    await page.locator('[data-ctab="js"]').click();
    assert.doesNotMatch(await page.locator("#codeMount .cm-content").textContent(), /wc-interact/, "the editor's script is not the page's own JavaScript");
    await page.locator('[data-ctab="html"]').click();
    // starts hidden: set on the target
    await page.locator(".irule .ichk input").check();
    await page.waitForTimeout(900);
    assert.match(await page.locator("#codeMount .cm-content").textContent(), /data-wc-start="hidden"/);
    // a second rule, with the target picked on the canvas: when the page loads, hide it
    await page.locator('[title^="Add an interaction"]').click();
    const rules = page.locator(".irule");
    await rules.last().locator("select").nth(0).selectOption("load");
    await rules.last().locator("select").nth(1).selectOption("hide");
    await rules.last().locator('[title^="Pick it on the canvas"]').click();
    const frame = await frameWith(page, "b");
    const box = await frame.locator("#b").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => document.querySelectorAll(".irule").length === 2, null, { timeout: 8000 });
    assert.match(await page.locator("#codeMount .cm-content").textContent().then((t) => t), /data-wc-do="click toggle b;load hide b"/);
    await page.locator("#saveBtn").click();
    await page.waitForFunction(() => /^Saved/.test(document.getElementById("saveState").textContent.trim()), null, { timeout: 15000 });
    // Interact: it starts hidden; clicking the first button shows it, and again hides it
    await page.locator('[data-tool="interact"]').first().click();
    await until(page, "b", (i) => document.getElementById(i).classList.contains("hidden"), 12000);
    await (await frameWith(page, "a")).locator("#a").click();
    await until(page, "b", (i) => !document.getElementById(i).classList.contains("hidden"), 8000);
    await (await frameWith(page, "a")).locator("#a").click();
    await until(page, "b", (i) => document.getElementById(i).classList.contains("hidden"), 8000);
    await ctx.close();
});

test("Interactions: Change classes rebuilds a drawer menu with no JavaScript written (open adds w-full and removes w-0, close does the reverse)", { skip: skip || false, timeout: 170000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const html = '<div class="p-6"><button id="open" class="p-2 bg-black text-white">open</button><div id="menu" class="w-0 overflow-hidden"><a href="#">Home</a><button id="close" class="p-2 bg-black text-white">close</button></div></div>';
    assert.equal((await ctx.request.put(`${stack.base}/api/components/${ids.effects}`, { data: { htmlCode: html } })).status(), 200);
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.effects}`);
    await page.waitForSelector("#codeBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(1326, 33);
    const rule = async (path, add, remove) => {
        await page.evaluate((p) => document.getElementById("frame").contentWindow.postMessage({ cmd: "select", paths: [p] }, "*"), path);
        await page.waitForSelector('[title^="Add an interaction"]');
        await page.waitForTimeout(500);
        await page.locator('[title^="Add an interaction"]').click();
        const card = page.locator(".irule").last();
        await card.locator("select").nth(1).selectOption("classes");
        const sel = card.locator("select").nth(2);
        await sel.selectOption(await sel.evaluate((s) => [...s.options].find((o) => /#menu\b/.test(o.textContent)).value));
        await card.locator(".cchip").first().waitFor();
        const chips = (n, text) => card.locator(".cchip").nth(n).locator("input");
        // Add: type most of the name and take the suggestion; Remove: type it whole and press Enter
        await chips(0).fill(add.slice(0, -1));
        await card.locator(".csug button").filter({ hasText: new RegExp(`^${add}$`) }).first().click();
        await chips(1).fill(remove); await chips(1).press("Enter");
        await card.locator(".cchip .chip").first().waitFor();
        await card.getByText("Add this interaction").click();
        await page.waitForTimeout(700);
    };
    await rule([0, 0], "w-full", "w-0");
    await rule([0, 1, 1], "w-0", "w-full");
    await page.locator("#codeBtn").click();
    await page.waitForSelector("#codeMount .cm-content");
    const code = await page.locator("#codeMount .cm-content").textContent();
    assert.match(code, /data-wc-do="click classes menu \+w-full\|-w-0"/);
    assert.match(code, /data-wc-do="click classes menu \+w-0\|-w-full"/);
    await page.locator('[data-ctab="js"]').click();
    assert.equal((await page.locator("#codeMount .cm-content").textContent()).trim(), "", "no JavaScript was written");
    await page.locator('[data-tool="interact"]').first().click();
    const classesOf = async () => { const f = await frameWith(page, "menu"); return f.evaluate(() => document.getElementById("menu").className); };
    await until(page, "menu", (i) => document.getElementById(i).classList.contains("w-0"), 12000);
    await (await frameWith(page, "open")).locator("#open").click();
    await until(page, "menu", (i) => document.getElementById(i).classList.contains("w-full") && !document.getElementById(i).classList.contains("w-0"), 8000);
    await (await frameWith(page, "close")).locator("#close").click();
    await until(page, "menu", (i) => document.getElementById(i).classList.contains("w-0") && !document.getElementById(i).classList.contains("w-full"), 8000);
    assert.match(await classesOf(), /overflow-hidden/, "its other classes are left alone");
    await ctx.close();
});
