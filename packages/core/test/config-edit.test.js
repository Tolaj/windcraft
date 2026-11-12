import test from "node:test";
import assert from "node:assert/strict";
import { addToExtend, addAnimation, animationNames } from "../config-edit.js";

const run = (text) => new Function("module", "require", `${text}\nreturn module.exports;`)({ exports: {} }, () => ({}));
const FADE = { name: "fade-in", keyframes: { "0%": { opacity: "0" }, "100%": { opacity: "1" } }, animation: "fade-in 0.6s ease-out both" };

test("an animation goes into theme.extend, whatever the file looks like, and the file stays valid", () => {
    const cases = {
        template: `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\n`,
        noExtend: `module.exports = {\n  theme: {\n    colors: { a: "red" },\n  },\n};\n`,
        noTheme: `module.exports = {\n  plugins: [],\n};\n`,
        withColors: `module.exports = {\n  theme: { extend: { colors: { proj: "#0f766e" } } },\n  plugins: [require("@tailwindcss/typography")],\n};\n`,
        oneLine: `module.exports = { theme: { extend: {} } }`,
    };
    for (const [label, src] of Object.entries(cases)) {
        const r = addAnimation(src, "3", FADE);
        assert.equal(r.status, "added", label);
        const cfg = run(r.text);
        assert.equal(cfg.theme.extend.animation["fade-in"], "fade-in 0.6s ease-out both", label);
        assert.equal(cfg.theme.extend.keyframes["fade-in"]["100%"].opacity, "1", label);
        if (label === "withColors") assert.equal(cfg.theme.extend.colors.proj, "#0f766e", "what was there is kept");
        if (label === "noExtend") assert.equal(cfg.theme.colors.a, "red");
    }
});

test("a second animation joins the first; a taken name is refused; comments and strings are not fooled", () => {
    const one = addAnimation(`module.exports = { theme: { extend: {} } };`, "3", FADE).text;
    const two = addAnimation(one, "3", { name: "wiggle", keyframes: { "50%": { transform: "rotate(3deg)" } }, animation: "wiggle 1s infinite" });
    assert.equal(two.status, "added");
    const cfg = run(two.text);
    assert.deepEqual(Object.keys(cfg.theme.extend.animation), ["fade-in", "wiggle"]);
    assert.deepEqual(Object.keys(cfg.theme.extend.keyframes), ["fade-in", "wiggle"]);
    assert.equal(addAnimation(two.text, "3", FADE).status, "exists");
    const tricky = `module.exports = {\n  // extend: { animation: { "fade-in": "x" } }\n  theme: {\n    extend: { content: { a: "extend: {" } },\n  },\n};\n`;
    const r = addAnimation(tricky, "3", FADE);
    assert.equal(r.status, "added");
    assert.equal(run(r.text).theme.extend.animation["fade-in"], "fade-in 0.6s ease-out both");
    assert.equal(addAnimation(one, "3", { ...FADE, name: "Bad Name" }).status, "badname");
    assert.equal(addAnimation("no config here", "3", FADE).status, "nowhere");
});

test("a trailing comma, or none, in an existing section is handled", () => {
    const a = addToExtend(`module.exports = { theme: { extend: { animation: { one: "one 1s" } } } };`, "animation", "two", "two 2s");
    assert.equal(run(a.text).theme.extend.animation.two, "two 2s");
    const b = addToExtend(`module.exports = {\n  theme: {\n    extend: {\n      animation: {\n        one: "one 1s",\n      },\n    },\n  },\n};`, "animation", "two", "two 2s");
    const cfg = run(b.text).theme.extend.animation;
    assert.deepEqual(Object.keys(cfg), ["one", "two"]);
});

test("Tailwind 4: the animation is CSS in the file", () => {
    const r = addAnimation(`@import "tailwindcss";\n`, "4", FADE);
    assert.equal(r.status, "added");
    assert.match(r.text, /@import "tailwindcss";/);
    assert.match(r.text, /--animate-fade-in: fade-in 0\.6s ease-out both;/);
    assert.match(r.text, /@keyframes fade-in \{\n {2}0% \{ opacity: 0; \}/);
    assert.equal(addAnimation(r.text, "4", FADE).status, "exists");
});

test("the animations a file defines are listed", () => {
    assert.deepEqual(animationNames(`module.exports = { theme: { extend: { animation: { "fade-in": "a 1s", wiggle: 'w 1s', 'slide-up': "s" }, keyframes: { x: {} } } } }`), ["fade-in", "wiggle", "slide-up"]);
    assert.deepEqual(animationNames(`module.exports = {}`), []);
});

test("a quoted section key is found, not duplicated", () => {
    const r = addToExtend(`module.exports = { theme: { extend: { "animation": { one: "one 1s" } } } };`, "animation", "two", "two 2s");
    assert.equal(r.status, "added");
    assert.equal((r.text.match(/animation/g) || []).length, 1);
    assert.deepEqual(Object.keys(run(r.text).theme.extend.animation), ["one", "two"]);
});
