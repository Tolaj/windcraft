import { test } from "node:test";
import assert from "node:assert/strict";
import { cssText, jsText, withCss, withJs, withoutOwn, withOwnFrom, isOwnScript } from "../code-parts.js";

const page = () => ({
    markup: "<p>hi</p>", links: [], bodyAttrs: {},
    styles: [{ type: "", text: "p{color:red}" }, { type: "text/tailwindcss", text: "@theme{}" }, { type: "", text: "a{color:blue}" }],
    scripts: [{ src: "https://cdn.tailwindcss.com", type: "", defer: false, text: "" }, { src: "", type: "", defer: false, text: "tailwind.config = {}" }, { src: "", type: "", defer: false, text: "console.log(1)" }, { src: "", type: "application/json", defer: false, text: "{}" }],
});

test("the CSS and JS tabs hold only what the page wrote itself", () => {
    assert.equal(cssText(page()), "p{color:red}\n\na{color:blue}");
    assert.equal(jsText(page()), "console.log(1)");
    assert.equal(isOwnScript({ src: "", type: "module", text: "import x" }), true);
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
