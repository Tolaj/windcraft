import { test } from "node:test";
import assert from "node:assert/strict";
import { BEHAVIOURS, buildBehaviour, appendScript, idsIn } from "../behaviours.js";

test("every behaviour makes a script that parses, names its elements, and starts with a comment", () => {
    for (const b of BEHAVIOURS) {
        const values = Object.fromEntries(b.fields.map((f) => [f.key, `#${f.key}`]));
        const r = buildBehaviour(b.id, values);
        assert.equal(r.ok, true, b.id);
        assert.ok(r.text.startsWith(`// ${b.name}:`), b.id);
        for (const f of b.fields) assert.ok(r.text.includes(`"#${f.key}"`), `${b.id} uses ${f.key}`);
        assert.doesNotThrow(() => new Function(r.text), b.id); // a syntax check: nothing runs
    }
});

test("an empty field is reported by name, except the modal's close button", () => {
    assert.deepEqual(buildBehaviour("toggle-menu", { button: "#a", menu: "" }).missing, ["Menu"]);
    assert.equal(buildBehaviour("modal", { open: "#o", modal: "#m", close: "" }).ok, true);
    assert.deepEqual(buildBehaviour("tabs", {}).missing, ["Tab buttons", "Panels"]);
});

test("a selector with quotes or line breaks is only ever text, never code", () => {
    const evil = '#a"); alert(1); ("\nalert(2)//';
    const r = buildBehaviour("toggle-menu", { button: evil, menu: "#m" });
    const asked = [];
    let alerted = 0;
    const doc = { querySelector: (s) => { asked.push(s); return null; }, addEventListener() {} };
    new Function("document", "alert", r.text)(doc, () => { alerted++; });
    assert.deepEqual(asked, [evil, "#m"], "the selector reaches querySelector exactly as typed");
    assert.equal(alerted, 0);
});

test("a script is added after the existing ones, and ids are found in markup", () => {
    assert.equal(appendScript("a();", "b();"), "a();\n\nb();");
    assert.equal(appendScript("", "b();"), "b();");
    assert.deepEqual(idsIn('<div id="menu"><a id=\'x\' class="y"></a><i id="menu"></i></div>'), ["menu", "x"]);
});
