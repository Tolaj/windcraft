import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_ATTRS, MODEL_MARK, MODEL_SCRIPT, THREE_VERSION, usesModel, hasModelScript, withModelScript, parseRotation, numberAttr, boolAttr, modelMarkup, isModelFile, hotspotMarkup, nextHotspot, SAMPLE_MODEL, SAMPLE_MODELS, sampleUrl, sampleThumb, sourceUrl, SAMPLE_KINDS, needsCredit, ACT_ATTR, ACT_KINDS, parseAct, writeAct, PLACE_ATTR, PLACES, placeClasses, FX_ATTR, EFFECTS, parseFx, writeFx, VIEW_ATTR, WORDS_ATTR, VIEW_KEYS, WORDS, parseView, poseWords, stepMarkup, storyMarkup, storyClasses } from "../model3d.js";
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

test("hotspots are plain buttons pinned by data-position, numbered one after another", () => {
    const h = hotspotMarkup(2, "0.5 0 0", 'Say "hi"');
    assert.ok(h.includes('slot="hotspot-2"') && h.includes('data-position="0.5 0 0"') && h.includes("&quot;hi&quot;"));
    assert.equal(nextHotspot(""), 1);
    assert.equal(nextHotspot(`<wc-model>${hotspotMarkup(1)}${hotspotMarkup(4)}</wc-model>`), 5);
    for (const a of ["scroll-rotate", "shadow", "clip"]) assert.ok(MODEL_ATTRS.some((m) => m.name === a));
});

test("the sample list: each model has a file, a picture, a licence and a credit", () => {
    assert.ok(SAMPLE_MODELS.length >= 20);
    const kinds = new Set(SAMPLE_KINDS.map(([k]) => k));
    assert.ok(SAMPLE_MODELS.every((m) => kinds.has(m.kind)), "every model is in a kind the dialog lists");
    assert.ok(SAMPLE_KINDS.every(([k]) => SAMPLE_MODELS.some((m) => m.kind === k)), "and every kind has models");
    assert.equal(new Set(SAMPLE_MODELS.map((m) => m.id)).size, SAMPLE_MODELS.length);
    for (const m of SAMPLE_MODELS) {
        assert.match(sampleUrl(m), /^https:\/\/cdn\.jsdelivr\.net\/gh\/KhronosGroup\/glTF-Sample-Assets@main\/Models\/\w+\/glTF-Binary\/\w+\.glb$/);
        assert.match(sampleThumb(m), /screenshot\.(jpg|png|gif)$/);
        assert.ok(m.name && m.license && m.credit && m.kb > 0, m.id);
        assert.ok(isModelFile(sampleUrl(m), ""), m.id);
        assert.equal(sourceUrl(m), `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${m.id}`);
    }
    assert.equal(sampleUrl(SAMPLE_MODELS.find((m) => m.id === "Fox")), SAMPLE_MODEL, "the Add menu's sample is in the list");
    assert.equal(needsCredit({ license: "CC BY 4.0" }), true);
    assert.equal(needsCredit({ license: "CC0" }), false);
});

test("a click action is read and written as plain text", () => {
    assert.deepEqual(parseAct("color #e11d48 | view rotation:0 90 0; model-size:420 | bogus x | clip"), [{ kind: "color", value: "#e11d48" }, { kind: "view", value: "rotation:0 90 0; model-size:420" }]);
    assert.equal(writeAct([{ kind: "color", value: "#fff" }, { kind: "clip", value: "" }, { kind: "model", value: "a.glb" }]), "color #fff | model a.glb");
    assert.deepEqual(parseAct(writeAct(parseAct("clip Run"))), [{ kind: "clip", value: "Run" }]);
    assert.equal(ACT_ATTR, "data-wc-act");
    assert.ok(MODEL_SCRIPT.includes("data-wc-act") && MODEL_SCRIPT.includes("_paint"));
});

