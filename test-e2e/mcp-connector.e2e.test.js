// End to end: the MCP connector through a real server: resources, prompts, links in save results, ChatGPT's search and fetch, and screenshots.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { missingPrerequisite, startStack, seed, within } from "./helpers.js";

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
    for (const t of ["render_design", "search", "fetch", "get_design_guide", "save_design"]) assert.ok(tools.includes(t), `${t} is a tool`);
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
