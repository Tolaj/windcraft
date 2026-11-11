import test from "node:test";
import assert from "node:assert/strict";
import { judge, checkDocument } from "../../editor/design/config-check.js";

test("the sandbox verdict: works, notes, fails, or needs a build", () => {
    assert.equal(judge({ tw: true, errors: [] }, "3").verdict, "works");
    assert.equal(judge({ tw: false, errors: [] }, "4").verdict, "fails");
    assert.match(judge({ tw: true, errors: [{ kind: "load", url: "https://x.com/a.js" }] }, "3").messages[0], /Couldn't load https:\/\/x\.com\/a\.js/);
    assert.equal(judge({ tw: true, errors: [{ kind: "error", msg: "Uncaught Error: The config needs postcss-js, which a page can't load without a build." }] }, "3").verdict, "build");
    assert.equal(judge({ tw: true, errors: [{ kind: "error", msg: "The browser build does not support plugins or config files." }] }, "4").verdict, "build");
    assert.match(judge({ tw: false, errors: [{ kind: "error", msg: "tailwind.config.js: x is not defined" }] }, "3").messages[0], /The config threw: x is not defined/);
    assert.equal(judge({ tw: true, errors: [{ kind: "error", msg: "something odd" }] }, "3").verdict, "notes");
    const doc = checkDocument({ engine: "4", configCss: '@import "tailwindcss";\n@theme { --color-x: red; }' }, "chk1");
    assert.match(doc, /@tailwindcss\/browser@4/);
    assert.match(doc, /--color-x: red;/);
    assert.match(doc, /id="p" class="p-\[13px\]"/);
    assert.match(checkDocument({ configJs: "module.exports = { plugins: [require('@tailwindcss/forms')] }" }, "c"), /\?plugins=forms"/);
});
