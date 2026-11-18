// End to end: the MCP connector through a real server: resources, prompts, links in save results, ChatGPT's search and fetch, and screenshots.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { chromium } from "playwright-core";
import { missingPrerequisite, chromePath, startStack, seed, within } from "./helpers.js";

const skip = missingPrerequisite();
let stack, ids, call, rpc;
before(async () => {
    if (skip) return;
    stack = await startStack();
    ids = await seed();
    const { default: User } = await import("../src/models/user.model.js");
    const token = "twl_" + "b".repeat(40);
    await User.updateOne({ email: ids.email }, { apiTokenHash: crypto.createHash("sha256").update(token).digest("hex"), apiTokenPrefix: "twl_bbbb" });
    let n = 0;
    rpc = async (method, params) => (await (await fetch(`${stack.base}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) })).json());
    call = async (name, args) => (await rpc("tools/call", { name, arguments: args })).result;
});
after(async () => { if (skip) return; if (stack) await within(stack.stop(), 20000); });

test("the connector announces tools, resources and prompts", { skip: skip || false, timeout: 120000 }, async () => {
    const init = (await rpc("initialize", { protocolVersion: "2025-06-18" })).result;
    assert.ok(init.capabilities.resources && init.capabilities.prompts && init.capabilities.tools);
    assert.match(init.instructions, /render_design/);
    const tools = (await rpc("tools/list")).result.tools.map((t) => t.name);
    for (const t of ["render_design", "search", "fetch", "get_design_guide", "save_design", "revert_design"]) assert.ok(tools.includes(t), `${t} is a tool`);
    const prompts = (await rpc("prompts/list")).result.prompts;
    assert.deepEqual(prompts.map((p) => p.name).sort(), ["audit-design", "build-page", "make-variations", "new-section", "restyle-to-my-guide"]);
    const got = (await rpc("prompts/get", { name: "build-page", arguments: { description: "a pricing page" } })).result;
    assert.match(got.messages[0].content.text, /a pricing page/);
    assert.match(got.messages[0].content.text, /render_design/);
    const missing = await rpc("prompts/get", { name: "build-page", arguments: {} });
    assert.equal(missing.error.code, -32602, "a missing argument is the caller's mistake");
});

test("resources give the guide, the projects and a design's code", { skip: skip || false, timeout: 120000 }, async () => {
    const list = (await rpc("resources/list")).result.resources.map((r) => r.uri);
    assert.ok(list.includes("windcraft://design-guide") && list.includes(`windcraft://project/${ids.project}`));
    const guide = (await rpc("resources/read", { uri: "windcraft://design-guide" })).result.contents[0];
    assert.equal(guide.mimeType, "text/markdown");
    assert.ok(guide.text.length > 50);
    const proj = JSON.parse((await rpc("resources/read", { uri: `windcraft://project/${ids.project}` })).result.contents[0].text);
    assert.equal(proj.name, "E2E project");
    assert.ok(proj.pages.some((p) => p.title === "Home"));
    const code = (await rpc("resources/read", { uri: `windcraft://component/${ids.page}` })).result.contents[0];
    assert.equal(code.mimeType, "text/html");
    assert.match(code.text, /page colour/);
    const theme = JSON.parse((await rpc("resources/read", { uri: `windcraft://theme/${ids.project}` })).result.contents[0].text);
    assert.ok(theme.theme.extend.colors.brand);
    assert.equal((await rpc("resources/read", { uri: "windcraft://component/" + "0".repeat(24) })).error.code, -32002);
    assert.equal((await rpc("resources/read", { uri: "https://example.com/x" })).error.code, -32002);
});

test("saving returns a link to the design, and search and fetch work for ChatGPT", { skip: skip || false, timeout: 120000 }, async () => {
    const saved = JSON.parse((await call("save_design", { title: "Pricing", html: '<section class="p-8"><h1 class="text-3xl font-bold">Pricing</h1></section>', project: "E2E project" })).content[0].text);
    assert.match(saved.page.url, new RegExp(`/design/${saved.page.id}$`));
    assert.match(saved.project.url, new RegExp(`/projects/${ids.project}$`));
    const pages = JSON.parse((await call("save_pages", { project: "E2E project", pages: [{ title: "About", html: "<h1 class='p-8'>About</h1>" }] })).content[0].text);
    assert.match(pages.saved[0].url, /\/design\//);

    const found = JSON.parse((await call("search", { query: "pricing" })).content[0].text);
    assert.ok(found.results.some((r) => r.id === saved.page.id && /\/design\//.test(r.url)), "search finds the page it just saved");
    const doc = JSON.parse((await call("fetch", { id: saved.page.id })).content[0].text);
    assert.equal(doc.title, "Pricing");
    assert.match(doc.text, /text-3xl/);
    assert.equal((await call("fetch", { id: "zz" })).isError, true);
});

test("render_design returns a screenshot, of a saved design and of unsaved HTML, and keeps pages away from private addresses", { skip: skip || false, timeout: 180000 }, async () => {
    const shot = await call("render_design", { id: ids.page, width: 1000 });
    assert.ok(!shot.isError, shot.content && shot.content[0].text);
    const img = shot.content.find((c) => c.type === "image");
    assert.equal(img.mimeType, "image/jpeg");
    const bytes = Buffer.from(img.data, "base64");
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], "a JPEG");
    assert.ok(bytes.length > 2000);
    assert.match(shot.content[0].text, /Rendered at 1000px wide/);
    assert.match(shot.content[0].text, /\/design\//, "the caption links to the design in Windcraft");

    const phone = await call("render_design", { html: '<div class="bg-red-600 p-6 text-white">phone</div>', width: 390, dark: true });
    assert.equal(phone.content[0].text.includes("Rendered at 390px"), true);

    // a page that asks for a private address gets nothing from it
    const probe = await call("render_design", { html: `<img src="http://127.0.0.1:${new URL(stack.base).port}/healthz-probe" onload="document.title='LOADED'" onerror="document.title='BLOCKED'"><p>x</p>` });
    assert.ok(!probe.isError);
    const { isPrivateAddress } = await import("../src/services/render.service.js");
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) assert.equal(isPrivateAddress(ip), true, ip);
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);

    assert.equal((await call("render_design", {})).isError, true);
    assert.equal((await call("render_design", { id: "0".repeat(24) })).isError, true);
});

test("the Connect page has Add to Cursor, a ChatGPT tab and the new tools", { skip: skip || false, timeout: 120000 }, async () => {
    const signIn = await fetch(`${stack.base}/users/sign-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ids.email, password: ids.password }) });
    const cookie = (signIn.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
    await new Promise((r) => setTimeout(r, 700)); // the session is written to the store a moment after the answer
    const html = await (await fetch(`${stack.base}/connect`, { headers: { cookie } })).text();
    const link = /href="(cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?[^"]+)"/.exec(html.replace(/&amp;/g, "&").replace(/&#x3D;/g, "="));
    assert.ok(link, "the Add to Cursor link is on the page");
    const u = new URL(link[1].replace("cursor://", "https://"));
    assert.equal(u.searchParams.get("name"), "tailwind-library");
    const config = JSON.parse(Buffer.from(u.searchParams.get("config"), "base64").toString());
    assert.match(config.url, /^https?:\/\/[^/]+\/mcp$/, "the server's own address (PUBLIC_URL when set)");
    assert.match(config.headers.Authorization, /^Bearer \$\{env:[A-Z_]+\}$/, "the token stays in an environment variable, never in the link");
    assert.match(html, /data-tool="chatgpt"/);
    assert.match(html, /data-panel="chatgpt"/);
    for (const t of ["render_design", "search", "fetch"]) assert.ok(html.includes(t), `${t} is listed`);
});

test("an AI's changes are recorded as its own, shown on the Connect page and can be undone, but a person's own edit is never undone by an AI", { skip: skip || false, timeout: 180000 }, async () => {
    const { default: Component } = await import("../src/models/component.model.js");
    const text = (r) => JSON.parse(r.content[0].text);
    // the AI saves a page, then saves it again changed
    const first = text(await call("save_design", { title: "Trust page", html: '<div class="p-4"><h1>One</h1></div>', project: "E2E project" }));
    const id = first.page.id;
    const second = text(await call("save_design", { title: "Trust page", id, baseVersion: first.page.version, html: '<div class="p-4"><h1>Two</h1></div>', note: "Made the title say Two" }));
    assert.equal(second.page.version, 2);
    let doc = await Component.findById(id).lean();
    assert.equal(doc.lastChange.source, "ai");
    assert.equal(doc.lastChange.label, "Access token");
    assert.equal(doc.versions[doc.versions.length - 1].by.source, "ai", "the history entry says an AI made the change");

    // the Connect page lists it with an Undo
    const signIn = await fetch(`${stack.base}/users/sign-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ids.email, password: ids.password }) });
    const cookie = (signIn.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
    await new Promise((r) => setTimeout(r, 700));
    const page = await (await fetch(`${stack.base}/connect`, { headers: { cookie } })).text();
    assert.match(page, /Recent AI activity/);
    assert.match(page, /Access token<\/span> changed/);
    const undoId = /data-undo="([a-f0-9]{24})"/.exec(page);
    assert.ok(undoId, "the latest change has an Undo button");

    // the history API says who made which version
    const versions = await (await fetch(`${stack.base}/api/components/${id}/versions`, { headers: { cookie } })).json();
    assert.equal(versions.data[0].by.source, "ai");

    // Undo from the page
    const undone = await (await fetch(`${stack.base}/connect/activity/${undoId[1]}/undo`, { method: "POST", headers: { cookie } })).json();
    assert.equal(undone.success, true, undone.message);
    doc = await Component.findById(id).lean();
    assert.match(doc.htmlCode, /One/);
    assert.equal(doc.version, 3, "the undo is a new version, so it can be undone too");
    assert.equal(doc.lastChange.source, "editor");
    const again = await fetch(`${stack.base}/connect/activity/${undoId[1]}/undo`, { method: "POST", headers: { cookie } });
    assert.equal(again.status, 409, "it cannot be undone twice");

    // the AI changes it again; then the person edits it in the editor
    await call("save_design", { title: "Trust page", id, baseVersion: 3, html: '<div class="p-4"><h1>Three</h1></div>' });
    const edited = await (await fetch(`${stack.base}/api/components/${id}`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ htmlCode: '<div class="p-4"><h1>My own words</h1></div>' }) })).json();
    assert.equal(edited.success, true, edited.message);
    doc = await Component.findById(id).lean();
    assert.equal(doc.lastChange.source, "editor");
    // so the AI's revert refuses, and the Connect page offers no Undo for its earlier change
    const refused = await call("revert_design", { id });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /not made by an AI/);
    const page2 = await (await fetch(`${stack.base}/connect`, { headers: { cookie } })).text();
    assert.ok(!page2.includes(`data-undo="${undoId[1]}"`), "no Undo for a change that is no longer the latest");
    // but it may go back to a named version when asked
    const named = await call("revert_design", { id, version: 1 });
    assert.ok(!named.isError, named.content[0].text);
    assert.match((await Component.findById(id).lean()).htmlCode, /One/);

    // a stale baseVersion is refused
    const stale = await call("revert_design", { id, baseVersion: 1 });
    assert.equal(stale.isError, true);
    assert.match(stale.content[0].text, /changed since/);
});

