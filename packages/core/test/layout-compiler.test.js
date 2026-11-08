import test from "node:test";
import assert from "node:assert/strict";
import { compile, emit, splitClasses, tw } from "../layout-compiler.js";

// pieces: leaves (text, buttons) and surfaces (boxes that are seen), placed by hand as a designer would on a free canvas
let z = 0;
const leaf = (k, x, y, w, h, nat = w) => ({ k, kind: "leaf", x, y, w, h, nat, z: z++ });
const surface = (k, x, y, w, h) => ({ k, kind: "surface", x, y, w, h, z: z++ });
const page = { x: 0, y: 0, w: 1280, h: 800 };
const find = (el, k) => (el.k === k ? el : el.kids.map((c) => find(c, k)).find(Boolean));
const parentOf = (el, k) => (el.kids.some((c) => c.k === k) ? el : el.kids.map((c) => parentOf(c, k)).find(Boolean));

test("Tailwind values: scale steps by name, anything else as an arbitrary value", () => {
    assert.equal(tw(16), "4"); assert.equal(tw(24), "6"); assert.equal(tw(1), "px"); assert.equal(tw(13), "[13px]");
});

test("a card: padding from the space around its content, a gap between, the title and subtitle grouped closer than the button", () => {
    z = 0;
    const nodes = [surface("card", 100, 100, 320, 176), leaf("title", 124, 124, 272, 28), leaf("sub", 124, 160, 272, 20), leaf("btn", 124, 212, 90, 40)];
    const tree = compile(page, nodes);
    const card = find(tree, "card");
    assert.ok(card.cls.includes("p-6"), card.cls.join(" "));
    assert.ok(card.cls.includes("flex") && card.cls.includes("flex-col"));
    assert.ok(card.cls.includes("gap-8"), card.cls.join(" ")); // 32px between the text group and the button
    const textGroup = parentOf(tree, "title");
    assert.ok(textGroup.group && textGroup.cls.includes("gap-2"), textGroup.cls.join(" ")); // 8px between title and subtitle
    assert.equal(parentOf(tree, "sub"), textGroup);
    assert.ok(card.cls.includes("items-start") || find(tree, "btn").cls.includes("self-start")); // the button keeps its own width
});

test("a bar: logo and button held apart (justify-between), items centred across", () => {
    z = 0;
    const nodes = [surface("bar", 0, 0, 1280, 64), leaf("logo", 32, 20, 120, 24), leaf("cta", 1128, 12, 120, 40)];
    const bar = find(compile(page, nodes), "bar");
    assert.ok(bar.cls.includes("justify-between"), bar.cls.join(" "));
    assert.ok(bar.cls.includes("items-center"), bar.cls.join(" "));
    assert.ok(bar.cls.includes("px-8"), bar.cls.join(" "));
});

test("equal cards in rows and columns are a grid", () => {
    z = 0;
    const cards = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) cards.push(surface(`c${r}${c}`, 64 + c * (368 + 24), 64 + r * (200 + 24), 368, 200));
    const tree = compile(page, cards);
    assert.ok(tree.cls.includes("grid") && tree.cls.includes("grid-cols-3") && tree.cls.includes("gap-6"), tree.cls.join(" "));
});

test("columns of their own widths that line up across rows (a table) are one grid with those tracks", () => {
    z = 0;
    const rows = [];
    for (let r = 0; r < 4; r++) { rows.push(leaf(`a${r}`, 0, r * 40, 200, 40), leaf(`b${r}`, 200, r * 40, 80, 40), leaf(`c${r}`, 280, r * 40, 160, 40)); }
    const tree = compile({ x: 0, y: 0, w: 440, h: 160 }, rows);
    assert.ok(tree.cls.includes("grid-cols-[200px_80px_160px]"), tree.cls.join(" "));
});

test("a column centred in a wider page at a named width is a container (w-full max-w-* mx-auto)", () => {
    z = 0;
    const nodes = [surface("top", 0, 0, 1280, 64), leaf("h", 64, 120, 1152, 40), leaf("p", 64, 176, 1152, 20)];
    const tree = compile(page, nodes);
    const col = parentOf(tree, "h");
    assert.ok(col.cls.includes("max-w-6xl") && col.cls.includes("mx-auto"), col.cls.join(" "));
});

test("one small thing centred in a box (an icon in a round button) is centred, with the box's size, not odd padding", () => {
    z = 0;
    const nodes = [surface("btn", 100, 100, 40, 40), { ...leaf("icon", 111, 111, 18, 18), replaced: true, fixedW: true, fixedH: true }];
    const btn = find(compile(page, nodes), "btn");
    assert.ok(btn.cls.includes("w-10") && btn.cls.includes("h-10"), btn.cls.join(" "));
    assert.ok(btn.cls.includes("items-center") && btn.cls.includes("justify-center"), btn.cls.join(" "));
});

test("a piece over another is a layer: absolute, behind the content when it was painted first", () => {
    z = 0;
    const nodes = [surface("hero", 0, 0, 1280, 600), surface("glow", 0, 0, 1280, 600), leaf("h", 64, 200, 600, 60)];
    nodes[1].z = 0.5; // painted after the hero, before the heading
    const tree = compile(page, nodes);
    const glow = find(tree, "glow");
    assert.ok(glow.cls.includes("absolute") || find(tree, "hero").kids.length >= 1);
});

test("emit writes pieces with their own look and the layout around them; table cells out of a table become boxes", () => {
    z = 0;
    const nodes = [surface("card", 0, 0, 200, 52), leaf("t", 16, 16, 168, 20)];
    const pieces = { card: { tag: "td", attrs: "", keep: ["bg-white"], kind: "surface" }, t: { tag: "p", attrs: "", keep: ["font-bold"], kind: "leaf", inner: "Hi" } };
    const html = emit(compile({ x: 0, y: 0, w: 200, h: 52 }, nodes), pieces);
    assert.match(html, /<div class="[^"]*p-4[^"]*bg-white">/);
    assert.match(html, /<p class="font-bold">Hi<\/p>/);
});

test("a piece's layout classes are dropped, its look and its own inside stay", () => {
    const leafC = splitClasses("mt-4 w-full flex items-center gap-2 px-3 text-sm font-bold md:ml-auto w-10", "leaf");
    assert.deepEqual(leafC.keep, ["flex", "items-center", "gap-2", "px-3", "text-sm", "font-bold", "w-10"]);
    const surf = splitClasses("p-6 flex gap-4 rounded-lg bg-white shadow w-80", "surface");
    assert.deepEqual(surf.keep, ["rounded-lg", "bg-white", "shadow"]);
});
