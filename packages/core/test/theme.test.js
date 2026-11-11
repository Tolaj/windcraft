import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, normalizeTheme, pageTheme, brandScale, grayScale, radiusScale, tailwindConfig, themeHead, fontUrl } from "../theme.js";

test("normalizeTheme keeps valid choices and replaces anything else with the default", () => {
    assert.deepEqual(normalizeTheme({ brand: "#E11D48", gray: "zinc", font: "Poppins", radius: "xl" }), { brand: "#e11d48", gray: "zinc", font: "Poppins", radius: "xl", engine: "3", configJs: "", configCss: "", lock: {}, page: { js: "", css: "", lock: {} } });
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
    assert.match(head, /tailwind\.config=__c/);
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

test("a page's theme carries its own files over the project's; files are cleaned", () => {
    const proj = { brand: "#0ea5e9", configJs: "module.exports = {}", lock: { "a/b": { url: "https://x.com/a.js" } } };
    const t = pageTheme(proj, { js: "module.exports = { theme: { extend: { colors: { pg: '#123456' } } } }", lock: { "c/d": { url: "https://x.com/c.js" } } });
    assert.equal(t.brand, "#0ea5e9");
    assert.equal(t.configJs, "module.exports = {}");
    assert.match(t.page.js, /pg/);
    assert.deepEqual(t.page.lock, { "c/d": { url: "https://x.com/c.js" } });
    assert.deepEqual(pageTheme(proj, null).page, { js: "", css: "", lock: {} });
    assert.deepEqual(pageTheme(proj, "junk").page, { js: "", css: "", lock: {} });
    assert.equal(normalizeTheme({ configJs: "x".repeat(70000) }).configJs, "");
    assert.ok(!themeHead(pageTheme({}, { js: "module.exports = { content: ['</script><b>'] }" })).includes("</script><b>"));
});

import { effectiveConfig } from "../tailwind-defaults.js";
test("the effective config: defaults, replaced sections, extended sections", () => {
    const e = effectiveConfig({ darkMode: "class", theme: { screens: { tablet: "600px" }, extend: { colors: { accent: "#f97316" }, spacing: { 13: "3.25rem" } } } });
    assert.deepEqual(e.theme.screens, { tablet: "600px" }, "a section under theme replaces the default");
    assert.equal(e.theme.colors.accent, "#f97316");
    assert.ok(e.theme.colors.red["500"], "extend keeps the default colours");
    assert.equal(e.theme.spacing["13"], "3.25rem");
    assert.equal(e.theme.spacing["4"], "1rem", "and the default spacing steps");
    assert.equal(e.darkMode, "class");
    assert.equal(effectiveConfig(null).theme.screens.md, "768px");
});
