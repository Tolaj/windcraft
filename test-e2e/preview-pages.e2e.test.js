// End to end: a page made on the canvas is a page, so Preview (the prototype view) lists it. Its default category ("Application Components") alone would make it a component.
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

const previewTitles = async (ctx) => {
    const html = await (await ctx.request.get(`${stack.base}/prototype/${ids.project}`)).text();
    const m = /"items":(\[.*?\]),"owner"/s.exec(html.replace(/\\u003c/g, "<"));
    return m ? JSON.parse(m[1]).map((i) => i.title) : [];
};

test("a page created on the canvas shows in Preview; saving its details again keeps it a page", { skip: skip || false, timeout: 120000 }, async () => {
    const ctx = await browser.newContext();
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const make = async (title, kind) => (await (await ctx.request.post(`${stack.base}/api/components`, { data: { title, category: "apps-general", description: "x", htmlCode: "<p>hi</p>", tags: "", project: ids.project, ...(kind ? { kind } : {}) } })).json()).data || {};
    const plain = await make("Made as a component");
    const page = await make("Made on the canvas", "page");
    assert.equal(plain.kind, "component", "a category that is not a Pages one still makes a component");
    assert.equal(page.kind, "page", "a page that says it is one is one");
    const titles = await previewTitles(ctx);
    assert.ok(titles.includes("Made on the canvas"), `Preview lists it (${titles})`);
    assert.ok(!titles.includes("Made as a component"), "and still leaves out a component");
    // the details dialog sends the category again: that is not a change of category
    const put = await ctx.request.put(`${stack.base}/api/components/${page._id}`, { data: { category: "apps-general", title: "Made on the canvas" } });
    assert.equal(put.status(), 200);
    assert.ok((await previewTitles(ctx)).includes("Made on the canvas"), "still a page after its details are saved");
    await ctx.close();
});

test("Preview plays whatever is placed on the canvas, and the details dialog has a Type that changes the label", { skip: skip || false, timeout: 150000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const make = async (title, extra = {}) => (await (await ctx.request.post(`${stack.base}/api/components`, { data: { title, category: "apps-general", description: "x", htmlCode: "<p>hi</p>", tags: "", project: ids.project, ...extra } })).json()).data;
    const placed = await make("A component on the canvas", { kind: "component" });
    const loose = await make("A component not placed", { kind: "component" });
    assert.equal((await ctx.request.put(`${stack.base}/api/components/${placed._id}`, { data: { board: { x: 100, y: 100 } } })).status(), 200);
    const titles = await previewTitles(ctx);
    assert.ok(titles.includes("A component on the canvas"), `a component placed on the canvas is in Preview (${titles})`);
    assert.ok(!titles.includes("A component not placed"), "one that is not placed is not");
    // the Type in the details dialog
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${loose._id}`);
    await page.waitForSelector("#detailsBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    await page.evaluate(() => document.getElementById("detailsBtn").click());
    await page.waitForSelector("#dKind", { state: "visible" });
    assert.equal(await page.locator("#dKind").getAttribute("data-value"), "component", "it shows what the design is now");
    assert.equal(await page.locator("#dKind").getAttribute("aria-checked"), "false", "the switch is off for a component");
    await page.locator("#dKind").click();
    assert.equal(await page.locator("#dKind").getAttribute("data-value"), "page", "the switch turns it into a page");
    assert.equal(await page.locator("#dKind").getAttribute("aria-checked"), "true");
    // Visibility is a switch too: it follows what the design is, and flips
    const vis = await page.locator("#dVis").getAttribute("aria-checked");
    await page.locator("#dVis").click();
    assert.notEqual(await page.locator("#dVis").getAttribute("aria-checked"), vis);
    await page.locator("#dVis").click();
    await page.locator("#detailsSave").click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 15000 });
    const kind = async () => (await (await ctx.request.get(`${stack.base}/api/components/${loose._id}`, { headers: { accept: "application/json" } })).json()).data?.kind;
    const t = Date.now(); let k = ""; while (Date.now() - t < 10000 && k !== "page") { k = await kind(); await page.waitForTimeout(300); }
    assert.equal(k, "page", "the Type was saved");
    assert.ok((await previewTitles(ctx)).includes("A component not placed"), "and now it is a page, so Preview plays it");
    await ctx.close();
});

test("Go to page: a button opens another page in Preview and in Interact", { skip: skip || false, timeout: 170000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#codeBtn", { state: "attached" });
    await page.waitForTimeout(3500);
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(1326, 33);
    await page.evaluate(() => document.getElementById("frame").contentWindow.postMessage({ cmd: "select", paths: [[0, 0]] }, "*")); // the first button
    await page.waitForSelector('[title^="Add an interaction"]');
    await page.waitForTimeout(500);
    await page.locator('[title^="Add an interaction"]').click();
    const card = page.locator(".irule").last();
    await card.locator("select").nth(1).selectOption("goto");
    const pageSel = card.locator("select").nth(2);
    const options = await pageSel.locator("option").allTextContents();
    assert.ok(options.includes("Brand"), `the project's pages are listed (${options})`);
    assert.ok(!options.some((t) => /Header/.test(t)), "the parts made from a page are not");
    await pageSel.selectOption({ label: "Brand" });
    await page.locator("#codeBtn").click();
    await page.waitForSelector("#codeMount .cm-content");
    await page.waitForFunction((id) => (document.querySelector("#codeMount .cm-content")?.textContent || "").includes(`data-wc-do="click goto ${id}"`), ids.brand, { timeout: 20000 });
    await page.locator("#saveBtn").click();
    await page.waitForFunction(() => /^Saved/.test(document.getElementById("saveState").textContent.trim()), null, { timeout: 15000 });
    // Interact: the click opens Brand in the editor and Interact goes on there
    await page.locator('[data-tool="interact"]').first().click();
    const f = async () => { const t = Date.now(); while (Date.now() - t < 15000) { for (const fr of page.frames().filter((x) => x !== page.mainFrame())) { try { if (await fr.evaluate(() => Boolean(document.getElementById("a")))) return fr; } catch { /* loading */ } } await page.waitForTimeout(250); } throw new Error("no frame"); };
    await (await f()).locator("#a").click();
    await page.waitForFunction(() => document.getElementById("designsName").textContent.trim() === "Brand", null, { timeout: 15000 });
    // Preview: the prototype view switches page in its player
    const proto = await ctx.newPage();
    await proto.goto(`${stack.base}/prototype/${ids.project}?page=${ids.page}`);
    await proto.waitForSelector("[data-title]");
    await proto.waitForFunction(() => /Home/.test(document.querySelector("[data-title]").textContent), null, { timeout: 20000 });
    const frame = async () => { const t = Date.now(); while (Date.now() - t < 20000) { for (const fr of proto.frames().filter((x) => x !== proto.mainFrame())) { try { if (await fr.evaluate(() => Boolean(document.getElementById("a")))) return fr; } catch { /* loading */ } } await proto.waitForTimeout(250); } throw new Error("no frame"); };
    await (await frame()).locator("#a").click();
    await proto.waitForFunction(() => /Brand/.test(document.querySelector("[data-title]").textContent), null, { timeout: 15000 });
    await ctx.close();
});