test("the connector self-check has an optional Screenshots row that does not turn the result red", { skip: skip || false, timeout: 180000 }, async () => {
    const signIn = await fetch(`${stack.base}/users/sign-in`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ids.email, password: ids.password }) });
    const cookie = (signIn.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
    await new Promise((r) => setTimeout(r, 700));
    const res = await (await fetch(`${stack.base}/connect/check`, { headers: { cookie } })).json();
    const row = res.checks.find((c) => c.id === "screenshots");
    assert.ok(row, "the row is there");
    assert.equal(row.optional, true);
    assert.equal(row.ok, true, row.detail); // Chrome is on this machine
    assert.match(row.detail, /drew a test page/);
});

test("the project's History dialog marks the versions an AI made", { skip: skip || false, timeout: 180000 }, async () => {
    const text = (r) => JSON.parse(r.content[0].text);
    const first = text(await call("save_design", { title: "Badge page", html: '<div class="p-4"><h1>A</h1></div>', project: "E2E project" }));
    await call("save_design", { title: "Badge page", id: first.page.id, baseVersion: first.page.version, html: '<div class="p-4"><h1>B</h1></div>', note: "Changed the title" });
    const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
    try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
        const page = await ctx.newPage();
        await page.goto(`${stack.base}/projects/${ids.project}`);
        await page.locator("#board").waitFor({ timeout: 60000 });
        // fit the board, then click the frame (a click without a drag selects it) and open its history
        await page.locator("#fitBtn").click();
        await page.waitForTimeout(1500);
        const box = await page.locator(`.fwrap[data-id="${first.page.id}"] .frame`).boundingBox();
        assert.ok(box, "the frame is on the board");
        await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40));
        const btn = page.locator("#historyBtn");
        await btn.waitFor({ timeout: 20000 });
        await btn.click();
        await page.waitForTimeout(2500);
        await page.waitForFunction(() => /v1/.test((document.getElementById("libModal") || {}).innerText || ""), null, { timeout: 20000 });
        const html = await page.locator("#libModal").innerHTML();
        assert.match(html, /Edited by Access token/, "the current version, made by the AI, carries the badge");
        assert.equal((html.match(/Edited by/g) || []).length, 2, "both versions were made by the AI (v1 created, v2 changed)");
        await ctx.close();
    } finally { await browser.close(); }
});