test("effects are names and amounts", () => {
    assert.deepEqual(parseFx("spin-scroll:1 tilt-mouse:99 float bogus:3 turntable:20 zoom-scroll:x"), { "spin-scroll": 1, "tilt-mouse": 45, float: 6 });
    assert.equal(writeFx({ float: 6, "spin-scroll": -0.5, turntable: 30 }), "spin-scroll:-0.5 float:6");
    assert.equal(writeFx({}), "");
    assert.ok(EFFECTS.every((e) => e.def >= e.min && e.def <= e.max && e.label && e.kind));
    assert.ok(MODEL_SCRIPT.includes("data-wc-fx") && MODEL_SCRIPT.includes("data-wc-place"));
});

test("a placement swaps the model's layout classes and keeps the rest", () => {
    const bg = placeClasses("block h-[520px] w-[560px] ml-[600px] mt-10 rounded-lg bg-neutral-100 md:h-96", "background");
    assert.equal(bg, "absolute inset-x-0 top-0 -z-10 block h-screen max-h-full w-full rounded-lg bg-neutral-100");
    assert.equal(placeClasses(bg, ""), "block h-80 w-full rounded-lg bg-neutral-100");
    assert.equal(placeClasses("absolute left-[285px] top-[1259px] -mt-[1205px] h-[2230px] w-[583px]", "across"), "absolute inset-x-0 top-0 -z-10 block h-screen max-h-full w-full");
    assert.deepEqual(PLACES.map((p) => p[0]), ["", "background", "across"]);
    assert.equal(PLACE_ATTR, "data-wc-place");
    assert.equal(FX_ATTR, "data-wc-fx");
});

test("a page needs the model script only when it has a model", () => {
    assert.ok(usesModel('<wc-model src="a.glb"></wc-model>'));
    assert.ok(!usesModel('<div data-wc-scene=""><section data-wc-step=""></section><h2 data-wc-at="1: y=20"></h2></div>'));
    for (const gone of ["data-wc-scroll", "data-wc-at", "sceneTick", "_stops"]) assert.ok(!MODEL_SCRIPT.includes(gone), gone);
});

test("a story step's pose is plain text, and reads as a few words", () => {
    assert.deepEqual(parseView("rotation:0 90 0; model-size:420; junk:1; camera-angle:"), { rotation: "0 90 0", "model-size": "420" });
    assert.equal(poseWords("rotation:0 -25 0; camera-angle:10"), "front");
    assert.equal(poseWords("rotation:0 70 0; camera-angle:25; camera-distance:0.75"), "side, closer");
    assert.equal(poseWords("rotation:0 200 0; camera-angle:40; camera-distance:1.3"), "back, farther, from above");
    assert.equal(poseWords("rotation:270"), "other side");
    assert.equal(poseWords("model-position:0.5 0 0"), "front, moved");
    assert.deepEqual(VIEW_KEYS, ["rotation", "model-position", "model-size", "camera-angle", "camera-distance"]);
    assert.deepEqual(WORDS.map((w) => w[0]), ["", "dim", "fade"]);
});

test("the Scroll story block: a pinned model and three steps that dim", () => {
    const html = storyMarkup();
    assert.ok(usesModel(html) && html.includes("sticky"));
    assert.equal((html.match(new RegExp(VIEW_ATTR + '="', "g")) || []).length, 3);
    assert.equal((html.match(new RegExp(WORDS_ATTR + '="dim"', "g")) || []).length, 3);
    const step = stepMarkup("New <section>", "Words", "rotation:0 10 0", "");
    assert.ok(step.includes('data-wc-view="rotation:0 10 0"') && !step.includes(WORDS_ATTR) && step.includes("New &lt;section>"));
    assert.ok(MODEL_SCRIPT.includes("data-wc-view") && MODEL_SCRIPT.includes("data-wc-words") && MODEL_SCRIPT.includes("_showU"));
});

test("a model made the pinned model of a story keeps its look, not its old layout", () => {
    assert.equal(storyClasses("absolute left-[285px] top-[1259px] -mt-[1205px] h-[2230px] w-[583px] rounded-lg bg-neutral-100"), "absolute right-0 top-0 -z-10 block h-screen max-h-full w-full md:w-1/2 rounded-lg bg-neutral-100");
    assert.equal(storyClasses(""), "absolute right-0 top-0 -z-10 block h-screen max-h-full w-full md:w-1/2");
});
