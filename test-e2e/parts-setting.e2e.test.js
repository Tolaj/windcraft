// End to end: a project's "Auto-create parts" setting. Off, saving a frame makes no parts; turning it on makes the parts of the frames already there; on, a saved frame gets its parts.
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

const SITE = `<!doctype html><html><head><title>Site</title></head><body>
<header><nav><a href="#">Home</a><a href="#">Pricing</a><a href="#">Contact</a></nav></header>
<section><h1>Software that works offline</h1><p>Desktop apps for schools, hotels and clinics. Install once, unlock with a key and keep working with or without internet.</p></section>
<section><h2>Simple pricing</h2><p>Pick the plan that fits your business and pay once a year, with no surprise charges and no extra servers to run.</p></section>
<section><h2>What customers say</h2><p>Teams tell us the apps are fast, clear and easy to learn, and that setup took them only a few minutes in the afternoon.</p></section>
<footer><p>Made for small businesses everywhere, with care.</p></footer></body></html>`;

const projectData = async (ctx) => {
    const html = await (await ctx.request.get(`${stack.base}/projects/${ids.project}`)).text();
    const m = /<script id="projectData" type="application\/json">(.*?)<\/script>/s.exec(html);
    return JSON.parse(m[1].replace(/\\u003c/g, "<"));
};
const partsOf = (data, title) => { const page = data.items.find((i) => i.title === title && i.kind === "page"); return page ? data.items.filter((i) => i.kind === "section" && i.parent === page.id) : null; };
const importFrame = async (ctx, title) => {
    const r = await ctx.request.post(`${stack.base}/api/components/import`, { data: { items: [{ title, html: SITE }], project: ids.project } });
    assert.equal(r.status(), 200);
};
const setParts = async (ctx, on) => assert.equal((await ctx.request.put(`${stack.base}/api/projects/${ids.project}`, { data: { autoParts: on } })).status(), 200);

test("Auto-create parts: off makes none, turning it on makes the parts of the frames already there, on makes them on save", { skip: skip || false, timeout: 180000 }, async () => {
    const ctx = await browser.newContext();
    await ctx.request.post(`${stack.base}/users/sign-in`, { data: { email: ids.email, password: ids.password } });

    assert.equal((await projectData(ctx)).project.autoParts, true, "a project makes parts until it is told not to");

    await setParts(ctx, false);
    assert.equal((await projectData(ctx)).project.autoParts, false);
    await importFrame(ctx, "Saved while off");
    assert.deepEqual(partsOf(await projectData(ctx), "Saved while off"), [], "off: a saved frame gets no parts");

    await setParts(ctx, true); // the frame that was saved while off now gets its parts, in the background
    let parts = [];
    for (let i = 0; i < 40 && !parts.length; i++) { await new Promise((r) => setTimeout(r, 500)); parts = partsOf(await projectData(ctx), "Saved while off") || []; }
    assert.ok(parts.length >= 2, `turned on: its parts are made (${parts.map((p) => p.title)})`);

    await importFrame(ctx, "Saved while on");
    assert.ok(partsOf(await projectData(ctx), "Saved while on").length >= 2, "on: a saved frame gets its parts");
    await ctx.close();
});
