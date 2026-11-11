import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, GROUPS, animationValue, classesFor, isEasing, keyframesCss } from "../animation-presets.js";
import { addAnimation } from "../config-edit.js";

const run = (text) => new Function("module", "require", `${text}\nreturn module.exports;`)({ exports: {} }, () => ({}));

test("the library is big, well formed and unique", () => {
    assert.ok(PRESETS.length >= 38, `${PRESETS.length} presets`);
    assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length, "ids are unique");
    const groups = new Set(GROUPS.map(([g]) => g));
    for (const p of PRESETS) {
        assert.match(p.id, /^[a-z][a-z0-9-]{0,30}$/, p.id);
        assert.ok(groups.has(p.group), `${p.id} has a known group`);
        assert.ok(p.dur > 0 && p.dur <= 60, `${p.id} time`);
        assert.ok(isEasing(p.ease), `${p.id} easing ${p.ease}`);
        assert.ok(Object.keys(p.kf).length >= 2 || Object.keys(p.kf).some((a) => /,/.test(a)), `${p.id} has steps`);
        for (const [at, props] of Object.entries(p.kf)) { assert.match(at, /^(\d+%)(,\s*\d+%)*$/, `${p.id} step ${at}`); assert.ok(Object.keys(props).length, `${p.id} ${at} sets something`); }
        assert.ok(/^(load|loop|hover)$/.test(p.on));
    }
    for (const [g] of GROUPS) assert.ok(PRESETS.some((p) => p.group === g), `${g} is not empty`);
});

test("every preset can be written into a config file, which stays valid, for both engines", () => {
    for (const p of PRESETS) {
        const r = addAnimation(`module.exports = { theme: { extend: {} } };\n`, "3", { name: p.id, keyframes: p.kf, animation: animationValue(p.id, p) });
        assert.equal(r.status, "added", p.id);
        const cfg = run(r.text).theme.extend;
        assert.equal(cfg.animation[p.id], animationValue(p.id, p), p.id);
        assert.deepEqual(cfg.keyframes[p.id], p.kf, p.id);
        const v4 = addAnimation(`@import "tailwindcss";\n`, "4", { name: p.id, keyframes: p.kf, animation: animationValue(p.id, p) });
        assert.equal(v4.status, "added", p.id);
        assert.match(v4.text, new RegExp(`@keyframes ${p.id} \\{`), p.id);
    }
});

test("the animation value follows the settings and refuses nonsense", () => {
    const p = PRESETS.find((x) => x.id === "fade-up");
    assert.equal(animationValue("fade-up", p), "fade-up 0.7s ease-out 0s 1 normal both");
    assert.equal(animationValue("x", p, { dur: 2, delay: 0.5, ease: "linear", repeat: "infinite", dir: "alternate", fill: "forwards" }), "x 2s linear 0.5s infinite alternate forwards");
    assert.equal(animationValue("x", p, { repeat: "3" }), "x 0.7s ease-out 0s 3 normal both");
    assert.equal(animationValue("x", p, { dur: -1, delay: 99999, ease: "red; display:none", repeat: "banana", dir: "sideways", fill: "x" }), "x 0.7s ease-out 0s 1 normal none", "invalid values fall back");
    assert.ok(isEasing("cubic-bezier(0.34, 1.56, 0.64, 1)") && isEasing("steps(4, jump-end)") && !isEasing("url(x)"));
});

test("classes: hover presets use hover:, reduced motion is respected unless declined", () => {
    const hover = PRESETS.find((p) => p.on === "hover"), load = PRESETS.find((p) => p.on === "load");
    assert.deepEqual(classesFor("lift", hover), ["hover:animate-lift", "motion-reduce:hover:animate-none"]);
    assert.deepEqual(classesFor("fade-in", load), ["animate-fade-in", "motion-reduce:animate-none"]);
    assert.deepEqual(classesFor("fade-in", load, { reducedMotion: false }), ["animate-fade-in"]);
    assert.match(keyframesCss("a", { "0%": { opacity: "0" } }), /^@keyframes a\{0%\{opacity:0\}\}$/);
});
