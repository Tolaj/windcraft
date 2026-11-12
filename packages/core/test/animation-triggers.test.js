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
    assert.equal(TRIGGERS.length, 6);
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
