import test from "node:test";
import assert from "node:assert/strict";
import { TRIGGERS, triggerPlan, wire, stripWiring, readTrigger, WIRING, delayClass, hasMotionScript, MOTION_SCRIPT, ATTRS } from "../animation-triggers.js";

test("each trigger is wired with Tailwind classes, and scroll and click bring the script", () => {
    const load = triggerPlan("fade-up", "load");
    assert.deepEqual(load.classes, ["animate-fade-up", "motion-reduce:animate-none"]);
    assert.equal(load.needsScript, false);
    assert.deepEqual(triggerPlan("lift", "hover").classes, ["hover:animate-lift", "motion-reduce:hover:animate-none"]);
    assert.deepEqual(triggerPlan("lift", "focus", { reducedMotion: false }).classes, ["focus:animate-lift"]);
    const scroll = triggerPlan("fade-up", "scroll");
    assert.ok(scroll.classes.includes("[animation-play-state:paused]") && scroll.classes.includes("data-[reveal=in]:[animation-play-state:running]"));
    assert.deepEqual(scroll.attrs, { "data-reveal": "" });
    assert.equal(scroll.needsScript, true);
    assert.deepEqual(triggerPlan("fade-up", "scroll-repeat").attrs, { "data-reveal": "", "data-reveal-repeat": "" });
    assert.ok(triggerPlan("fade-up", "scroll-repeat").classes.includes("data-[reveal=out]:animate-none"));
    assert.deepEqual(triggerPlan("pop", "click").attrs, { "data-click-anim": "" });
    assert.ok(triggerPlan("pop", "click").classes[0] === "data-[play=on]:animate-pop");
    assert.throws(() => triggerPlan("Bad Name", "load"));
    assert.equal(TRIGGERS.length, 8);
    const scrub = triggerPlan("parallax-up", "scrub");
    assert.ok(scrub.classes.includes("[animation-timeline:view()]") && scrub.classes.includes("[animation-duration:auto]"));
    assert.equal(scrub.needsScript, false, "scroll-linked animation is CSS only");
    assert.ok(triggerPlan("progress", "scrub-page").classes.includes("[animation-timeline:scroll(root)]"));
    assert.ok(triggerPlan("p", "scrub", { range: "cover_0%_cover_100%" }).classes.includes("[animation-range:cover_0%_cover_100%]"), "a preset can set the range");
    assert.ok(triggerPlan("p", "scrub", { range: "x; evil" }).classes.includes("[animation-range:entry_0%_cover_60%]"), "a bad range falls back");
});

test("everything a plan adds is taken off again by the strip, and nothing else is", () => {
    for (const [t] of TRIGGERS) for (const c of triggerPlan("fade-up", t).classes) assert.ok(WIRING.test(c), `${t}: ${c}`);
    const mixed = "p-4 bg-black animate-spin hover:animate-bounce motion-reduce:animate-none [animation-play-state:paused] data-[reveal=in]:[animation-play-state:running] data-[play=on]:animate-x rounded animate-[wiggle_1s_linear]";
    assert.equal(stripWiring(mixed), "p-4 bg-black rounded animate-[wiggle_1s_linear]", "an arbitrary animation is not ours to remove");
    assert.equal(stripWiring(`p-4 ${delayClass(80)}`), "p-4", "the stagger delay goes with it");
    assert.equal(wire("p-4 animate-spin", "fade-up", "hover").classes, "p-4 hover:animate-fade-up motion-reduce:hover:animate-none");
});

test("what an element plays, and on what, is read back from its classes and attributes", () => {
    for (const [t] of TRIGGERS) { const w = wire("p-4", "fade-up", t); assert.deepEqual(readTrigger(w.classes, w.attrs), { name: "fade-up", trigger: t }, t); }
    assert.equal(readTrigger("p-4 rounded", {}), null);
    assert.deepEqual(readTrigger("animate-spin", {}), { name: "spin", trigger: "load" });
    assert.equal(delayClass(80), "[animation-delay:calc(var(--i)*80ms)]");
    assert.equal(delayClass(99999), "[animation-delay:calc(var(--i)*2000ms)]");
    assert.deepEqual(ATTRS, ["data-reveal", "data-reveal-repeat", "data-click-anim", "data-play"]);
});

test("the motion script is recognised once added", () => {
    assert.equal(hasMotionScript([]), false);
    assert.equal(hasMotionScript([{ src: "", text: MOTION_SCRIPT }]), true);
    assert.equal(hasMotionScript([{ src: "https://x.com/a.js", text: "" }]), false);
    assert.ok(!/<\/script/i.test(MOTION_SCRIPT), "it can sit in a script tag");
    new Function(MOTION_SCRIPT.replace(/^\/\*wc-motion\*\//, "")); // it is valid JavaScript
});

import { typewriterClasses, typingSeconds, EFFECT_ENTRIES, REVEALS } from "../text-effects.js";
import { addKeyframes, hasEntry, addAnimation } from "../config-edit.js";
test("effects: the typewriter's classes are stripped with the rest, and its entries go into a config", () => {
    const cls = typewriterClasses(24, 2);
    assert.ok(cls.includes("[--chars:24ch]") && cls.includes("[animation-timing-function:steps(24,end),step-end]") && cls.includes("[animation-duration:2s,0.8s]"));
    assert.ok(cls.filter((c) => c.startsWith("[")).every((c) => WIRING.test(c)), "so changing the effect leaves nothing behind");
    assert.equal(typingSeconds(28), 2); assert.equal(typingSeconds(5), 1); assert.equal(typingSeconds(5000), 8);
    const run = (t) => new Function("module", `${t}\nreturn module.exports;`)({ exports: {} });
    let t = `module.exports = { theme: { extend: {} } };`;
    for (const e of Object.values(EFFECT_ENTRIES)) { assert.equal(hasEntry(t, "3", e.name), false); t = e.animation ? addAnimation(t, "3", { name: e.name, keyframes: e.kf, animation: e.animation }).text : addKeyframes(t, "3", e.name, e.kf).text; assert.equal(hasEntry(t, "3", e.name), true, e.name); }
    const cfg = run(t).theme.extend;
    assert.ok(cfg.keyframes["blink-caret"] && cfg.keyframes.typewriter && cfg.animation.typewriter.includes("blink-caret"));
    assert.equal(addKeyframes(t, "3", "blink-caret", {}).status, "exists");
    const v4 = addKeyframes(`@import "tailwindcss";\n`, "4", "blink-caret", EFFECT_ENTRIES["blink-caret"].kf);
    assert.match(v4.text, /@keyframes blink-caret/);
    assert.equal(hasEntry(v4.text, "4", "blink-caret"), true);
    assert.ok(REVEALS.length >= 8 && REVEALS.every((r) => r.entry.animation.startsWith(r.id)));
});
