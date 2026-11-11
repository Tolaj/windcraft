import test from "node:test";
import assert from "node:assert/strict";
import { parseDocs, guessFromPackage, cdnUrl, fetchPackage } from "../plugin-import.js";

const PRELINE_DOCS = `@import "tailwindcss";

/* Preline UI */
@source "./node_modules/preline/dist/*.js";
@import "./node_modules/preline/variants.css";`;

test("the Preline 5 docs lines become a recipe: the import is kept as a link, @source is dropped", () => {
    const r = parseDocs(PRELINE_DOCS, { versionOf: () => "5.0.0" });
    assert.equal(r.engine, "4");
    assert.deepEqual(r.steps, [{ type: "css4", text: '@import "https://cdn.jsdelivr.net/npm/preline@5.0.0/variants.css";' }]);
    assert.deepEqual(r.packages, ["preline"]);
    assert.ok(r.notes.some((n) => /@source/.test(n)));
    assert.deepEqual(r.blocked, []);
});

test("@plugin and require() are blocked with a reason, not guessed", () => {
    assert.match(parseDocs('@plugin "@tailwindcss/typography";').blocked[0], /needs a build/);
    assert.match(parseDocs("plugins: [require('preline/plugin')]").blocked[0], /require/);
    assert.match(parseDocs('@import "./src/my.css";').blocked[0], /your own project/);
});

test("tags, install commands and CSS blocks", () => {
    const r = parseDocs(`npm i preline\n<script src="https://cdn.jsdelivr.net/npm/preline@5.0.0/dist/preline.js"></script>\n<link rel="stylesheet" href="https://cdn.example.com/a.css">\n@custom-variant dark (&:where(.dark, .dark *));\n@theme { --color-x: red; }`);
    assert.deepEqual(r.steps.map((s) => s.type), ["script", "stylesheet", "css4", "css4"]);
    assert.ok(r.notes.some((n) => /Install commands/.test(n)));
    assert.equal(parseDocs("<script src=\"http://x.com/a.js\"></script>").steps.length, 0);
});

test("cdnUrl", () => {
    assert.equal(cdnUrl("./node_modules/preline/variants.css", () => "5.0.0").url, "https://cdn.jsdelivr.net/npm/preline@5.0.0/variants.css");
    assert.equal(cdnUrl("@scope/pkg/x.css", () => "1.2.3").url, "https://cdn.jsdelivr.net/npm/@scope/pkg@1.2.3/x.css");
    assert.equal(cdnUrl("preline", () => "1"), null);
    assert.equal(cdnUrl("./local.css"), null);
});

test("guessing from a package: a v3 plugin file plus its browser script", () => {
    const g = guessFromPackage({ name: "preline", version: "2.7.0", files: ["/plugin.js", "/dist/preline.js", "/dist/preline.js.map", "/variants.css"], pkg: { peerDependencies: { tailwindcss: "^3.4.1" } }, mainSource: "const plugin = require('tailwindcss/plugin');" });
    assert.equal(g.engine, "3");
    assert.deepEqual(g.steps.map((s) => s.type), ["plugin3", "script"]);
    assert.match(g.steps[0].src, /preline@2\.7\.0\/plugin\.js/);
});

test("a plugin file that needs other modules is blocked; a v4 package gets its CSS", () => {
    const g = guessFromPackage({ name: "x-ui", version: "1.0.0", files: ["/plugin.js"], pkg: { peerDependencies: { tailwindcss: ">=3" } }, mainSource: "const a = require('tailwindcss/plugin'); const b = require('postcss-js');" });
    assert.deepEqual(g.steps, []);
    assert.match(g.blocked[0], /postcss-js/);
    const v4 = guessFromPackage({ name: "preline", version: "5.0.0", files: ["/variants.css", "/dist/preline.js"], pkg: { peerDependencies: { tailwindcss: "^4.0.0" } } });
    assert.equal(v4.engine, "4");
    assert.deepEqual(v4.steps.map((s) => s.type), ["css4", "script"]);
    assert.match(guessFromPackage({ name: "nothing", version: "1.0.0", files: ["/index.d.ts"], pkg: {} }).blocked[0], /without a build/);
});

