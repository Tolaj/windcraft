import test from "node:test";
import assert from "node:assert/strict";
import { mountPlan } from "../mount-order.js";

const frames = (n, priority = () => false) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, d: i * 10, priority: priority(i) }));

test("with nothing picked out, the nearest frames load first and the rest follow", () => {
    const p = mountPlan(frames(20), { max: 15, now: 4 });
    assert.deepEqual(p.now, ["f0", "f1", "f2", "f3"]);
    assert.equal(p.later.length, 11);
    assert.equal(p.keep.length, 15, "no more than max are kept");
    assert.deepEqual(p.later.slice(0, 2), ["f4", "f5"], "nearest first");
});

test("frames that match come first, even when they are farther away", () => {
    const p = mountPlan(frames(10, (i) => i === 7 || i === 9));
    assert.deepEqual(p.now, ["f7", "f9"], "the matches load at once");
    assert.deepEqual(p.later.slice(0, 3), ["f0", "f1", "f2"], "the others follow, nearest first");
});

test("matches fill the limit before anything else does", () => {
    const p = mountPlan(frames(30, (i) => i >= 20), { max: 5, now: 2 });
    assert.deepEqual(p.keep, ["f20", "f21", "f22", "f23", "f24"]);
    assert.deepEqual(p.later, [], "with only matches kept, all of them load at once");
});

test("when every frame matches, it is the same as nothing picked out", () => {
    const p = mountPlan(frames(12, () => true), { max: 10, now: 3 });
    assert.deepEqual(p.now, ["f0", "f1", "f2"]);
    assert.equal(p.later.length, 7);
});

test("no frames, no previews", () => {
    assert.deepEqual(mountPlan([]), { now: [], later: [], keep: [] });
});
