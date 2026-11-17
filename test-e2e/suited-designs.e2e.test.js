// End to end: the mini toolbar's layouts icon opens the wireframe dialog narrowed to what suits the selected element.
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
    const { default: User } = await import("../src/models/user.model.js");
    const { default: Component } = await import("../src/models/component.model.js");
    const ada = await User.create({ name: "Ada Author", email: "ada@example.test", password: "x" });
    // inserted without going through a save, so they have no roles yet: the first request for a role gives them theirs
    const rows = [
        ["Sidebar one", `<aside class="w-64 h-screen bg-white border-r p-6"><p>Menu</p></aside>`, "layout-basic"],
        ["Sidebar two", `<div class="w-60 h-screen bg-slate-900 p-4 text-white">Nav</div>`, "layout-basic"],
        ["Hero one", `<section class="bg-indigo-600 px-8 py-20 text-white"><h1 class="text-4xl">Hero</h1></section>`, "marketing-hero"],
        ["Hero two", `<section class="px-8 py-24"><h1 class="text-5xl">Another hero</h1></section>`, "marketing-hero"],
        ["Navbar one", `<header class="flex h-16 items-center px-6">Brand</header>`, "navigation-navbars"],
        ["Pricing one", `<section class="p-8">Plans</section>`, "marketing-pricing"],
    ];
    await Component.collection.insertMany(rows.map(([title, htmlCode, category], i) => ({ title, htmlCode, category, description: title, tags: [], createdBy: ada._id, isPublished: true, kind: "component", likes: 0, likedBy: [], version: 1, versions: [], reports: [], createdAt: new Date(Date.now() - i * 1000), updatedAt: new Date() })));
    browser = await chromium.launch({ executablePath: chromePath(), headless: true });
});
after(async () => { if (skip) return; if (browser) await within(browser.close()); if (stack) await within(stack.stop(), 20000); });

test("the gallery list can be narrowed to a role, and designs published without a save get their roles", { skip: skip || false, timeout: 60000 }, async () => {
    const ctx = await browser.newContext();
    const titles = async (q) => (await (await ctx.request.get(`${stack.base}/api/gallery/designs?${q}`)).json()).data.items.map((i) => i.title).sort();
    assert.deepEqual(await titles("role=sidebar"), ["Sidebar one", "Sidebar two"]);
    assert.ok((await titles("role=hero")).includes("Hero one") && !(await titles("role=hero")).includes("Sidebar one"));
    assert.deepEqual(await titles("role=navbar"), ["Navbar one"]);
    assert.ok((await titles("")).length >= 6, "no role: everything");
    assert.deepEqual(await titles("role=nonsense"), await titles(""), "an unknown role is ignored");
    await ctx.close();
});

test("select a sidebar slot, press the layouts icon: the dialog opens narrowed to sidebars, in both tabs; the chip removes the filter", { skip: skip || false, timeout: 240000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const made = await (await ctx.request.post(`${stack.base}/api/components`, { data: { title: "Blank suited", category: "landing-page", description: "d", htmlCode: "<h1 id=\"t\">Title</h1>", project: ids.project, kind: "page" } })).json();
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${made.data._id}`);
    await page.locator("#panelBtn").waitFor({ timeout: 60000 });
    await page.waitForTimeout(2500);
    if (!(await page.locator("#inspector").isVisible())) await page.locator("#panelBtn").click();
    const frame = page.frameLocator("#frame");

    // plain text: no layouts icon
    const h1 = frame.locator("#t");
    const hb = await h1.boundingBox();
    await page.mouse.click(hb.x + 20, hb.y + 10);
    await page.waitForTimeout(800);
    assert.equal(await page.locator('[data-ft="layouts"]').count(), 0, "text has no layouts icon");

    // a wireframe with a sidebar slot
    await page.mouse.click(600, 500); // the empty part of the frame: the frame is selected, and the panel offers the page's wireframes
    await page.waitForTimeout(600);
    await page.locator("#inspector .wfbtn").first().click();
    await page.locator("#layoutPicker").waitFor({ timeout: 20000 });
    assert.equal(await page.locator('[data-source="wire"]').getAttribute("aria-selected"), "true", "from the panel's wireframe button the layouts open first");
    await page.locator('[data-layout="pick-side"]').first().click();
    const aside = frame.locator("aside").first();
    await aside.waitFor({ timeout: 20000 });
    const box = await aside.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);

    await page.locator('[data-ft="layouts"]').waitFor({ timeout: 10000 });
    await page.locator('[data-ft="layouts"]').click();
    await page.locator("#layoutPicker").waitFor();
    assert.match(await page.locator("#layoutPicker h2").innerText(), /sidebar/i, "the title names what it is");
    assert.equal(await page.locator('[data-srole="sidebar"]').getAttribute("aria-pressed"), "true", "its role is chosen");
    assert.ok((await page.locator('[data-srole]').count()) >= 2, "with other roles it could be");
    assert.equal(await page.locator('[data-put="replace"]').getAttribute("aria-checked"), "true", "an empty slot: Replace");
    // it starts on the designs, already narrowed
    assert.equal(await page.locator('[data-source="gallery"]').getAttribute("aria-selected"), "true", "from the mini toolbar's icon the Designs tab opens first");
    await page.waitForFunction(() => document.querySelectorAll("[data-gid]").length === 2, null, { timeout: 20000 });
    const names = await page.locator("[data-gid]").allInnerTexts();
    assert.ok(names.every((n) => /Sidebar/.test(n)) && names.length === 2, `only the sidebars: ${names.join(" | ")}`);
    // the layouts are narrowed too
    await page.locator('[data-source="wire"]').click();
    assert.ok(await page.locator('[data-kind="suited"]').isVisible(), "the layouts tab has its Suited chip");
    await page.waitForSelector("[data-layout]", { timeout: 20000 });
    await page.locator('[data-source="gallery"]').click();

    // remove the filter: everything
    await page.locator('[data-srole="sidebar"]').click();
    await page.waitForFunction(() => document.querySelectorAll("[data-gid]").length >= 6, null, { timeout: 20000 });
    assert.equal(await page.locator('[data-srole="sidebar"]').getAttribute("aria-pressed"), "false");

    // choose another role: its designs
    await page.locator('[data-srole="navbar"]').click();
    await page.waitForFunction(() => document.querySelectorAll("[data-gid]").length === 1, null, { timeout: 20000 });
    assert.match(await page.locator("[data-gid]").first().innerText(), /Navbar one/);
    await ctx.close();
});
