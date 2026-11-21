import { test } from "node:test";
import assert from "node:assert/strict";
import { cssText, jsText, ownJsText, withCss, withJs, withoutOwn, withOwnFrom, isOwnScript, isManagedScript, REGION_START, REGION_END } from "../code-parts.js";

const page = () => ({
    markup: "<p>hi</p>", links: [], bodyAttrs: {},
    styles: [{ type: "", text: "p{color:red}" }, { type: "text/tailwindcss", text: "@theme{}" }, { type: "", text: "a{color:blue}" }],
    scripts: [{ src: "https://cdn.tailwindcss.com", type: "", defer: false, text: "" }, { src: "", type: "", defer: false, text: "tailwind.config = {}" }, { src: "", type: "", defer: false, text: "console.log(1)" }, { src: "", type: "application/json", defer: false, text: "{}" }],
});

test("the CSS and JS tabs hold only what the page wrote itself", () => {
    assert.equal(cssText(page()), "p{color:red}\n\na{color:blue}");
    assert.equal(jsText(page()), "console.log(1)");
    assert.equal(isOwnScript({ src: "", type: "module", text: "import x" }), true);
    assert.equal(isOwnScript({ src: "", type: "", text: "/*wc-motion*/(function(){})()" }), false, "the editor's own scripts are not the page's JS");
    const rest = withoutOwn(page());
    assert.deepEqual(rest.styles.map((s) => s.type), ["text/tailwindcss"]);
    assert.equal(rest.scripts.length, 3);
});

test("editing a tab replaces its blocks and leaves the others alone", () => {
    const p = withCss(page(), "b{color:green}");
    assert.equal(cssText(p), "b{color:green}");
    assert.equal(p.styles.length, 2);
    assert.equal(p.styles[1].type, "text/tailwindcss");
    assert.equal(withCss(page(), "  ").styles.length, 1); // empty: no block left
    const q = withJs(page(), "alert(2)");
    assert.equal(jsText(q), "alert(2)");
    assert.equal(q.scripts.length, 4);
    assert.equal(withJs({ ...page(), scripts: [] }, "x()").scripts.length, 1); // none before: one added
});

test("the HTML tab's edit gets the page's own CSS and JS back", () => {
    const edited = withoutOwn(page());
    const back = withOwnFrom(edited, page());
    assert.equal(cssText(back), cssText(page()));
    assert.equal(jsText(back), jsText(page()));
    assert.equal(back.scripts.length, 4);
});

test("the JS tab shows all the page's JavaScript: its own code, then the editor's region", () => {
    const managed = { src: "", type: "", defer: false, text: "/*wc-motion*/(function(){ run(); })();" };
    const p = { ...page(), scripts: [...page().scripts, managed] };
    assert.equal(isManagedScript(managed), true);
    assert.equal(isManagedScript({ src: "", type: "", text: "console.log(1)" }), false);
    assert.equal(ownJsText(p), "console.log(1)");
    const text = jsText(p);
    assert.ok(text.startsWith("console.log(1)\n\n" + REGION_START), "the page's own code comes first");
    assert.ok(text.includes("/*wc-motion*/(function(){ run(); })();") && text.endsWith(REGION_END), "then the editor's scripts, inside the markers");
    assert.equal(jsText(page()), "console.log(1)", "no region on a page without any");
    // a page with a 3D model gets its runtime there, though the model script is not among its scripts
    const withModel = jsText({ ...page(), markup: '<wc-model src="a.glb"></wc-model>' });
    assert.ok(withModel.includes("/*wc-model*/") && withModel.includes(REGION_START));
    assert.equal(jsText({ ...page(), markup: "<p>hi</p>" }).includes("/*wc-model*/"), false);
});

test("editing the JS tab changes the page's own code and never the editor's region", () => {
    const managed = { src: "", type: "", defer: false, text: "/*wc-motion*/(function(){ run(); })();" };
    const p = { ...page(), scripts: [...page().scripts, managed] };
    // the whole text, edited above the region
    const edited = jsText(p).replace("console.log(1)", "console.log(2); mine();");
    const q = withJs(p, edited);
    assert.equal(ownJsText(q), "console.log(2); mine();");
    assert.equal(q.scripts.filter(isManagedScript).length, 1, "the editor's script is kept");
    // changes inside the region are dropped: the editor's version stands
    const tampered = jsText(p).replace("run();", "evil();");
    assert.equal(withJs(p, tampered).scripts.find(isManagedScript).text.includes("evil"), false);
    assert.equal(ownJsText(withJs(p, tampered)), "console.log(1)");
    // the region deleted: nothing is lost
    assert.equal(withJs(p, "console.log(1)").scripts.filter(isManagedScript).length, 1);
    // typed from nothing
    assert.equal(ownJsText(withJs({ ...page(), scripts: [] }, "x()")), "x()");
});

test("the HTML tab leaves the editor's scripts out, and gets them back with the page", () => {
    const managed = { src: "", type: "", defer: false, text: "/*wc-motion*/(function(){})();" };
    const p = { ...page(), scripts: [...page().scripts, managed] };
    assert.equal(withoutOwn(p).scripts.some(isManagedScript), false);
    assert.equal(withoutOwn(p, true).scripts.some(isManagedScript), true);
    assert.equal(withOwnFrom(withoutOwn(p), p).scripts.filter(isManagedScript).length, 1);
});