test("fetchPackage asks the CDN and says so plainly when it can't find the package", async () => {
    const fake = async (url) => { if (url.includes("/resolved")) return { version: "2.0.0" }; if (url.includes("structure=flat")) return { files: [{ name: "/dist/a.min.js" }] }; return { name: "p" }; };
    const info = await fetchPackage("p", fake);
    assert.equal(info.version, "2.0.0");
    assert.deepEqual(info.files, ["/dist/a.min.js"]);
    await assert.rejects(fetchPackage("p", async () => { throw new Error("404"); }), /Couldn't find/);
    await assert.rejects(fetchPackage("bad name!", fake), /npm package name/);
});

import { judge, checkDocument } from "../../editor/design/plugin-check.js";
test("the sandbox verdict: works, notes, fails, or needs a build", () => {
    assert.equal(judge({ tw: true, errors: [] }, "3").verdict, "works");
    assert.equal(judge({ tw: false, errors: [] }, "4").verdict, "fails");
    assert.match(judge({ tw: true, errors: [{ kind: "load", url: "https://x.com/a.js" }] }, "3").messages[0], /Couldn't load https:\/\/x\.com\/a\.js/);
    assert.equal(judge({ tw: true, errors: [{ kind: "error", msg: "Uncaught Error: A Tailwind plugin loaded from a link can only need tailwindcss/plugin, not postcss-js" }] }, "3").verdict, "build");
    assert.equal(judge({ tw: true, errors: [{ kind: "error", msg: "The browser build does not support plugins or config files." }] }, "4").verdict, "build");
    assert.equal(judge({ tw: true, errors: [{ kind: "error", msg: "x is not a function" }] }, "3").verdict, "notes");
    const doc = checkDocument({ engine: "4", steps: [{ type: "stylesheet", href: "https://x.com/a.css" }] }, "chk1");
    assert.match(doc, /@tailwindcss\/browser@4/);
    assert.match(doc, /href="https:\/\/x\.com\/a\.css"/);
    assert.match(doc, /id="p" class="p-\[13px\]"/);
});

import { inlineCss, inlineImports } from "../plugin-import.js";
test("remote @imports are written into the CSS, relative paths resolved against their file", async () => {
    const files = { "https://cdn.x.com/p/variants.css": "/* top */\n@import './a/v.css';\n@import './b/v.css';\n.top{}", "https://cdn.x.com/p/a/v.css": "@custom-variant a (&:hover);", "https://cdn.x.com/p/b/v.css": "@import '../a/v.css';\n@custom-variant b (&:focus);" };
    const fake = async (u) => { if (!files[u]) throw new Error("404"); return files[u]; };
    const css = await inlineCss("https://cdn.x.com/p/variants.css", fake);
    assert.match(css, /@custom-variant a/);
    assert.match(css, /@custom-variant b/);
    assert.equal((css.match(/@custom-variant a/g) || []).length, 1, "a file imported twice is included once");
    assert.ok(!css.includes("@import") && !css.includes("/* top */"));
    const r = await inlineImports([{ type: "css4", text: '@import "https://cdn.x.com/p/variants.css";' }, { type: "script", src: "https://x.com/a.js" }, { type: "css4", text: '@import "https://cdn.x.com/missing.css";' }], fake);
    assert.equal(r.steps.length, 2);
    assert.match(r.steps[0].text, /@custom-variant a/);
    assert.match(r.failed[0], /Couldn't load https:\/\/cdn\.x\.com\/missing\.css/);
    await assert.rejects(inlineCss("https://cdn.x.com/big.css", async () => "a".repeat(40000)), /too large/);
});

test("guessing: Preline 5 (variants.css, no plugin file) is a v4 package whose script is the one named after it", () => {
    const files = ["/theme.css", "/variants.css", "/dist/accordion.js", "/dist/dropdown.js", "/dist/preline.js", "/dist/preline.js.map", "/src/index.ts"];
    const g = guessFromPackage({ name: "preline", version: "5.0.0", files, pkg: {} });
    assert.equal(g.engine, "4");
    assert.deepEqual(g.steps.map((s) => s.type), ["css4", "script"]);
    assert.match(g.steps[0].text, /variants\.css/, "variants.css, not theme.css");
    assert.match(g.steps[1].src, /dist\/preline\.js$/);
});
test("guessing: a package with both a plugin file and variants follows the project's engine", () => {
    const info = { name: "preline", version: "2.7.0", files: ["/plugin.js", "/variants.css", "/dist/preline.js"], pkg: {}, mainSource: "require('tailwindcss/plugin')" };
    assert.equal(guessFromPackage(info, { prefer: "3" }).engine, "3");
    assert.deepEqual(guessFromPackage(info, { prefer: "3" }).steps.map((s) => s.type), ["plugin3", "script"]);
    assert.equal(guessFromPackage(info, { prefer: "4" }).engine, "4");
    assert.deepEqual(guessFromPackage(info, { prefer: "4" }).steps.map((s) => s.type), ["css4", "script"]);
});
