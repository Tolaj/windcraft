import test from "node:test";
import assert from "node:assert/strict";
import { stopsFromKeyframes, keyframesFromStops, propsOfStop, checkStops, blankStops, STRUCTURED } from "../keyframe-model.js";
import { PRESETS, keyframesCss } from "../animation-presets.js";
import { addAnimation } from "../config-edit.js";

test("every preset opens in the editor and comes back as the same animation (same look, not necessarily the same text)", () => {
    for (const p of PRESETS) {
        const stops = stopsFromKeyframes(p.kf);
        assert.ok(stops.length >= 2 || Object.keys(p.kf).length >= 2, p.id);
        const back = keyframesFromStops(stops);
        // the same positions, and each position sets the same properties
        const norm = (kf) => { const o = {}; for (const [k, v] of Object.entries(kf)) for (const at of k.split(",")) o[at.trim()] = { ...(o[at.trim()] || {}), ...v }; return o; };
        const a = norm(p.kf), b = norm(back);
        assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), `${p.id} positions`);
        for (const at of Object.keys(a)) assert.deepEqual(Object.keys(b[at]).sort(), Object.keys(a[at]).sort(), `${p.id} ${at} properties`);
        // and the result is a config-ready animation
        const r = addAnimation(`module.exports = { theme: { extend: {} } };`, "3", { name: p.id, keyframes: back, animation: `${p.id} 1s ease 0s 1 normal both` });
        assert.equal(r.status, "added", p.id);
    }
});

test("a transform is read into fields and written back in a fixed order", () => {
    const [s] = stopsFromKeyframes({ "0%": { transform: "translateY(24px) scale(0.9) rotate(-3deg)" } });
    assert.deepEqual(s.set, { translateY: "24px", scale: 0.9, rotate: -3 });
    assert.equal(propsOfStop(s).transform, "translateY(24px) rotate(-3deg) scale(0.9)");
    const [f] = stopsFromKeyframes({ "0%": { transform: "perspective(600px) rotateX(70deg)" } });
    assert.equal(f.set.rotateX, 70);
    assert.equal(propsOfStop(f).transform, "perspective(600px) rotateX(70deg)");
    const [r] = stopsFromKeyframes({ "0%": { transform: "scale(1.25, 0.75)" } });
    assert.deepEqual([r.set.scaleX, r.set.scaleY], [1.25, 0.75]);
    assert.equal(propsOfStop(r).transform, "scale(1.25, 0.75)");
});

test("what the editor does not understand is kept as it was, and unsafe CSS is dropped", () => {
    const [s] = stopsFromKeyframes({ "0%": { transform: "matrix(1, 0, 0, 1, 0, 0)", "box-shadow": "0 0 24px rgba(1,2,3,.4)", color: "red; } body { display:none" } });
    assert.equal(s.raw.transform, "matrix(1, 0, 0, 1, 0, 0)");
    assert.equal(propsOfStop(s).transform, "matrix(1, 0, 0, 1, 0, 0)");
    assert.equal(propsOfStop(s)["box-shadow"], "0 0 24px rgba(1,2,3,.4)");
    assert.ok(!("color" in propsOfStop(s)), "a value that could break out of the rule is not kept");
    const evil = keyframesFromStops([{ at: 0, set: {}, raw: { "background": "url(x); }", "bad prop": "1" }, ease: "" }, { at: 100, set: { opacity: 1 }, raw: {}, ease: "" }]);
    assert.ok(!JSON.stringify(evil).includes("url(x)"));
});

test("stops: 'from' and 'to', shared positions, sorting, empty middles, per-stop easing", () => {
    const stops = stopsFromKeyframes({ from: { opacity: "0" }, "50%, 75%": { opacity: "0.5" }, to: { opacity: "1" } });
    assert.deepEqual(stops.map((s) => s.at), [0, 50, 75, 100]);
    const kf = keyframesFromStops([{ at: 100, set: { opacity: 1 }, raw: {}, ease: "" }, { at: 0, set: { opacity: 0 }, raw: {}, ease: "ease-in" }, { at: 40, set: {}, raw: {}, ease: "" }]);
    assert.deepEqual(Object.keys(kf), ["0%", "100%"], "an empty middle stop is not written; the ends always are");
    assert.equal(kf["0%"]["animation-timing-function"], "ease-in");
});

test("checking stops", () => {
    assert.equal(checkStops(blankStops()), "");
    assert.match(checkStops([{ at: 0, set: {}, raw: {} }]), /at least two/);
    assert.match(checkStops([{ at: 0, set: {}, raw: {} }, { at: 100, set: {}, raw: {} }]), /Set something/);
    assert.ok(STRUCTURED.every((f) => f.min < f.max && f.group));
    assert.match(keyframesCss("x", keyframesFromStops(blankStops())), /^@keyframes x\{0%\{opacity:0\}100%\{opacity:1\}\}$/);
});
