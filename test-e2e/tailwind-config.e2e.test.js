// End to end: the real app, a real MongoDB, a real browser. Covers the Tailwind config feature: the project's file, a page's own file, what reloads, what the
// share page, the exports and the prototype receive, and what a broken file does. `npm run e2e` (needs mongod, Chrome and the network).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { missingPrerequisite, chromePath, startStack, seed, PROJECT_FILE, PAGE_FILE, colourOf } from "./helpers.js";

const skip = missingPrerequisite();
let stack, ids, browser, ctx;

before(async () => {
    if (skip) return;
    stack = await startStack();
    ids = await seed();
    browser = await chromium.launch({ executablePath: chromePath(), headless: true });
    ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    const r = await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    assert.equal(r.status(), 200, "the seeded user signs in");
});
after(async () => { if (skip) return; if (browser) await browser.close(); if (stack) await stack.stop(); });

const applied = (page, root = "body") => page.waitForFunction((sel) => /Applied|Not applied|Not saved/.test(document.querySelector(`${sel} [data-status]`).textContent), root, { timeout: 90000 });
const frameWith = async (page, id, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { for (const f of page.frames().filter((x) => x !== page.mainFrame())) { try { if (await f.evaluate((i) => Boolean(document.getElementById(i)), id)) return f; } catch { /* not ready */ } } await new Promise((r) => setTimeout(r, 300)); } throw new Error("the preview frame did not appear"); };
const settle = async (page, id, id2, want) => { const t = Date.now(); let last; while (Date.now() - t < 25000) { const f = await frameWith(page, id); last = { a: await colourOf(f, id), b: await colourOf(f, id2) }; if (want(last)) return last; await new Promise((r) => setTimeout(r, 500)); } return last; };

test("the project's config file saves, survives a reload, and the editor canvas uses it", { skip: skip || false, timeout: 150000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.click("#tabTheme");
    await page.click('[data-engine="3"]');
    await page.fill("[data-ta]", PROJECT_FILE);
    await page.click("[data-apply]");
    await applied(page);
    assert.match(await page.textContent("[data-status]"), /^Applied/);
    const lines = await page.$$eval("[data-diag] > div", (d) => d.map((x) => x.textContent));
    assert.ok(lines.some((l) => /typography: built into the Tailwind CDN/.test(l)), "an official plugin is recognised");
    assert.ok(lines.some((l) => /preline\/plugin: loaded from preline@2\.7\.0/.test(l)), "Preline's plugin file is found in an older major, and the line says so");
    await page.reload();
    await page.click("#tabTheme");
    assert.ok((await page.inputValue("[data-ta]")).includes("preline/plugin"), "the file is still there after a reload");
    await page.goto(`${stack.base}/design/${ids.page}`);
    const colours = await settle(page, "a", "b", (c) => c.b === "rgb(15, 118, 110)");
    assert.equal(colours.b, "rgb(15, 118, 110)", "the project's colour reaches the editor canvas");
    await page.close();
});

test("a page's own file is stored on the page and laid over the project's", { skip: skip || false, timeout: 150000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#inspector", { state: "attached" });
    await page.waitForTimeout(3000); // the editor finishes loading
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(1326, 33); // open the panel if it is closed
    await page.locator(".wfbtn").nth(1).waitFor({ state: "visible", timeout: 20000 });
    await page.click(".wfbtn >> nth=1"); // Tailwind config
    await page.fill("#configDlg [data-ta]", PAGE_FILE);
    await page.click("#configDlg [data-apply]");
    await applied(page, "#configDlg");
    assert.match(await page.textContent("#configDlg [data-status]"), /^Applied to this page/);
    await page.goto(`${stack.base}/design/${ids.page}`);
    const colours = await settle(page, "a", "b", (c) => c.a === "rgb(124, 58, 237)" && c.b === "rgb(15, 118, 110)");
    assert.deepEqual(colours, { a: "rgb(124, 58, 237)", b: "rgb(15, 118, 110)" }, "the page's colour and the project's both apply");
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.click("#outline [data-pick]");
    assert.match(await page.textContent("#details"), /this page has its own file/);
    await page.close();
});

