import test from "node:test";
import assert from "node:assert/strict";
import { extractParts, parseTree } from "../extract-parts.js";

const kinds = (list) => list.map((p) => `${p.kind}:${p.name}`);

const SITE = `
<header class="flex justify-between p-4"><a href="/" class="font-bold">Acme</a><nav class="flex gap-4"><a href="/docs">Docs</a><a href="/pricing">Pricing</a></nav></header>
<section class="py-20"><h1 class="text-5xl">Build faster</h1><p>The components handle the heavy lifting so you can ship.</p><a href="/start" class="rounded-full bg-black px-6 py-3 text-white">Get started</a></section>
<section class="py-16"><h2>Features</h2><p>Everything you need to design in Tailwind and keep it as code.</p></section>
<section class="py-16"><h2>Contact us</h2><form><label>Email<input type="email" name="email"></label><textarea name="msg"></textarea><button class="rounded bg-black px-4 py-2 text-white">Send</button></form></section>
<footer class="p-8"><a href="/terms">Terms</a> <a href="/privacy">Privacy</a></footer>`;

test("a site page gives its nav, hero, sections and footer, then its form and button", () => {
    const out = extractParts(SITE);
    assert.deepEqual(kinds(out.filter((p) => p.part)), ["nav:Header", "hero:Build faster", "section:Features", "section:Contact us", "footer:Footer"]);
    assert.deepEqual(kinds(out.filter((p) => !p.part)), ["form:Contact form", "button:Button: Get started"]);
});

test("the parts are whole, standalone pieces of the page", () => {
    const out = extractParts(SITE);
    const header = out.find((p) => p.kind === "nav");
    assert.ok(header.html.startsWith("<header") && header.html.endsWith("</header>"));
    assert.ok(header.html.includes("<nav") && header.html.includes("Pricing"));
    assert.ok(out.every((p) => p.reason));
});

test("div soup gives nothing", () => {
    const soup = `<div class="a"><div class="b"><p>Hello there, this is a long enough line of text.</p><div class="c"><span>More text here for length</span></div></div><div class="d"><div>Another block of words to read</div></div></div>`;
    assert.deepEqual(extractParts(soup), []);
});

test("a section needs a heading and text of its own", () => {
    const page = `<section><h2>Pricing</h2><p>Three plans for teams of every size, billed monthly.</p></section>
<section class="bg-gray-100"><div class="h-40"></div></section>
<section><p>Text with no heading at all, just a long paragraph of words.</p></section>
<section aria-label="Testimonials"><p>People say very kind things about the product here.</p></section>`;
    assert.deepEqual(kinds(extractParts(page).filter((p) => p.part)), ["section:Pricing", "section:Testimonials"]);
});

test("a nav with one link, or none, is not a nav", () => {
    const page = `<nav><a href="/">Home</a></nav><section><h2>One</h2><p>Some words that make this long enough to count.</p></section><section><h2>Two</h2><p>More words that make this one long enough too.</p></section>`;
    assert.deepEqual(kinds(extractParts(page).filter((p) => p.part)), ["section:One", "section:Two"]);
});

test("a page with fewer than two parts stays one piece", () => {
    assert.deepEqual(extractParts(`<section><h2>Only</h2><p>The only section of this page, with enough words.</p></section>`).filter((p) => p.part), []);
});

test("an app shell with a sidebar stays whole", () => {
    const shell = `<div class="flex"><aside><a href="/a">A</a><a href="/b">B</a></aside><main><section><h2>Overview</h2><p>Numbers for the week, shown as cards and a chart.</p></section><section><h2>Orders</h2><p>The latest orders, with their status and total.</p></section></main></div>`;
    assert.deepEqual(extractParts(shell).filter((p) => p.part), []);
});

test("wrappers are looked through, and a part is not looked into", () => {
    const page = `<div class="wrap"><main><section><h2>A</h2><p>Words enough to count as a section of the page here.</p><section><h3>Inner</h3><p>Words enough to count as a section of the page too.</p></section></section><section><h2>B</h2><p>Words enough to count as a section of the page, again.</p></section></main></div>`;
    assert.deepEqual(kinds(extractParts(page).filter((p) => p.part)), ["section:A", "section:B"]);
});

test("aria roles count as much as tags", () => {
    const page = `<div role="banner"><a href="/a">A</a><a href="/b">B</a></div><div role="region" aria-label="Plans"><p>Pick the plan that fits your team, billed monthly.</p></div><div role="contentinfo">Copyright 2026 Acme Inc. All rights reserved.</div>`;
    assert.deepEqual(kinds(extractParts(page).filter((p) => p.part)), ["nav:Header", "section:Plans", "footer:Footer"]);
});

