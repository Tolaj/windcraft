import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, normalizeTheme, brandScale, grayScale, radiusScale, tailwindConfig, themeHead, fontUrl } from "../theme.js";

test("normalizeTheme keeps valid choices and replaces anything else with the default", () => {
    assert.deepEqual(normalizeTheme({ brand: "#E11D48", gray: "zinc", font: "Poppins", radius: "xl" }), { brand: "#e11d48", gray: "zinc", font: "Poppins", radius: "xl", config: "", engine: "3", plugins: [], recipes: [] });
    assert.deepEqual(normalizeTheme(null), DEFAULT_THEME);
    assert.deepEqual(normalizeTheme({ brand: "red", gray: "hot", font: "a;b<script>", radius: "huge" }), DEFAULT_THEME);
    assert.equal(normalizeTheme({ brand: "ff0000" }).brand, "#ff0000");
    assert.equal(normalizeTheme({ font: "System" }).font, "System");
});

test("brandScale: the colour is 600, lighter steps get lighter, darker steps darker", () => {
    const s = brandScale("#4f46e5");
    assert.equal(s["600"], "#4f46e5");
    assert.deepEqual(Object.keys(s), ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]);
    const lum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    const order = Object.values(s).map(lum);
    assert.deepEqual([...order].sort((a, b) => b - a), order); // 50 is the lightest, 950 the darkest
});

test("gray palettes and radius scales", () => {
    assert.equal(grayScale("slate")["900"], "#0f172a");
    assert.equal(grayScale("nope")["500"], grayScale("slate")["500"]);
    assert.equal(radiusScale("none").md, "0px");
    assert.equal(radiusScale("md").md, "6px");
    assert.equal(radiusScale("xl").lg, "24px");
});

test("tailwindConfig and themeHead", () => {
    const c = tailwindConfig({ brand: "#0ea5e9", font: "System" });
    assert.equal(c.darkMode, "class");
    assert.equal(c.theme.extend.colors.brand["600"], "#0ea5e9");
    assert.ok(c.theme.extend.fontFamily.sans.includes("system-ui"));
    assert.equal(fontUrl({ font: "System" }), null);
    assert.equal(fontUrl({ font: "Open Sans" }), "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap");
    const head = themeHead({ font: "Inter" });
    assert.match(head, /fonts\.googleapis\.com/);
    assert.match(head, /tailwind\.config = \{/);
    assert.ok(!themeHead({ font: "System" }).includes("<link"));
});

import { TAILWIND_DEFAULTS, withDefaults, onlyChanges } from "../tailwind-defaults.js";
test("the editor shows the defaults with the project's changes over them; only the changes are stored", () => {
    assert.equal(withDefaults({}).screens.md, TAILWIND_DEFAULTS.screens.md);
    const shown = withDefaults({ screens: { md: "800px" }, colors: { accent: "#f97316" } });
    assert.equal(shown.screens.md, "800px");
    assert.equal(shown.screens.lg, TAILWIND_DEFAULTS.screens.lg);
    assert.equal(shown.colors.accent, "#f97316");
    assert.deepEqual(onlyChanges(shown), { screens: { md: "800px" }, colors: { accent: "#f97316" } });
    assert.deepEqual(onlyChanges(withDefaults({})), {}, "untouched defaults store nothing");
    assert.deepEqual(onlyChanges({ keyframes: { wiggle: { "50%": { opacity: "0.5" } } } }).keyframes.wiggle, { "50%": { opacity: "0.5" } });
});

import { pageTheme } from "../theme.js";
test("a page's theme is the project's with the page's own config laid over it", () => {
    const proj = { brand: "#0ea5e9", config: JSON.stringify({ colors: { accent: "#111111" }, screens: { md: "800px" } }) };
    const t = pageTheme(proj, JSON.stringify({ colors: { accent: "#f97316" } }));
    const c = JSON.parse(t.config);
    assert.equal(c.colors.accent, "#f97316");
    assert.equal(c.screens.md, "800px");
    assert.equal(t.brand, "#0ea5e9");
    assert.deepEqual(pageTheme(proj, ""), normalizeTheme(proj));
    assert.deepEqual(pageTheme(proj, "{bad"), normalizeTheme(proj));
});

import { configText, configStore, changedSections } from "../config-scope.js";
test("config levels: what an editor shows and what it stores", () => {
    const project = JSON.stringify({ screens: { md: "800px" } });
    assert.equal(JSON.parse(configText(project)).screens.md, "800px");
    assert.equal(JSON.parse(configText(project, "")).screens.md, "800px", "a page with no changes shows the project's");
    assert.equal(JSON.parse(configText(project, JSON.stringify({ screens: { lg: "1100px" } }))).screens.lg, "1100px");
    const shown = configText(project, "");
    assert.deepEqual(configStore(shown, project), { stored: "" }, "nothing changed on the page: nothing stored");
    const edited = shown.replace('"lg": "1024px"', '"lg": "1100px"');
    assert.deepEqual(JSON.parse(configStore(edited, project).stored), { screens: { lg: "1100px" } }, "a page stores only its difference from the project");
    assert.deepEqual(JSON.parse(configStore(shown).stored), { screens: { md: "800px" } }, "the project level stores its difference from Tailwind's defaults");
    assert.match(configStore("{bad").error, /Not valid JSON/);
    assert.deepEqual(changedSections(JSON.stringify({ screens: {}, colors: {} })), ["screens", "colors"]);
});
