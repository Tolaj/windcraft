import test from "node:test";
import assert from "node:assert/strict";
import { PLUGINS, cleanPlugins, cleanCustom, customError, tailwindTag, pluginHead, isStylesheet } from "../plugins.js";
import { normalizeTheme, themeHead } from "../theme.js";

test("only known plugins are kept, once each, in catalogue order", () => {
    assert.deepEqual(cleanPlugins(["typography", "nope", "forms", "forms"]), ["forms", "typography"]);
    assert.deepEqual(cleanPlugins("forms"), []);
    assert.deepEqual(cleanPlugins(undefined), []);
    assert.ok(!PLUGINS.some((p) => p.id === "aspect-ratio"), "the old aspect-ratio plugin breaks Tailwind's own aspect-*");
});

test("custom links: https only, plain, at most five", () => {
    assert.deepEqual(cleanCustom(["https://cdn.example.com/a.js", "http://x.com/a.js", 'https://x.com/"onload=1', "https://cdn.example.com/a.js", "javascript:alert(1)"]), ["https://cdn.example.com/a.js"]);
    assert.equal(cleanCustom(Array.from({ length: 9 }, (_, i) => `https://x.com/${i}.js`)).length, 5);
    assert.match(customError("http://x.com/a.js"), /https/);
    assert.match(customError(""), /Paste/);
    assert.match(customError("https://x.com/a.js", ["https://x.com/a.js"]), /already/);
    assert.equal(customError("https://x.com/a.css"), "");
    assert.ok(isStylesheet("https://x.com/a.css?v=1") && !isStylesheet("https://x.com/a.js"));
});

test("the Tailwind tag carries the official plugins; the others add files after the config", () => {
    assert.equal(tailwindTag({}), '<script src="https://cdn.tailwindcss.com"><\/script>');
    assert.match(tailwindTag({ plugins: ["typography", "preline", "forms"] }), /\?plugins=forms,typography"/);
    const t = normalizeTheme({ plugins: ["forms", "preline", "daisyui"], customPlugins: ["https://x.com/a.css", "https://x.com/b.js"] });
    const head = pluginHead(t);
    assert.match(head, /preline@2\.7\.0\/plugin\.js/);
    assert.match(head, /tailwind\.config\.plugins=window\.__wcP/);
    assert.match(head, /daisyui@4\.12\.14\/dist\/full\.min\.css/);
    assert.match(head, /<link rel="stylesheet" href="https:\/\/x\.com\/a\.css">/);
    assert.match(head, /<script src="https:\/\/x\.com\/b\.js">/);
    assert.ok(!head.includes("forms"), "official plugins are not loaded again");
    assert.equal(pluginHead({}), "");
    assert.ok(themeHead(t).indexOf("tailwind.config =") < themeHead(t).indexOf("plugin.js"), "the config is set before the plugins read it");
});
