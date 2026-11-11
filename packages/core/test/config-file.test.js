import test from "node:test";
import assert from "node:assert/strict";
import { toCommonJs, requiresOf, officialsOf, kindOf, tailwindTag, configHead3, css4Of, directivesOf, cleanLock, cleanFile, TEMPLATES, TAILWIND4_SRC } from "../config-file.js";
import { resolveFile, splitSpec, inlineCss } from "../config-resolve.js";

const TS = `import typography from "@tailwindcss/typography"
import plugin from "tailwindcss/plugin";
import type { Config } from "tailwindcss"
const config: Config = {
  // require("commented/out")
  plugins: [typography, require("preline/plugin")],
} satisfies Config
export default config`;

test("an ES module / TypeScript config becomes CommonJS, line for line", () => {
    const out = toCommonJs(TS);
    assert.equal(out.split("\n").length, TS.split("\n").length);
    assert.match(out, /const typography = require\("@tailwindcss\/typography"\);/);
    assert.match(out, /module\.exports = config/);
    assert.ok(!/satisfies|: Config|import /.test(out));
});

test("requires are found with their lines, comments ignored; kinds; official plugins go to the CDN tag", () => {
    assert.deepEqual(requiresOf(TS).map((r) => [r.spec, r.line]), [["@tailwindcss/typography", 1], ["tailwindcss/plugin", 2], ["preline/plugin", 6]]);
    assert.deepEqual(officialsOf(TS), ["typography"]);
    assert.deepEqual(["@tailwindcss/forms", "tailwindcss/colors", "./x", "preline/plugin"].map(kindOf), ["official", "builtin", "relative", "package"]);
    assert.equal(tailwindTag({}), '<script src="https://cdn.tailwindcss.com"><\/script>');
    assert.match(tailwindTag({ configJs: `module.exports={plugins:[require('@tailwindcss/forms'),require("@tailwindcss/typography")]}` }), /\?plugins=forms,typography"/);
    assert.equal(tailwindTag({ engine: "4" }), `<script src="${TAILWIND4_SRC}"><\/script>`);
});

test("the v3 head runs the file as written over the theme's own settings, after the lock's packages", () => {
    const head = configHead3({ configJs: `module.exports = { plugins: [require("preline/plugin")] }`, lock: { "preline/plugin": { url: "https://cdn.jsdelivr.net/npm/preline@2.7.0/plugin.js" } } }, { theme: { extend: { colors: { brand: {} } } } });
    assert.ok(head.indexOf("preline@2.7.0/plugin.js") < head.indexOf("tailwind.config=__wcMerge"), "the plugin file loads before the config runs");
    assert.match(head, /__wcMods\["preline\/plugin"\]=module\.exports/);
    assert.match(head, /"brand":\{\}/);
    assert.ok(!/<\/script><b>/.test(configHead3({ configJs: `module.exports = { content: ["</script><b>"] }` }, {})), "a script end in the file cannot break out");
    assert.ok(!configHead3({}, {}).includes("__wcDefaults=") , "Tailwind's defaults are only embedded when the file asks for colors or defaultTheme");
    assert.match(configHead3({ configJs: `const colors = require("tailwindcss/colors"); module.exports = {}` }, {}), /__wcDefaults=/);
});

test("the v4 file: tailwindcss import, @source and @plugin dropped; other imports written in from the lock", () => {
    const css = css4Of(`@import "tailwindcss";\n@source "./x/*.js";\n@plugin "foo";\n@import "./node_modules/preline/variants.css";\n@import "./missing.css";\n@theme { --a: 1; }`, { "./node_modules/preline/variants.css": { css: "@custom-variant hs (&:hover);" } });
    assert.ok(!/@import "tailwindcss"|@source|@plugin/.test(css));
    assert.match(css, /@custom-variant hs/);
    assert.match(css, /not loaded: \.\/missing\.css/);
    assert.match(css, /@theme \{ --a: 1; \}/);
    assert.deepEqual(directivesOf(`@import "tailwindcss";\n@plugin "foo";\n@source "x";`).map((d) => d.kind), ["import", "plugin", "source"]);
});

test("lock and file are cleaned", () => {
    assert.deepEqual(cleanLock({ "a/b": { url: "https://x.com/a.js" }, "c": { url: "http://x.com/a.js" }, "d": { css: "</style>" }, "e": { css: "a{}" }, "bad key!": { url: "https://x.com/a.js" } }), { "a/b": { url: "https://x.com/a.js" }, e: { css: "a{}" } });
    assert.equal(cleanFile("x".repeat(70000)), "");
    assert.match(TEMPLATES["3"].text, /module\.exports/);
});

const FILES = {
    "https://data.jsdelivr.com/v1/packages/npm/preline/resolved": { version: "5.0.0" },
    "https://data.jsdelivr.com/v1/packages/npm/preline": { versions: [{ version: "5.0.0" }, { version: "4.1.3" }, { version: "2.7.0" }, { version: "2.6.0" }, { version: "1.9.0" }] },
    "https://data.jsdelivr.com/v1/packages/npm/preline@5.0.0?structure=flat": { files: [{ name: "/variants.css" }] },
    "https://cdn.jsdelivr.net/npm/preline@5.0.0/package.json": { main: "index.js" },
    "https://data.jsdelivr.com/v1/packages/npm/preline@4.1.3?structure=flat": { files: [{ name: "/variants.css" }] },
    "https://cdn.jsdelivr.net/npm/preline@4.1.3/package.json": { main: "index.js" },
    "https://data.jsdelivr.com/v1/packages/npm/preline@2.7.0?structure=flat": { files: [{ name: "/plugin.js" }, { name: "/package.json" }] },
    "https://cdn.jsdelivr.net/npm/preline@2.7.0/package.json": { main: "index.js" },
    "https://cdn.jsdelivr.net/npm/preline@2.7.0/plugin.js": "const plugin = require('tailwindcss/plugin'); module.exports = plugin(function(){});",
    "https://data.jsdelivr.com/v1/packages/npm/heavy/resolved": { version: "1.0.0" },
    "https://data.jsdelivr.com/v1/packages/npm/heavy@1.0.0?structure=flat": { files: [{ name: "/index.js" }] },
    "https://cdn.jsdelivr.net/npm/heavy@1.0.0/package.json": { main: "index.js" },
    "https://cdn.jsdelivr.net/npm/heavy@1.0.0/index.js": "const p = require('tailwindcss/plugin'); const x = require('postcss-js'); module.exports = p(()=>{});",
};
const fake = async (url, kind) => { if (!(url in FILES)) throw new Error("404"); return FILES[url]; };

test("v3 file: official and built in lines are ok, a CommonJS plugin is locked, one that needs other packages is an error with the line", async () => {
    const text = `const colors = require("tailwindcss/colors");\nmodule.exports = { plugins: [\n  require("@tailwindcss/typography"),\n  require("preline/plugin"),\n  require("heavy"),\n  require("./mine"),\n  require("nothing-here"),\n] }`;
    const r = await resolveFile({ engine: "3", text }, fake);
    assert.deepEqual(Object.keys(r.lock), ["preline/plugin"]);
    assert.equal(r.lock["preline/plugin"].url, "https://cdn.jsdelivr.net/npm/preline@2.7.0/plugin.js");
    const by = Object.fromEntries(r.diagnostics.map((d) => [d.line, d]));
    assert.equal(by[1].level, "ok");
    assert.equal(by[3].level, "ok");
    assert.equal(by[4].level, "ok");
    assert.match(by[4].message, /preline@2\.7\.0\/plugin\.js \(5\.0\.0 \(the newest\) doesn't have it, so 2\.7\.0 is used\)/, "the newest version has no plugin file, so an older major is used and says so");
    assert.match(by[5].message, /Needs a build: heavy also requires postcss-js/);
    assert.equal(by[5].level, "error");
    assert.match(by[6].message, /your own project/);
    assert.match(by[7].message, /Couldn't find "nothing-here"/);
});

test("v4 file: @plugin needs a build, @source is skipped, an @import is written in", async () => {
    const files = { "https://data.jsdelivr.com/v1/packages/npm/preline/resolved": { version: "5.0.0" }, "https://cdn.jsdelivr.net/npm/preline@5.0.0/variants.css": "@import './a.css';\n.x{}", "https://cdn.jsdelivr.net/npm/preline@5.0.0/a.css": "@custom-variant a (&:hover);" };
    const f = async (u) => { if (!(u in files)) throw new Error("404"); return files[u]; };
    const r = await resolveFile({ engine: "4", text: `@import "tailwindcss";\n@source "./x";\n@plugin "@tailwindcss/typography";\n@import "./node_modules/preline/variants.css";\n@import "./src/mine.css";` }, f);
    assert.match(r.lock["./node_modules/preline/variants.css"].css, /@custom-variant a/);
    const by = Object.fromEntries(r.diagnostics.map((d) => [d.line, d]));
    assert.equal(by[1].level, "ok");
    assert.match(by[2].message, /skipped/);
    assert.match(by[3].message, /needs a build/);
    assert.equal(by[3].level, "error");
    assert.equal(by[4].level, "ok");
    assert.match(by[5].message, /your own project/);
});

test("spec splitting and css inlining", async () => {
    assert.deepEqual(splitSpec("@scope/pkg/sub/x.css"), { pkg: "@scope/pkg", sub: "sub/x.css" });
    assert.deepEqual(splitSpec("./node_modules/preline/variants.css"), { pkg: "preline", sub: "variants.css" });
    await assert.rejects(inlineCss("https://x.com/big.css", async () => "a".repeat(40000)), /too large/);
});
