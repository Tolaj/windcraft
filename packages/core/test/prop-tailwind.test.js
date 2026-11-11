import test from "node:test";
import assert from "node:assert/strict";
import { groupOf, twValue } from "../prop-tailwind.js";
import { GROUPS } from "../class-groups.js";

test("fractional pixel dimensions remain exact arbitrary Tailwind values", () => {
    for (const [prop, group] of [["width", "w"], ["height", "h"]]) {
        assert.equal(GROUPS[group].build(twValue(prop, "100.5px", false)), `${group}-[100.5px]`);
        assert.equal(GROUPS[group].build(twValue(prop, "100.5px", true)), `${group}-[100.5px]`);
        assert.equal(GROUPS[group].build(twValue(prop, "160px", false)), `${group}-40`);
    }
});

test("visibility and user-select are Tailwind classes, not inline styles", () => {
    assert.equal(groupOf("visibility"), "visibility");
    assert.equal(twValue("visibility", "hidden", false), "invisible");
    assert.equal(twValue("visibility", "visible", false), "visible");
    assert.equal(groupOf("user-select"), "userSelect");
    assert.equal(twValue("user-select", "none", false), "select-none");
});

test("opacity: the panel's fraction becomes the class number, with or without a scale class under it", () => {
    assert.equal(twValue("opacity", "0.9", false), "90");
    assert.equal(twValue("opacity", "0.9", true), "90"); // was "1": a fraction over an existing opacity-50
    assert.equal(twValue("opacity", "50", true), "50");
    assert.equal(twValue("opacity", "0", true), "0");
});

test("z-index and opacity: values outside Tailwind's own steps are arbitrary values, which work in every version", () => {
    assert.equal(twValue("z-index", "30", false), "30");
    assert.equal(twValue("z-index", "9999", false), "[9999]");
    assert.equal(twValue("z-index", "-1", false), "-[1]");
    assert.equal(twValue("opacity", "33", false), "[0.33]");
    assert.equal(twValue("opacity", "0.33", false), "[0.33]");
    assert.equal(twValue("opacity", "75", false), "75");
});

import { getGroup, setGroup } from "../class-groups.js";
test("the animation group reads and writes animate-* classes, at a state too", () => {
    assert.equal(getGroup("p-4 animate-spin", "animation", "").value, "spin");
    assert.equal(getGroup("p-4 animate-wiggle", "animation", "").value, "wiggle");
    assert.equal(getGroup("p-4 hover:animate-bounce", "animation", "hover:").value, "bounce");
    assert.equal(getGroup("p-4 animate-[spin_1s_linear]", "animation", ""), null, "an arbitrary value is not one of the names");
    assert.match(setGroup("p-4", "animation", "fade-in", ""), /animate-fade-in/);
    assert.ok(!/animate-spin/.test(setGroup("p-4 animate-spin", "animation", "pulse", "")), "one animation at a time");
    assert.ok(!/animate-/.test(setGroup("p-4 animate-spin", "animation", "", "")), "empty removes it");
    assert.match(setGroup("p-4", "animation", "bounce", "hover:"), /hover:animate-bounce/);
});
