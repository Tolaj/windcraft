import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_ATTRS, MODEL_MARK, MODEL_SCRIPT, THREE_VERSION, usesModel, hasModelScript, withModelScript, parseRotation, numberAttr, boolAttr, modelMarkup, isModelFile } from "../model3d.js";
import { exportComponent } from "../exporters.js";

test("a design uses a model when it has the element", () => {
    assert.equal(usesModel('<div><wc-model src="a.glb"></wc-model></div>'), true);
    assert.equal(usesModel("<WC-MODEL></WC-MODEL>"), true);
    assert.equal(usesModel("<div>wc-model</div><wc-modelx></wc-modelx>"), false);
    assert.equal(usesModel(""), false);
});

test("the script is added once, replaced by the current one, and dropped when no model is left", () => {
    const old = { src: "", type: "", defer: false, text: `${MODEL_MARK}old()` };
    const mine = { src: "", type: "", defer: false, text: "go()" };
    const withIt = withModelScript([mine], "<wc-model></wc-model>");
    assert.equal(withIt.length, 2);
    assert.ok(hasModelScript(withIt));
    assert.equal(withModelScript([old, ...withIt.slice(1)], "<wc-model></wc-model>").filter((s) => s.text.includes(MODEL_MARK)).length, 1);
    assert.deepEqual(withModelScript([old, mine], "<p>no model</p>"), [mine]);
    assert.equal(hasModelScript([{ src: "x.js", text: MODEL_MARK }]), false, "a script with a src is not ours");
});

test("the script is plain JavaScript that names its Three.js version and defines the element", () => {
    new Function(MODEL_SCRIPT); // it parses
    assert.ok(MODEL_SCRIPT.startsWith(MODEL_MARK));
    assert.ok(MODEL_SCRIPT.includes(`three@`) && MODEL_SCRIPT.includes(THREE_VERSION) && !MODEL_SCRIPT.includes("__THREE"));
    assert.ok(MODEL_SCRIPT.includes('customElements.define("wc-model"'));
    for (const a of MODEL_ATTRS) assert.ok(MODEL_SCRIPT.includes(`"${a.name}"`), `${a.name} is read by the element`);
    assert.ok(!/<\/script/i.test(MODEL_SCRIPT), "safe inside a script tag");
});

test("rotation, numbers and flags are read leniently", () => {
    assert.deepEqual(parseRotation("0 45 0"), [0, 45, 0]);
    assert.deepEqual(parseRotation("30"), [0, 30, 0]);
    assert.deepEqual(parseRotation("10, 20, 30"), [10, 20, 30]);
    assert.deepEqual(parseRotation("a b"), [0, 0, 0]);
    assert.deepEqual(parseRotation(null), [0, 0, 0]);
    assert.equal(numberAttr("fov", "999"), 90);
    assert.equal(numberAttr("fov", "x"), 40);
    assert.equal(numberAttr("fov", null), 40);
    assert.equal(numberAttr("rotate-speed", "-20"), -20);
    assert.equal(boolAttr(""), true);
    assert.equal(boolAttr("false"), false);
    assert.equal(boolAttr(null), false);
});

test("a model tag lists only what differs from the defaults", () => {
    assert.equal(modelMarkup({ src: "a.glb", controls: true, fov: 40, "camera-angle": 25 }, "h-64"), '<wc-model class="h-64" src="a.glb" controls camera-angle="25"></wc-model>');
    assert.equal(modelMarkup({ src: 'x".glb' }, ""), '<wc-model src="x&quot;.glb"></wc-model>');
});

test("model files are told by name or type", () => {
    assert.ok(isModelFile("Fox.GLB", "") && isModelFile("a.gltf") && isModelFile("x", "model/gltf-binary"));
    assert.ok(!isModelFile("a.png", "image/png"));
});

test("exports carry the script, and React keeps class on the custom element", () => {
    const code = '<wc-model class="h-64 w-full" src="a.glb" controls></wc-model>';
    assert.ok(exportComponent(code, "standalone").includes(MODEL_MARK));
    assert.ok(exportComponent(code, "html").includes(MODEL_MARK));
    const react = exportComponent(code, "react");
    assert.ok(react.includes('<wc-model class="h-64 w-full" src="a.glb" controls>'), react);
    assert.ok(react.includes("useEffect") && react.includes(MODEL_MARK));
    assert.ok(exportComponent("<p>hi</p>", "html") === "<p>hi</p>", "no model, no script");
    assert.equal((exportComponent(`${code}<script>${MODEL_SCRIPT}</script>`, "html").match(/wc-model\*\//g) || []).length, 1, "never twice");
});
