// A design put in a wireframe's slot keeps the slot's place in the layout and brings its own look.
import test from "node:test";
import assert from "node:assert/strict";
import { isSlot, fillClasses } from "../packages/core/slot-fill.js";

const set = (s) => new Set(s.split(" ").filter(Boolean));

test("a slot is an empty element in the placeholder greys", () => {
    assert.equal(isSlot({ kids: 0, ownText: false, classes: "hidden w-60 shrink-0 md:block rounded-lg bg-gray-300" }), true);
    assert.equal(isSlot({ kids: 0, ownText: false, classes: "h-40 rounded-lg bg-gray-200" }), true);
    assert.equal(isSlot({ kids: 2, ownText: false, classes: "rounded-lg bg-gray-300" }), false, "with content it is not a slot");
    assert.equal(isSlot({ kids: 0, ownText: true, classes: "bg-gray-300" }), false, "with text it is not a slot");
    assert.equal(isSlot({ kids: 0, ownText: false, classes: "bg-white p-4" }), false, "not a placeholder grey");
});

test("the slot's size and place win, the design's look stays", () => {
    const out = set(fillClasses("w-60 shrink-0 rounded-lg bg-gray-300", "w-64 h-screen bg-white border-r p-6 fixed top-0"));
    assert.ok(out.has("w-60") && out.has("shrink-0"), "the slot's role is kept");
    assert.ok(!out.has("w-64"), "the design's width is gone");
    for (const gone of ["h-screen", "fixed", "top-0", "bg-gray-300"]) assert.ok(!out.has(gone), `${gone} is taken off`);
    for (const stay of ["bg-white", "border-r", "p-6"]) assert.ok(out.has(stay), `${stay} stays: the design's look`);
});

test("a variant of the same utility is its own group", () => {
    const out = set(fillClasses("w-full md:w-60", "w-64 md:w-72 lg:w-80"));
    assert.ok(out.has("w-full") && out.has("md:w-60"));
    assert.ok(!out.has("w-64") && !out.has("md:w-72"), "same group and variant as the slot's: the slot's wins");
    assert.ok(out.has("lg:w-80"), "a variant the slot does not set stays");
});

test("hidden on a small screen: shown from md up in the design's own layout", () => {
    const out = set(fillClasses("hidden w-60 shrink-0 md:block bg-gray-300", "flex flex-col gap-2 p-4"));
    assert.ok(out.has("hidden") && out.has("md:flex"), "hidden, then md:flex (not md:block)");
    assert.ok(!out.has("md:block") && !out.has("flex"), "no bare flex (it would show it on a small screen) and no md:block");
    assert.ok(out.has("flex-col") && out.has("gap-2") && out.has("p-4"));
    const plain = set(fillClasses("hidden w-60 md:block", "p-4"));
    assert.ok(plain.has("md:block"), "a design with no display of its own is a block");
});

test("an arbitrary value with a colon is not a variant", () => {
    const out = set(fillClasses("w-60", "[&:hover]:bg-red-500 w-[260px]"));
    assert.ok(out.has("[&:hover]:bg-red-500"));
    assert.ok(!out.has("w-[260px]"));
});

test("a slot with no role leaves the design as it is, apart from what breaks a layout", () => {
    const out = set(fillClasses("rounded-lg bg-gray-200", "sticky top-0 z-50 border-b bg-white"));
    assert.deepEqual([...out].sort(), ["bg-white", "border-b"]);
});