test("buttons: styled ones with a text label, each style once", () => {
    const page = `<section><h2>Go</h2><p>Some buttons, and some things that only look a little like them.</p>
<button class="rounded bg-black px-4 py-2 text-white">Save</button>
<button class="rounded bg-black px-4 py-2 text-white mt-4">Save again</button>
<a href="#" class="rounded border border-black px-4 py-2">Learn more</a>
<button class="p-2"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></button>
<button>Plain</button>
<a href="/x" class="underline">A text link</a>
<button class="rounded bg-red-600 px-4 py-2 text-white">Delete</button></section><section><h2>Two</h2><p>The second section, for the page to have two parts.</p></section>`;
    assert.deepEqual(kinds(extractParts(page).filter((p) => !p.part)), ["button:Button: Save", "button:Button: Learn more", "button:Button: Delete"]);
});

test("forms need a field and a button; names say what they are", () => {
    const page = `<form><input type="search" name="q"><button>Go</button></form>
<form><input type="email" name="e"><input type="password" name="p"><button>Sign in</button></form>
<form><input type="text" name="a"><input type="email" name="b"><input type="password" name="c"><button>Join</button></form>
<form><input type="email" name="n"><button>Subscribe</button></form>
<form><p>No fields</p><button>Nothing</button></form>
<form><input type="text" name="x"></form>`;
    assert.deepEqual(extractParts(page).map((p) => p.name), ["Search form", "Sign-in form", "Sign-up form", "Newsletter form"]);
});

test("the same form twice is one form; a legend or heading names it", () => {
    const f = `<form><fieldset><legend>Your details</legend><input type="text" name="n"></fieldset><button>Save</button></form>`;
    assert.deepEqual(extractParts(f + f).map((p) => p.name), ["Your details"]);
});

test("unclosed tags do not break the tree", () => {
    const t = parseTree(`<ul><li>One<li>Two</ul><p>After`);
    const ul = t.children[0];
    assert.equal(ul.tag, "ul");
    assert.equal(ul.children.length, 2);
    assert.equal(t.children[1].tag, "p");
});

test("nothing to extract gives an empty list", () => {
    assert.deepEqual(extractParts(""), []);
    assert.deepEqual(extractParts("<p>Hi</p>"), []);
});

test("a section that holds the page's nav is a container: the nav comes out, the page stays whole", () => {
    const page = `<section class="bg-hero"><nav><a href="/a">A</a><a href="/b">B</a></nav><div class="pt-20"><h5>Build apps faster</h5><p>Components that handle the heavy lifting so you ship faster.</p><a href="#" class="rounded-full bg-black px-6 py-3 text-white">Get Started</a></div></section>`;
    const out = extractParts(page);
    assert.deepEqual(kinds(out), ["nav:Navigation", "button:Button: Get Started"]);
    assert.equal(out[0].part, false);
});

test("a section that holds several sections gives them, not itself", () => {
    const page = `<section><section><h2>One</h2><p>The first inner section, with enough words to count.</p></section><section><h2>Two</h2><p>The second inner section, with enough words to count.</p></section></section>`;
    assert.deepEqual(kinds(extractParts(page).filter((p) => p.part)), ["section:One", "section:Two"]);
});

test("cards inside a section do not take the section's place", () => {
    const page = `<section><h2>Features</h2><article><h3>Fast</h3><p>It is quick to use, from the first click to the last one.</p></article><article><h3>Clean</h3><p>It writes real HTML and Tailwind and nothing else.</p></article></section><section><h2>Pricing</h2><p>Simple plans for everyone, billed monthly with no surprises.</p></section>`;
    assert.deepEqual(kinds(extractParts(page).filter((p) => p.part)), ["section:Features", "section:Pricing"]);
});

test("a dashboard's title bar is not a hero, and chips and tabs are not buttons", () => {
    const page = `<header><h1>Operations</h1><p>Sunday, October 25</p><button class="rounded-md border px-3 py-1">Today</button><button class="rounded-full bg-gray-100 px-2 py-1">All 11</button></header><section><h2>Metrics</h2><p>Bookings, rides and revenue for the day, with the change since last week.</p></section><section><h2>Alerts</h2><p>Three open alerts that need somebody to look at them soon.</p></section>`;
    const out = extractParts(page);
    assert.deepEqual(kinds(out), ["section:Operations", "section:Metrics", "section:Alerts"]);
});