test("designs can be filed under a gallery category and a board group when they are saved", { skip: skip || false, timeout: 120000 }, async () => {
    const { default: Component } = await import("../src/models/component.model.js");
    const text = (r) => JSON.parse(r.content[0].text);
    // save_component: a category and a group
    const a = text(await call("save_component", { title: "Alert one", description: "x", htmlCode: "<div class='p-4'>one</div>", category: "ui-alerts", group: "Alerts & Toasts", project: "E2E project" }));
    let doc = await Component.findById(a.id).lean();
    assert.equal(doc.category, "ui-alerts");
    assert.equal(doc.group, "Alerts & Toasts");
    // save_design: a category for a new page, and a second save under another one
    const b = text(await call("save_design", { title: "Sidebar one", html: "<aside class='p-4'>side</aside>", project: "E2E project", category: "navigation-sidebars", group: "Sidebars" }));
    doc = await Component.findById(b.page.id).lean();
    assert.equal(doc.category, "navigation-sidebars");
    assert.equal(doc.group, "Sidebars");
    await call("save_design", { title: "Sidebar one", id: b.page.id, baseVersion: 1, html: "<aside class='p-6'>side 2</aside>", category: "ui-tabs" });
    assert.equal((await Component.findById(b.page.id).lean()).category, "ui-tabs", "saved again under another category");
    // save_pages: one category for every page
    const c = text(await call("save_pages", { project: "E2E project", category: "marketing-cta", pages: [{ title: "Cta one", html: "<section class='p-6'>a</section>" }, { title: "Cta two", html: "<section class='p-6'>b</section>" }] }));
    for (const p of c.saved) assert.equal((await Component.findById(p.id).lean()).category, "marketing-cta");
    // a category that does not exist is refused with the list, and nothing is saved
    const bad = await call("save_design", { title: "Nope", html: "<p>x</p>", project: "E2E project", category: "not-a-category" });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /not a gallery category/);
    assert.equal(await Component.countDocuments({ title: "Nope" }), 0);
    assert.equal((await call("save_component", { title: "Bad", description: "x", htmlCode: "<p>x</p>", category: "zzz", project: "E2E project" })).isError, true);
    // arrange_project: groups come from the titles, hand positions are cleared, and the board gets one block of rows per group
    const one = text(await call("save_design", { title: "Cards 01 · Plain", html: "<p>1</p>", project: "E2E project" }));
    const two = text(await call("save_design", { title: "Cards 02 · Image", html: "<p>2</p>", project: "E2E project" }));
    await Component.updateOne({ _id: two.page.id }, { $set: { board: { x: 40, y: 40 } } });
    const arr = text(await call("arrange_project", { project: "E2E project" }));
    assert.ok(arr.regrouped >= 2 && arr.positionsReset >= 1, JSON.stringify(arr));
    assert.equal((await Component.findById(one.page.id).lean()).group, "Cards");
    const after = await Component.findById(two.page.id).lean();
    assert.equal(after.group, "Cards");
    assert.equal(after.board, null);
    // the new wave-1 categories exist in the app
    const { categories } = await import("../src/routes/home.routes.js");
    for (const slug of ["navigation-sidebars", "marketing-cta", "marketing-stats", "ui-alerts", "ui-badges", "ui-tabs", "ui-accordions", "navigation-pagination", "forms-controls", "ui-empty-states", "pages-landing", "pages-about", "pages-contact", "pages-auth", "pages-dashboard", "pages-settings", "pages-blog-post", "pages-error", "ui-avatars", "ui-drawers", "ui-popovers", "ui-progress", "ui-skeletons", "ecommerce-product-detail", "ecommerce-cart", "ecommerce-checkout", "apps-dashboards", "apps-chat", "apps-kanban", "apps-calendar"]) assert.ok(categories[slug], `${slug} is a category`);
});