test("the parts saved from a page are not in the editor's pages list or on its canvas", { skip: skip || false, timeout: 150000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#designs", { state: "attached" });
    await page.waitForTimeout(3000);
    const text = await page.$eval("#designs", (d) => d.innerText);
    assert.match(text, /Home/);
    assert.ok(!/Header|section/i.test(text), "no row for the saved section");
    assert.equal(await page.$$eval("#designs > *", (rows) => rows.filter((r) => /Home/.test(r.innerText)).length) >= 1, true);
    const frames = await page.$$eval("iframe", (f) => f.map((x) => /id="s"/.test(x.srcdoc || "")));
    assert.ok(!frames.some(Boolean), "and no frame for it on the canvas");
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.waitForTimeout(2500);
    assert.ok(!/Header/.test(await page.textContent("#outline")), "the project's Pages tab lists pages only");
    assert.equal(await page.$$eval(".fwrap", (w) => w.length), 3, "and its board has a frame for each of the three pages, none for the part");
    assert.match(await page.textContent("#projStats"), /^3 pages ·/);
    await page.close();
});

test("a config that throws is not saved, and says why", { skip: skip || false, timeout: 150000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.click("#tabTheme");
    await page.click('[data-engine="3"]');
    await page.fill("[data-ta]", `module.exports = { theme: { extend: { colors: { x: nope.nope } } } };\n`);
    await page.click("[data-apply]");
    await applied(page);
    assert.match(await page.textContent("[data-status]"), /^Not applied/);
    assert.match(await page.textContent("[data-diag]"), /The config threw/);
    await page.reload();
    await page.click("#tabTheme");
    assert.ok((await page.inputValue("[data-ta]")).includes("preline/plugin"), "the earlier, working file is still the saved one");
    await page.close();
});

