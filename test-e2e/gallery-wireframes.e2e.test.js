// End to end: the wireframe popup's Gallery tab. A published design goes into a selected wireframe slot (keeping the slot's size and place),
// the other way is one click away, the public gallery list is paged and carries no email, and the source is kept with the design.
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
    // another person's published designs: a sidebar and thirteen heroes (a page of twelve, and one more)
    const { default: User } = await import("../src/models/user.model.js");
    const { default: Component } = await import("../src/models/component.model.js");
    const ada = await User.create({ name: "Ada Author", email: "ada-secret@example.test", password: "x" });
    const docs = [{ title: "Sidebar nav", html: `<aside class="w-64 h-screen bg-white border-r p-6 fixed top-0"><p class="font-semibold">Menu</p><ul class="mt-4 space-y-2"><li>Home</li><li>Billing</li></ul></aside>`, tags: ["sidebar"] }];
    for (let i = 1; i <= 13; i++) docs.push({ title: `Hero ${i}`, html: `<section class="p-8 bg-white"><h1 class="text-3xl font-bold">Hero ${i}</h1></section>`, tags: ["hero"] });
    for (const [i, d] of docs.entries()) await Component.create({ title: d.title, htmlCode: d.html, category: "marketing-hero", description: d.title, tags: d.tags, createdBy: ada._id, isPublished: true, kind: "component", likes: i % 5, createdAt: new Date(Date.now() - i * 1000) });
    browser = await chromium.launch({ executablePath: chromePath(), headless: true });
});
after(async () => { if (skip) return; if (browser) await within(browser.close()); if (stack) await within(stack.stop(), 20000); });

test("the public gallery list is paged, searchable, and carries no email", { skip: skip || false, timeout: 60000 }, async () => {
    const ctx = await browser.newContext();
    const page1 = await (await ctx.request.get(`${stack.base}/api/gallery/designs`)).json();
    assert.equal(page1.data.items.length, 12, "a dozen to a page");
    assert.equal(page1.data.hasMore, true);
    const page2 = await (await ctx.request.get(`${stack.base}/api/gallery/designs?page=2`)).json();
    assert.ok(page2.data.items.length >= 2 && page2.data.items.length <= 12 && page2.data.hasMore === false, "the rest follow on the second page");
    const ids2 = new Set([...page1.data.items, ...page2.data.items].map((i) => i.id));
    assert.equal(ids2.size, page1.data.items.length + page2.data.items.length, "no design is on both pages");
    const found = await (await ctx.request.get(`${stack.base}/api/gallery/designs?q=sidebar&kind=component`)).json();
    assert.deepEqual(found.data.items.map((i) => i.title), ["Sidebar nav"]);
    assert.equal(found.data.items[0].author, "Ada Author");
    for (const url of ["/api/gallery/designs", "/api/components", `/api/components/${found.data.items[0].id}`]) {
        assert.ok(!(await (await ctx.request.get(stack.base + url)).text()).includes("ada-secret@example.test"), `${url} shows no email address`);
    }
    await ctx.close();
});

