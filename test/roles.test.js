// The role of a selected element and the roles of a design use the same words, so "suited designs" is a match.
import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, roleOfElement, rolesOfDesign, KINDS_FOR_ROLE } from "../packages/core/roles.js";

const role = (el) => roleOfElement({ pageW: 1280, ...el }).role;

test("by tag", () => {
    assert.equal(role({ tag: "aside" }), "sidebar");
    assert.equal(role({ tag: "header", rect: { w: 1280, h: 64 } }), "navbar");
    assert.equal(role({ tag: "nav", rect: { w: 1280, h: 56 } }), "navbar");
    assert.equal(role({ tag: "nav", rect: { w: 220, h: 800 } }), "sidebar", "a tall narrow nav is a sidebar");
    assert.equal(role({ tag: "footer" }), "footer");
    assert.equal(role({ tag: "form" }), "form");
    assert.equal(role({ tag: "table" }), "table");
    assert.equal(role({ tag: "button" }), "button");
    assert.equal(role({ tag: "input" }), "field");
    assert.equal(role({ tag: "ul" }), "list");
});

test("text and pictures have no designs to swap in", () => {
    for (const tag of ["h1", "p", "span", "li", "img"]) assert.equal(role({ tag }), null, tag);
});

test("a plain box: by its shape and where it sits", () => {
    assert.equal(role({ tag: "div", rect: { w: 224, h: 820, y: 0 }, parentLayout: "flex row", index: 0, siblings: 2 }), "sidebar", "tall, narrow, first in a row");
    assert.equal(role({ tag: "div", rect: { w: 1280, h: 64, y: 0 }, index: 0, siblings: 3 }), "navbar", "wide, short, at the top");
    assert.equal(role({ tag: "div", rect: { w: 1280, h: 90, y: 900 }, index: 3, siblings: 4 }), "footer", "wide, short, last");
    assert.equal(role({ tag: "section", rect: { w: 1280, h: 90, y: 400 }, index: 1, siblings: 4 }), "banner", "wide, short, in the middle");
    assert.equal(role({ tag: "section", rect: { w: 1280, h: 620, y: 80 }, index: 1, siblings: 4 }), "hero", "wide and tall, near the top");
    assert.equal(role({ tag: "section", rect: { w: 1280, h: 500, y: 1200 }, index: 2, siblings: 5 }), "section", "wide and tall, further down");
    assert.equal(role({ tag: "div", rect: { w: 320, h: 240, y: 300 } }), "card", "small");
});

test("a guess comes with alternatives, and not itself", () => {
    const r = roleOfElement({ tag: "aside" });
    assert.equal(r.role, "sidebar");
    assert.ok(r.alts.length > 0 && !r.alts.includes("sidebar"));
});

test("a design's roles: its own code first", () => {
    assert.equal(rolesOfDesign({ html: `<aside class="w-64 h-screen p-6">Menu</aside>`, category: "layout-basic", title: "Panel" })[0], "sidebar");
    assert.ok(rolesOfDesign({ html: `<div class="h-screen w-60 bg-white">x</div>`, title: "Thing" }).includes("sidebar"), "a full-height narrow box");
    assert.equal(rolesOfDesign({ html: `<footer class="p-8">x</footer>`, title: "x" })[0], "footer");
    assert.ok(rolesOfDesign({ html: `<nav class="fixed top-0 w-full">x</nav>`, title: "x" }).includes("navbar"));
    assert.ok(rolesOfDesign({ html: `<!doctype html><html><head><style>a{}</style></head><body><header>x</header></body></html>`, title: "x" }).includes("navbar"), "a whole document: its body counts");
});

test("a design's roles: words in the title and tags, then the category", () => {
    assert.ok(rolesOfDesign({ html: `<div>x</div>`, title: "Sidebar and content" }).includes("sidebar"));
    assert.ok(rolesOfDesign({ html: `<div>x</div>`, title: "x", tags: ["pricing"] }).includes("pricing"));
    assert.deepEqual(rolesOfDesign({ html: `<div>x</div>`, title: "x", category: "marketing-hero" }), ["hero"]);
    assert.ok(rolesOfDesign({ html: `<div>x</div>`, title: "Mega Menu 01", category: "navigation-mega-menu" }).includes("navbar"));
});

test("at most four roles, all known", () => {
    const r = rolesOfDesign({ html: `<aside>x</aside>`, title: "Sidebar navbar hero footer pricing faq", category: "marketing-hero" });
    assert.ok(r.length <= 4 && r.every((x) => ROLES[x]));
});

test("every role with layouts names real wireframe kinds", async () => {
    const { KIND_NAMES } = await import("../packages/core/wireframes.js");
    for (const [r, kinds] of Object.entries(KINDS_FOR_ROLE)) { assert.ok(ROLES[r], r); kinds.forEach((k) => assert.ok(KIND_NAMES[k], `${r}: ${k}`)); }
});