test("a package that needs a build is marked red with the reason, and the rest still applies", { skip: skip || false, timeout: 150000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.click("#tabTheme");
    await page.click('[data-engine="3"]');
    await page.fill("[data-ta]", `module.exports = {\n  theme: { extend: { colors: { proj: "#0f766e" } } },\n  plugins: [require("./my-local-plugin"), require("this-package-does-not-exist-xyz")],\n};\n`);
    await page.click("[data-apply]");
    await applied(page);
    const lines = await page.$$eval("[data-diag] > div", (d) => d.map((x) => x.textContent));
    assert.ok(lines.some((l) => /my-local-plugin is a file in your own project/.test(l)));
    assert.ok(lines.some((l) => /Couldn't find "this-package-does-not-exist-xyz"/.test(l)));
    assert.match(await page.textContent("[data-status]"), /Lines marked red were left out/);
    await page.close();
});

test("the share page, the exports and the prototype carry the config", { skip: skip || false, timeout: 150000 }, async () => {
    // restore the working project file first
    const setup = await ctx.newPage();
    await setup.goto(`${stack.base}/projects/${ids.project}`);
    await setup.click("#tabTheme"); await setup.click('[data-engine="3"]');
    await setup.fill("[data-ta]", PROJECT_FILE); await setup.click("[data-apply]"); await applied(setup);
    await setup.close();

    const anon = await browser.newContext(); // someone with only the link
    const share = await anon.newPage();
    await share.goto(`${stack.base}/p/${ids.token}`);
    const sandbox = await share.$eval("[data-frame]", (f) => f.getAttribute("sandbox") || "");
    assert.ok(/allow-scripts/.test(sandbox) && !/allow-same-origin/.test(sandbox), "shared previews run in a sandbox: the project's scripts cannot reach this site");
    const c = await settle(share, "a", "b", (x) => x.a === "rgb(124, 58, 237)" && x.b === "rgb(15, 118, 110)");
    assert.deepEqual(c, { a: "rgb(124, 58, 237)", b: "rgb(15, 118, 110)" }, "the share page shows the page with the project's and its own config");
    await anon.close();

    const standalone = await (await ctx.request.get(`${stack.base}/api/components/${ids.page}/export?format=standalone`)).json();
    assert.ok(standalone.success);
    assert.match(standalone.code, /preline@2\.7\.0\/plugin\.js/, "a standalone page carries the plugin file");
    assert.match(standalone.code, /\(this page\)/, "and the page's own file");
    const cfg = await (await ctx.request.get(`${stack.base}/api/components/${ids.page}/export?format=config`)).json();
    assert.match(cfg.code, /npm install -D tailwindcss@3 @tailwindcss\/typography preline@2\.7\.0/);
    assert.match(cfg.code, /tailwind\.config\.js \(whole project\)/);
    assert.match(cfg.code, /This page's additions/);

    const proto = await ctx.newPage(); // the owner's prototype view
    await proto.goto(`${stack.base}/prototype/${ids.project}`);
    const frame = await frameWith(proto, "a");
    assert.equal(await colourOf(frame, "a"), "rgb(124, 58, 237)", "the prototype uses the page's own config too");
    await proto.close();
});

test("the config dialog works on a small screen and by keyboard", { skip: skip || false, timeout: 150000 }, async () => {
    const small = await browser.newContext({ viewport: { width: 420, height: 800 } });
    await small.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });
    const page = await small.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#inspector", { state: "attached" });
    await page.waitForTimeout(3000);
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(page.viewportSize().width - 174, 33);
    await page.evaluate(() => document.querySelectorAll(".wfbtn")[1].click()); // the Tailwind config row
    await page.waitForSelector("#configDlg[open]");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the page does not scroll sideways");
    const apply = await page.locator("#configDlg [data-apply]").boundingBox();
    assert.ok(apply && apply.x >= 0 && apply.x + apply.width <= 421, "Apply is on screen");
    assert.equal(await page.getAttribute('#configDlg [data-scope="page"]', "role"), "tab");
    assert.equal(await page.getAttribute("#configDlg", "aria-labelledby"), "cfgTitle");
    await page.focus("#configDlg [data-ta]");
    await page.keyboard.press("Tab");
    assert.ok((await page.inputValue("#configDlg [data-ta]")).endsWith("  "), "Tab indents at the caret");
    await page.keyboard.press("Shift+Tab");
    assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.tagName), "TEXTAREA", "Shift+Tab leaves the editor");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#configDlg[open]").count(), 0, "Escape closes the dialog");
    await small.close();
});