test("a gallery sidebar fills a wireframe's sidebar slot: the slot keeps its size and place, the design brings its look; the other way is one click", { skip: skip || false, timeout: 240000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const made = await (await ctx.request.post(`${stack.base}/api/components`, { data: { title: "Blank", category: "landing-page", description: "d", htmlCode: "<div></div>", project: ids.project, kind: "page" } })).json();
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${made.data._id}`);
    await page.locator("#panelBtn").waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    if (!(await page.locator("#inspector").isVisible())) await page.locator("#panelBtn").click();

    // a wireframe with a sidebar slot, put in the page
    await page.locator("#inspector .wfbtn").first().click();
    await page.locator("#layoutPicker").waitFor();
    assert.equal(await page.locator("[data-source]").count(), 2, "the popup has Wireframes and Gallery");
    await page.locator('[data-layout="pick-side"]').first().click();
    const frame = page.frameLocator("#frame");
    const aside = frame.locator("aside").first();
    await aside.waitFor({ timeout: 20000 });
    assert.match(await aside.getAttribute("class"), /bg-gray-300/, "the slot is in the placeholder grey");

    // select the slot (the first click takes the outer box, the second goes into it), open the popup again
    const box = await aside.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);
    if (!(await page.locator("#inspector").isVisible())) await page.locator("#panelBtn").click();
    await page.locator("#inspector .wfbtn").first().click();
    await page.locator("#layoutPicker").waitFor();
    assert.equal(await page.locator('[data-put="replace"]').getAttribute("aria-checked"), "true", "an empty slot: Replace is chosen for you");

    await page.locator('[data-source="gallery"]').click();
    await page.waitForSelector("[data-gid]", { timeout: 30000 });
    assert.ok((await page.locator("[data-gid]").count()) >= 12, "the gallery lists designs");
    await page.locator("[data-gq]").fill("sidebar");
    await page.waitForFunction(() => document.querySelectorAll("[data-gid]").length === 1, null, { timeout: 15000 });
    await page.waitForSelector("[data-gprev] iframe", { timeout: 15000 });
    await page.locator("[data-gid]").first().click();
    await page.waitForTimeout(2000);

    const cls = await frame.locator("aside").first().getAttribute("class");
    for (const kept of ["w-56", "shrink-0"]) assert.match(cls, new RegExp(`\\b${kept}\\b`), `the slot keeps ${kept}`);
    for (const look of ["bg-white", "border-r", "p-6"]) assert.match(cls, new RegExp(`\\b${look}\\b`), `the design brings ${look}`);
    for (const gone of ["fixed", "h-screen", "w-64", "bg-gray-300"]) assert.doesNotMatch(cls, new RegExp(`\\b${gone}\\b`), `${gone} is not on it`);
    assert.ok((await frame.locator("div.flex.gap-4 > div").count()) >= 1, "the layout around it stays");
    assert.match(await page.locator("#pickNote").innerText(), /Replaced it/);

    // the other way: inside the slot
    await page.locator("#pickNote [data-act]").click();
    await page.waitForTimeout(1800);
    const inner = await frame.locator("aside").first().evaluate((e) => ({ cls: e.getAttribute("class"), has: Boolean(e.querySelector("aside")) }));
    assert.ok(/bg-gray-300/.test(inner.cls) && inner.has, "the slot is back, with the sidebar inside it");

    // undo twice (the switch, then the pick): the empty slot
    await page.locator("#undoBtn").click(); await page.waitForTimeout(1200);
    await page.locator("#undoBtn").click(); await page.waitForTimeout(1500);
    assert.ok(await frame.locator("aside").evaluateAll((els) => els.length === 1 && !els[0].querySelector("aside") && /bg-gray-300/.test(els[0].className)), "two undos bring the empty slot back");

    // the source is kept with the design, not in its code
    const saved = await (await ctx.request.get(`${stack.base}/api/components/${made.data._id}`)).json();
    assert.ok((saved.data.sources || []).some((s) => s.title === "Sidebar nav" && s.author === "Ada Author"), "the design remembers where the sidebar came from");
    assert.ok(!saved.data.htmlCode.includes("Ada"), "and the code does not mention it");
    await ctx.close();
});

test("each design and layout has a full-preview icon: it opens a large preview over the dialog, Escape or Back returns, Use puts it in the page", { skip: skip || false, timeout: 240000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const made = await (await ctx.request.post(`${stack.base}/api/components`, { data: { title: "Blank two", category: "landing-page", description: "d", htmlCode: "<div></div>", project: ids.project, kind: "page" } })).json();
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${made.data._id}`);
    await page.locator("#panelBtn").waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    if (!(await page.locator("#inspector").isVisible())) await page.locator("#panelBtn").click();
    await page.locator("#inspector .wfbtn").first().click();
    await page.locator("#layoutPicker").waitFor();

    // a layout: the icon is there once it is drawn
    await page.waitForSelector("[data-layout] [data-expand]", { timeout: 30000 });
    const layout = page.locator("[data-layout]").first();
    await layout.hover();
    await layout.locator("[data-expand]").click();
    await page.waitForSelector("[data-xstage] [data-shrink] > div", { timeout: 10000 });
    await page.locator("[data-xback]").click();
    assert.equal(await page.locator("[data-xstage]").count(), 0, "Back closes the preview");
    assert.equal(await page.locator("#layoutPicker").count(), 1, "and the dialog stays");

    // a design
    await page.locator('[data-source="gallery"]').click();
    await page.locator("[data-gq]").fill("sidebar");
    await page.waitForFunction(() => document.querySelectorAll("[data-gid]").length === 1, null, { timeout: 15000 });
    const design = page.locator("[data-gid]").first();
    await design.hover();
    await design.locator("[data-expand]").click();
    await page.waitForSelector("[data-xstage] iframe", { timeout: 10000 });
    assert.equal(await page.locator("#layoutPicker").count(), 1, "a click on the icon is not a pick");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("[data-xstage]").count(), 0, "Escape closes the preview");
    assert.equal(await page.locator("#layoutPicker").count(), 1, "and not the dialog");
    await design.hover();
    await design.locator("[data-expand]").click();
    await page.locator("[data-xuse]").click();
    await page.waitForTimeout(2000);
    assert.equal(await page.locator("#layoutPicker").count(), 0, "Use puts it in the page and closes the dialog");
    assert.match(await page.frameLocator("#frame").locator("body").innerText(), /Menu/, "the sidebar is in the page");
    await ctx.close();
});
