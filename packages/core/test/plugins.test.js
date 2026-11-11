import test from "node:test";
import assert from "node:assert/strict";
import { CATALOGUE, cleanPlugins, cleanStep, cleanRecipe, cleanRecipes, cleanEngine, linkRecipe, activeRecipes, tailwindTag, pluginHead, recipeCss4, TAILWIND4_SRC } from "../plugins.js";
import { normalizeTheme, themeHead } from "../theme.js";
import { configToV4, themeCss4 } from "../theme-v4.js";

test("catalogue ids: only known, once each, in order; no aspect-ratio", () => {
    assert.deepEqual(cleanPlugins(["typography", "nope", "forms", "forms"]), ["forms", "typography"]);
    assert.deepEqual(cleanPlugins("forms"), []);
    assert.ok(!CATALOGUE.some((r) => r.id === "aspect-ratio"), "the old aspect-ratio plugin breaks Tailwind's own aspect-*");
    assert.deepEqual(CATALOGUE.map((r) => r.engine).filter((e, i, a) => a.indexOf(e) === i).sort(), ["3", "4"]);
});

test("steps are checked: https only, plain links, no markup in CSS", () => {
    assert.deepEqual(cleanStep({ type: "script", src: "https://x.com/a.js" }), { type: "script", src: "https://x.com/a.js" });
    assert.equal(cleanStep({ type: "script", src: "http://x.com/a.js" }), null);
    assert.equal(cleanStep({ type: "script", src: 'https://x.com/"onload=1' }), null);
    assert.equal(cleanStep({ type: "official3", name: "nope" }), null);
    assert.equal(cleanStep({ type: "css4", text: "</style><script>1</script>" }), null);
    assert.ok(cleanStep({ type: "css4", text: '@import "https://x.com/a.css";' }));
    assert.equal(cleanStep({ type: "eval", code: "1" }), null);
});

test("recipes: a name, an engine, steps; duplicates and catalogue ids dropped; at most twelve", () => {
    const r = cleanRecipe({ id: "mine", name: "My <b>plugin</b>", engine: "4", steps: [{ type: "script", src: "https://x.com/a.js" }, { type: "bad" }] });
    assert.deepEqual(r, { id: "mine", name: "My bplugin/b", engine: "4", steps: [{ type: "script", src: "https://x.com/a.js" }], on: true });
    assert.equal(cleanRecipe({ id: "Bad Id", steps: [{ type: "script", src: "https://x.com/a.js" }] }), null);
    assert.equal(cleanRecipe({ id: "empty", steps: [] }), null);
    const ok = { id: "a", steps: [{ type: "script", src: "https://x.com/a.js" }] };
    assert.equal(cleanRecipes([ok, ok, { ...ok, id: "forms" }]).length, 1);
    assert.equal(cleanRecipes(Array.from({ length: 30 }, (_, i) => ({ ...ok, id: `r${i}` }))).length, 12);
    assert.equal(cleanEngine("9"), "3");
});

test("old custom links become one-step recipes", () => {
    const t = normalizeTheme({ customPlugins: ["https://x.com/a.css", "https://x.com/b.js", "http://bad.com/c.js"] });
    assert.deepEqual(t.recipes.map((r) => r.steps[0].type), ["stylesheet", "script"]);
    assert.equal(t.customPlugins, undefined);
});

test("engine 3: the CDN tag carries the official plugins; plugin files go through the require stand-in; only the engine's recipes run", () => {
    const t = normalizeTheme({ plugins: ["forms", "preline", "daisyui", "preline5"] });
    assert.match(tailwindTag(t), /\?plugins=forms"/);
    assert.deepEqual(activeRecipes(t).map((r) => r.id), ["forms", "preline", "daisyui"], "the v4 recipe is not run on engine 3");
    const head = pluginHead(t);
    assert.match(head, /preline@2\.7\.0\/plugin\.js/);
    assert.match(head, /tailwind\.config\.plugins=window\.__wcP/);
    assert.match(head, /daisyui@4\.12\.14/);
    assert.ok(!head.includes("preline@5"), "nothing of the other engine");
    assert.equal(pluginHead({}), "");
    const full = themeHead(t);
    assert.ok(full.indexOf("tailwind.config =") < full.indexOf("plugin.js"), "the config is set before the plugins read it");
});

test("engine 4: the browser build, theme as CSS, recipe CSS inside the same block", () => {
    const t = normalizeTheme({ engine: "4", plugins: ["daisyui5", "forms"], config: JSON.stringify({ colors: { accent: "#f97316" }, animation: { wiggle: "wiggle 1s infinite" }, keyframes: { wiggle: { "50%": { opacity: "0.5" } } }, screens: { md: "900px" } }) });
    assert.equal(tailwindTag(t), `<script src="${TAILWIND4_SRC}"><\/script>`);
    const head = themeHead(t);
    assert.match(head, /<style type="text\/tailwindcss" data-wc-theme>/);
    assert.match(head, /--color-brand-600: #4f46e5;/);
    assert.match(head, /--color-accent: #f97316;/);
    assert.match(head, /--breakpoint-md: 900px;/);
    assert.match(head, /--animate-wiggle: wiggle 1s infinite;/);
    assert.match(head, /@keyframes wiggle \{\n {2}50% \{ opacity: 0\.5; \}/);
    assert.match(head, /daisyui@5\/daisyui\.css/);
    assert.ok(!head.includes("tailwind.config"), "no config object on engine 4");
    const own = normalizeTheme({ engine: "4", recipes: [{ id: "x", steps: [{ type: "css4", text: '@import "a.css";\n@custom-variant foo (&:hover);' }], engine: "4" }] });
    const h2 = themeHead(own);
    assert.ok(h2.indexOf('@import "a.css"') < h2.indexOf("@custom-variant dark") && h2.indexOf("@import") < h2.indexOf("@theme"), "@import comes first, or the whole stylesheet is invalid");
    assert.equal(recipeCss4(normalizeTheme({ recipes: [{ id: "x", engine: "4", steps: [{ type: "css4", text: "@theme { --a: 1; }" }] }] })), "", "engine 3 adds no v4 CSS");
    assert.ok(!themeHead(normalizeTheme({ engine: "4", config: JSON.stringify({ colors: { x: "</style><script>1</script>" } }) })).match(/<\/style><script>/), "a style end in the config cannot break out");
});

test("configToV4 names what it cannot turn into variables", () => {
    const { css, skipped } = configToV4({ colors: { brand: { 600: "#111", DEFAULT: "#222" } }, fontSize: { big: ["2rem", { lineHeight: "2.5rem" }] }, transitionDuration: { slow: "900ms" }, borderRadius: { DEFAULT: "4px", md: "8px" } });
    assert.match(css, /--color-brand-600: #111;/);
    assert.match(css, /--color-brand: #222;/);
    assert.match(css, /--text-big: 2rem;/);
    assert.match(css, /--text-big--line-height: 2.5rem;/);
    assert.match(css, /--radius-md: 8px;/);
    assert.ok(!/--radius-sm: 4px/.test(css));
    assert.deepEqual(skipped, ["transitionDuration"]);
    assert.match(themeCss4({}).css, /@custom-variant dark/);
});