test("double-clicking an icon beside a brand name picks the icon; it does not start typing in the name", { skip: skip || false, timeout: 150000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.brand}`);
    await page.waitForSelector("#frame", { state: "attached" });
    await page.waitForTimeout(4000);
    const frame = await frameWith(page, "ic");
    const centre = async (sel) => { const b = await frame.locator(sel).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const editing = () => frame.evaluate(() => Boolean(document.querySelector("[contenteditable=true]")));
    const [ix, iy] = await centre("#ic");
    await page.mouse.dblclick(ix, iy); // into the page's top level
    await page.mouse.dblclick(ix, iy); // down to the link that holds the icon and the name
    await page.mouse.dblclick(ix, iy); // on the icon: this used to type into the name
    assert.equal(await editing(), false, "no text editing started from the icon");
    const [tx, ty] = await centre("#brand");
    await page.mouse.dblclick(tx + 60, ty); // on the name itself
    assert.equal(await editing(), true, "double-clicking the name still edits it");
    await page.close();
});

test("a new animation is written into the project's config and works after a reload", { skip: skip || false, timeout: 170000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#inspector", { state: "attached" });
    await page.waitForTimeout(3500);
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(1326, 33);
    const frame = await frameWith(page, "a");
    const b = await frame.locator("#a").boundingBox();
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2); // into the page
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2); // onto the button
    await page.click('#inspector [title^="Make a new animation"]');
    await page.click('[data-preset="zoom-in"]');
    await page.click("#animCreate");
    await page.waitForSelector("#animDlg:not([open])", { state: "attached" });
    assert.equal(await page.textContent("#animErr"), "", "no error");
    assert.match(await frame.evaluate(() => document.getElementById("a").className), /animate-zoom-in/, "the class is on the selected element");
    // the file now holds it
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.click("#tabTheme"); await page.click('[data-engine="3"]');
    const file = await page.inputValue("[data-ta]");
    assert.match(file, /"zoom-in": "zoom-in 0\.4s ease-out 0s 1 normal both"/);
    assert.match(file, /keyframes: \{\n\s+"zoom-in": \{/);
    assert.match(file, /module\.exports = \{/, "it is still a normal config file");
    // after a reload the animation comes from the config itself: Tailwind builds animate-zoom-in
    await page.goto(`${stack.base}/design/${ids.page}`);
    const again = await frameWith(page, "a");
    const names = await again.evaluate(() => Object.keys((window.tailwind.config.theme.extend || {}).animation || {}));
    assert.ok(names.includes("zoom-in"), "the canvas knows the animation");
    // pick it from the panel (it is listed under "Your animations"), then preview: the editor shows designs at rest, the preview lets it move
    await page.waitForTimeout(1500);
    const b2 = await again.locator("#a").boundingBox();
    await page.mouse.dblclick(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.mouse.dblclick(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.locator("#inspector select", { has: page.locator('option[value="zoom-in"]') }).selectOption("zoom-in");
    await page.click("text=Preview the animation");
    await page.waitForTimeout(800);
    const name = await again.evaluate(() => getComputedStyle(document.getElementById("a")).animationName);
    assert.equal(name, "zoom-in", "Tailwind turns the config's animation into the animate-zoom-in class");
    await page.close();
});

test("an animation made in the keyframe editor is written into the config as keyframes", { skip: skip || false, timeout: 170000 }, async () => {
    const page = await ctx.newPage();
    await page.goto(`${stack.base}/design/${ids.page}`);
    await page.waitForSelector("#inspector", { state: "attached" });
    await page.waitForTimeout(3500);
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(1326, 33);
    const frame = await frameWith(page, "a");
    const b = await frame.locator("#a").boundingBox();
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await page.click('#inspector [title^="Make a new animation"]');
    await page.click('[data-mode="editor"]');
    assert.equal(await page.inputValue("#animName"), "my-animation", "a fresh animation gets a name of its own");
    await page.check('#animEditor [data-on="translateY"]');
    await page.fill('#animEditor [data-num="translateY"]', "30");
    const tr = await page.locator("#animEditor [data-track]").boundingBox();
    await page.mouse.click(tr.x + tr.width * 0.6, tr.y + 24); // a stop at 60%
    await page.check('#animEditor [data-on="scale"]');
    await page.fill('#animEditor [data-num="scale"]', "1.2");
    await page.check('#animEditor [data-on="opacity"]');
    await page.fill('#animEditor [data-num="opacity"]', "1");
    assert.equal(await page.$$eval("#animEditor [data-stop]", (s) => s.length), 3, "three stops: 0%, 60%, 100%");
    await page.fill("#animName", "kf-pop");
    await page.click("#animCreate");
    await page.waitForSelector("#animDlg:not([open])", { state: "attached" });
    assert.equal(await page.textContent("#animErr"), "");
    await page.goto(`${stack.base}/projects/${ids.project}`);
    await page.click("#tabTheme"); await page.click('[data-engine="3"]');
    const file = await page.inputValue("[data-ta]");
    assert.match(file, /"kf-pop": "kf-pop 0\.6s ease-out 0s 1 normal both"/);
    assert.match(file, /"0%": \{[^}]*"transform": "translateY\(30px\)"/);
    assert.match(file, /"60%": \{[^}]*"transform": "scale\(1\.2\)"/);
    await page.close();
});

const pick = async (page, frame, sel) => { const b = await frame.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(600); };
const standalone = async (id) => (await (await ctx.request.get(`${stack.base}/api/components/${id}/export?format=standalone`)).json()).code;

test("an animation that waits for a scroll plays when scrolled into view, and a list's children play one after another", { skip: skip || false, timeout: 170000 }, async () => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1500, height: 1500 });
    await page.goto(`${stack.base}/design/${ids.scroll}`);
    await page.waitForSelector("#inspector", { state: "attached" });
    await page.waitForTimeout(3500);
    if (!(await page.locator("#inspector").isVisible())) await page.mouse.click(1326, 33);
    const frame = await frameWith(page, "r1");
    // 1. the paragraph: Tailwind's pulse, on scroll
    await pick(page, frame, "#r1");
    await page.locator("#inspector select", { has: page.locator('option[value="pulse"]') }).first().selectOption("pulse");
    await page.waitForTimeout(400);
    await page.locator("#inspector select", { has: page.locator('option[value="scroll-repeat"]') }).first().selectOption("scroll"); // the "When" select (the overflow select also has a "scroll")
    await page.waitForTimeout(600);
    const r1 = await frame.evaluate(() => ({ cls: document.getElementById("r1").className, reveal: document.getElementById("r1").getAttribute("data-reveal") }));
    assert.match(r1.cls, /animate-pulse/);
    assert.match(r1.cls, /\[animation-play-state:paused\]/);
    assert.equal(r1.reveal, "", "the element is marked for the reveal script");
    // 2. the list: its three children, 100 ms apart, on load
    await pick(page, frame, "#i2"); // a click picks the top level: the list
    await page.locator("#inspector select", { has: page.locator('option[value="pulse"]') }).last().selectOption("pulse");
    await page.locator("#inspector input[title^='Milliseconds']").fill("100").catch(() => {});
    await page.click("text=Animate the 3 children");
    await page.waitForTimeout(600);
    const kids = await frame.evaluate(() => [...document.querySelectorAll("#list li")].map((l) => [l.className, l.style.getPropertyValue("--i")]));
    assert.deepEqual(kids.map((k) => k[1]), ["0", "1", "2"], "each child carries its place");
    assert.ok(kids.every((k) => /animate-pulse/.test(k[0]) && /\[animation-delay:calc\(var\(--i\)\*\d+ms\)\]/.test(k[0])));
    // 3. saved and exported, it behaves: held until scrolled to, then running; the third child is delayed by two gaps
    await page.keyboard.press("Control+s"); await page.waitForTimeout(1500);
    const code = await standalone(ids.scroll);
    assert.match(code, /wc-motion/, "the page carries its small motion script");
    assert.match(code, /data-reveal/);
    const out = await ctx.newPage();
    await out.setViewportSize({ width: 1280, height: 800 });
    await out.setContent(code, { waitUntil: "networkidle" });
    await out.waitForTimeout(1500);
    const before = await out.evaluate(() => getComputedStyle(document.getElementById("r1")).animationPlayState);
    assert.equal(before, "paused", "below the fold, it waits");
    await out.evaluate(() => document.getElementById("r1").scrollIntoView());
    await out.waitForTimeout(900);
    const after = await out.evaluate(() => ({ state: getComputedStyle(document.getElementById("r1")).animationPlayState, reveal: document.getElementById("r1").getAttribute("data-reveal") }));
    assert.deepEqual(after, { state: "running", reveal: "in" }, "scrolled into view, it runs");
    const delays = await out.evaluate(() => [...document.querySelectorAll("#list li")].map((l) => getComputedStyle(l).animationDelay));
    assert.equal(delays[0], "0s"); assert.notEqual(delays[2], "0s", "later children are delayed");
    await out.close(); await page.close();
});
