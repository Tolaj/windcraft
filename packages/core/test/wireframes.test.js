import test from "node:test";
import assert from "node:assert/strict";
import { KIND_NAMES, LAYOUTS, SECTIONS, wireframe } from "../wireframes.js";

const KINDS = Object.keys(KIND_NAMES);
/** One root element: the editor's insert keeps only the first one, so a wireframe must be a single tree. */
function singleRoot(html) {
    const open = html.match(/^<([a-z]+)\b/);
    if (!open || !html.endsWith(`</${open[1]}>`)) return false;
    // walk the tags: depth must reach 0 only at the very end
    let depth = 0;
    const re = /<\/?([a-z0-9]+)\b[^>]*>/g;
    let m, closedAt = -1;
    while ((m = re.exec(html))) {
        if (m[0].startsWith("</")) depth--; else depth++;
        if (depth === 0) { closedAt = re.lastIndex; break; }
    }
    return closedAt === html.length;
}

test("the same kind and number always give the same wireframe", () => {
    for (const k of [...KINDS, "all"]) for (const n of [0, 1, 7, 42]) assert.deepEqual(wireframe(k, n), wireframe(k, n));
});

test("every wireframe is one element, with nothing left unfilled", () => {
    for (const k of KINDS) for (let n = 0; n < 60; n++) {
        const w = wireframe(k, n);
        assert.ok(singleRoot(w.html), `${w.id} has one root`);
        assert.ok(!/undefined|NaN|\$\{/.test(w.html + w.name), `${w.id} is fully built`);
        assert.ok(w.name.length > 2, `${w.id} has a name`);
    }
    [...LAYOUTS, ...SECTIONS].forEach(([id, , html]) => assert.ok(singleRoot(html), `${id} has one root`));
});

test("the list keeps going: many different wireframes, of every kind", () => {
    const seen = new Set(), kinds = new Set();
    for (let n = 0; n < 400; n++) { const w = wireframe("all", n); seen.add(w.html); kinds.add(w.kind); }
    assert.equal(kinds.size, KINDS.length);
    assert.ok(seen.size > 250, `${seen.size} distinct out of 400 (small kinds such as Stats run out and repeat: the list skips repeats)`);
    const pages = new Set();
    for (let n = 0; n < 200; n++) pages.add(wireframe("pages", n).html);
    assert.equal(pages.size, 200, "whole pages never repeat in the first 200");
});
