// 3D models in a design. A model is one plain element, <wc-model src="…glb">, sized and placed with Tailwind classes like any other box.
// Everything else it can do is an attribute on it (MODEL_ATTRS), so the HTML stays readable and editable by hand.
//
// What draws it is a small script, MODEL_SCRIPT, which the editor saves inside the page once (like the animation script): it defines the
// <wc-model> element and loads Three.js from a CDN the first time one appears. No build step, no server, and the exported page still works
// as a file. Pure functions plus that script; nothing here touches the DOM.

export const MODEL_TAG = "wc-model";
export const MODEL_MARK = "/*wc-model*/";
export const THREE_VERSION = "0.170.0";
export const THREE_CDN = "https://cdn.jsdelivr.net/npm/";
/** A free model to start from: the Fox of the Khronos sample assets (CC0 model), a few hundred KB with three animations. */
export const SAMPLE_MODEL = "https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Fox/glTF-Binary/Fox.glb";

/** The kinds of sample model, in the order the dialog's chips list them. */
export const SAMPLE_KINDS = Object.freeze([["products", "Products"], ["furniture", "Furniture"], ["lighting", "Lighting"], ["home", "Home and food"], ["vehicles", "Vehicles"], ["art", "Art and characters"]]);
/**
 * Free models the editor offers, for the kinds of page people build: a shop (a shoe, a watch, a speaker), a furniture or lighting store,
 * a landing page hero. They are the Khronos glTF sample assets, served by jsDelivr; each one's page there (sourceUrl) says who made it and
 * under what licence. `license`: what the author gave (CC BY needs a credit line on the page); `kb`: the file's size; `credit`: who made it.
 */
export const SAMPLE_MODELS = Object.freeze([
    { id: "MaterialsVariantsShoe", name: "Sneaker", kind: "products", about: "A trainer, good for a shop's product page", license: "CC BY 4.0", credit: "Shopify", kb: 7834, shot: "jpg" },
    { id: "ChronographWatch", name: "Chronograph watch", kind: "products", about: "A wristwatch with dials", license: "CC BY 4.0", credit: "Eric Chadwick, Darmstadt Graphics Group", kb: 7446, shot: "jpg" },
    { id: "WaterBottle", name: "Water bottle", kind: "products", about: "A reusable bottle", license: "CC0", credit: "Microsoft", kb: 8967, shot: "jpg" },
    { id: "BoomBox", name: "Boom box", kind: "products", about: "A retro stereo speaker", license: "CC0", credit: "Microsoft", kb: 10614, shot: "jpg" },
    { id: "ChairDamaskPurplegold", name: "Damask chair", kind: "furniture", about: "A chair in purple and gold damask", license: "CC BY 4.0", credit: "Eric Chadwick, Wayfair", kb: 2029, shot: "jpg" },
    { id: "GlamVelvetSofa", name: "Velvet sofa", kind: "furniture", about: "A velvet sofa", license: "CC BY 4.0", credit: "Eric Chadwick, Wayfair", kb: 3150, shot: "jpg" },
    { id: "SheenChair", name: "Sheen chair", kind: "furniture", about: "An armchair that shows off fabric sheen", license: "CC0", credit: "Eric Chadwick, Wayfair", kb: 4126, shot: "jpg" },
    { id: "IridescenceLamp", name: "Iridescent lamp", kind: "lighting", about: "A table lamp with an iridescent shade", license: "CC BY 4.0", credit: "Eric Chadwick, Wayfair", kb: 4084, shot: "jpg" },
    { id: "LightsPunctualLamp", name: "Desk lamp", kind: "lighting", about: "A lamp that lights its own scene", license: "CC BY 4.0", credit: "Darmstadt Graphics Group", kb: 4341, shot: "png" },
    { id: "AnisotropyBarnLamp", name: "Barn lamp", kind: "lighting", about: "A brushed-metal barn light", license: "CC BY 4.0", credit: "Eric Chadwick, Wayfair", kb: 7833, shot: "jpg", rawShot: true },
    { id: "Lantern", name: "Lantern", kind: "lighting", about: "A street lantern", license: "CC0", credit: "sbtron, Frank Galligan", kb: 9564, shot: "jpg" },
    { id: "GlassVaseFlowers", name: "Vase of flowers", kind: "home", about: "A glass vase with flowers", license: "CC0", credit: "Eric Chadwick, Rico Cilliers", kb: 1820, shot: "jpg" },
    { id: "DiffuseTransmissionTeacup", name: "Teacup", kind: "home", about: "A porcelain teacup", license: "CC0", credit: "Polyhaven, Eric Chadwick", kb: 4795, shot: "jpg" },
    { id: "IridescentDishWithOlives", name: "Olive dish", kind: "home", about: "An iridescent dish with olives", license: "CC BY 4.0", credit: "Eric Chadwick, Wayfair", kb: 5743, shot: "jpg" },
    { id: "ScatterPlant", name: "Potted plant", kind: "home", about: "A leafy houseplant", license: "CC BY 4.0", credit: "Eric Chadwick, Darmstadt Graphics Group", kb: 9409, shot: "jpg" },
    { id: "Avocado", name: "Avocado", kind: "home", about: "A halved avocado", license: "CC0", credit: "Microsoft", kb: 8110, shot: "jpg" },
    { id: "ToyCar", name: "Toy car", kind: "vehicles", about: "A toy car", license: "CC0", credit: "Guido Odendahl, Eric Chadwick", kb: 5422, shot: "jpg" },
    { id: "CarConcept", name: "Concept car", kind: "vehicles", about: "A car for an automotive landing page", license: "CC BY 4.0", credit: "Eric Chadwick, Darmstadt Graphics Group", kb: 11779, shot: "jpg" },
    { id: "CesiumMilkTruck", name: "Milk truck", kind: "vehicles", about: "A delivery truck with turning wheels", license: "CC BY 4.0", credit: "Cesium", kb: 370, shot: "gif", animated: true },
    { id: "Fox", name: "Fox", kind: "art", about: "A low-poly fox with walk and run animations", license: "CC0 · CC BY 4.0", credit: "PixelMannen, tomkranis (rigging)", kb: 163, shot: "jpg", animated: true },
    { id: "CarbonFibre", name: "Carbon fibre ball", kind: "art", about: "A sphere in woven carbon fibre: a light hero shape", license: "CC BY 4.0", credit: "Eric Chadwick, Wayfair", kb: 430, shot: "jpg" },
    { id: "ClearCoatCarPaint", name: "Car paint ball", kind: "art", about: "A glossy car-paint sphere: a light hero shape", license: "CC0", credit: "Eric Chadwick", kb: 117, shot: "jpg" },
    { id: "ScatteringSkull", name: "Skull", kind: "art", about: "A translucent skull for dark or gaming pages", license: "CC0", credit: "Vladimir Petkovic", kb: 8959, shot: "jpg", rawShot: true },
]);
const SAMPLE_BASE = "https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/";
/** The .glb of a sample, its picture, and the page about it (the author, the licence and what it is). */
export const sampleUrl = (m) => `${SAMPLE_BASE}${m.id}/glTF-Binary/${m.id}.glb`;
// (jsDelivr refuses a few of the pictures, `rawShot`: those come from GitHub's own file server)
export const sampleThumb = (m) => `${m.rawShot ? "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/" : SAMPLE_BASE}${m.id}/screenshot/screenshot.${m.shot}`;
export const sourceUrl = (m) => `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${m.id}`;
/** Does a model need a credit line on the page (a CC BY licence)? */
export const needsCredit = (m) => /\bBY\b/.test(m.license);

/** The attributes, in the order the panel lists them: { name, type: "text"|"bool"|"number"|"select", def, min, max, step, options, label, hint }. `def` is what the script does without it. */
export const MODEL_ATTRS = Object.freeze([
    { name: "src", type: "text", def: "", label: "Model (.glb)", hint: "A URL, or a file embedded in the page" },
    { name: "controls", type: "bool", def: false, label: "Drag to orbit" },
    { name: "zoom", type: "bool", def: false, label: "Scroll to zoom", hint: "Off, scrolling over the model scrolls the page" },
    { name: "auto-rotate", type: "bool", def: false, label: "Auto-rotate" },
    { name: "rotate-speed", type: "number", def: 30, min: -360, max: 360, step: 5, label: "Spin speed (°/s)" },
    { name: "scroll-rotate", type: "number", def: 0, min: -720, max: 720, step: 15, label: "Turn on scroll (°)", hint: "Degrees the model turns while it crosses the screen" },
    { name: "animate", type: "bool", def: false, label: "Play its animation" },
    { name: "clip", type: "text", def: "", label: "Animation name", hint: "Empty plays all of the model's animations" },
    { name: "shadow", type: "bool", def: false, label: "Ground shadow" },
    { name: "rotation", type: "text", def: "0 0 0", label: "Rotation x y z (°)", hint: "Where the model starts, e.g. 0 45 0" },
    { name: "camera-angle", type: "number", def: 10, min: -80, max: 80, step: 1, label: "Camera angle (°)" },
    { name: "camera-distance", type: "number", def: 1, min: 0.3, max: 4, step: 0.05, label: "Camera distance", hint: "1 fits the whole model; less is closer" },
    { name: "fov", type: "number", def: 40, min: 10, max: 90, step: 1, label: "Field of view (°)" },
    { name: "environment", type: "select", def: "studio", options: ["studio", "none"], label: "Lighting" },
    { name: "exposure", type: "number", def: 1, min: 0, max: 4, step: 0.05, label: "Exposure" },
    { name: "light", type: "number", def: 1, min: 0, max: 6, step: 0.1, label: "Key light" },
    { name: "light-color", type: "text", def: "#ffffff", label: "Light colour" },
    { name: "model-size", type: "number", def: 0, min: 0, max: 8000, step: 10, label: "Model size (px)", hint: "How big the model is inside the box, whatever the box's size. Empty: it fits the box" },
    { name: "model-position", type: "text", def: "0 0 0", label: "Model position x y z", hint: "Where the model sits in the scene, from its middle, in the model's own units (its bounding sphere has radius 1), e.g. 0.4 0 0" },
    { name: "background", type: "text", def: "", label: "Scene colour", hint: "Empty is see-through, so a bg- class on the element shows" },
]);

const BY_NAME = Object.freeze(Object.fromEntries(MODEL_ATTRS.map((a) => [a.name, a])));
export const modelAttr = (name) => BY_NAME[name] || null;

/** Is this markup using a model (so the page needs the script)? */
export const usesModel = (markup) => /<wc-model[\s>/]/i.test(String(markup || ""));

/** Does a design's script list (as parseComponentSource gives it) already have the model script? */
export const hasModelScript = (scripts) => (scripts || []).some((s) => !s.src && String(s.text || "").includes(MODEL_MARK));

/** The script list with the current model script in it exactly once, only when the markup uses a model (and without it when none does). */
export function withModelScript(scripts, markup) {
    const rest = (scripts || []).filter((s) => s.src || !String(s.text || "").includes(MODEL_MARK));
    return usesModel(markup) ? [...rest, { src: "", type: "", defer: false, text: MODEL_SCRIPT }] : rest;
}

/** "0 45 0", "45" (turn about y) or garbage → [x, y, z] in degrees. */
export function parseRotation(v) {
    const n = String(v == null ? "" : v).trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (!n.length || n.some((x) => !Number.isFinite(x))) return [0, 0, 0];
    return n.length === 1 ? [0, n[0], 0] : [n[0] || 0, n[1] || 0, n[2] || 0];
}

/** A number attribute, kept inside the attribute's own limits: `def` when it is missing or not a number. */
export function numberAttr(name, raw) {
    const a = BY_NAME[name];
    const d = a ? a.def : 0;
    if (raw == null || String(raw).trim() === "") return d;
    const n = Number(raw);
    if (!Number.isFinite(n)) return d;
    return a && a.min != null ? Math.min(a.max, Math.max(a.min, n)) : n;
}

// ── Scroll story: the sections beside a pinned model are its steps. Each holds the model's pose for while it is on screen (data-wc-view) and how its
// own words behave when it is not the one in the middle of the screen (data-wc-words: dim or fade). The editor sets both from its Scroll drawer. ──
export const VIEW_ATTR = "data-wc-view";
export const WORDS_ATTR = "data-wc-words";
/** The model attributes a step's pose can set. */
export const VIEW_KEYS = Object.freeze(["rotation", "model-position", "model-size", "camera-angle", "camera-distance"]);
/** The choices for a step's words. */
export const WORDS = Object.freeze([["", "Always"], ["dim", "Dim when away"], ["fade", "Fade when away"]]);

/** `"rotation:0 90 0; model-size:420"` as an object (only the keys a pose can set). */
export function parseView(text) {
    const out = {};
    for (const part of String(text || "").split(";")) {
        const i = part.indexOf(":");
        if (i < 0) continue;
        const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
        if (VIEW_KEYS.includes(k) && v) out[k] = v;
    }
    return out;
}
/** A pose in a few plain words, for the drawer and the chips on the canvas: "side, closer", "back, from above". */
export function poseWords(view) {
    const v = parseView(view), out = [];
    const r = String(v.rotation || "0").trim().split(/[\s,]+/).map(Number), y = (r.length === 1 ? r[0] : r[1]) || 0; // one number is a turn about the vertical
    const a = ((Math.round(y) % 360) + 360) % 360;
    out.push(a <= 45 || a >= 315 ? "front" : a < 135 ? "side" : a <= 225 ? "back" : "other side");
    const d = Number(v["camera-distance"] || 1), tilt = Number(v["camera-angle"] ?? 10);
    if (d < 0.9) out.push("closer"); else if (d > 1.1) out.push("farther");
    if (tilt >= 30) out.push("from above"); else if (tilt <= -15) out.push("from below");
    if (v["model-position"] && String(v["model-position"]).trim().split(/[\s,]+/).some((n) => Math.abs(Number(n)) > 0.05)) out.push("moved");
    return out.join(", ");
}
/** One step of a story: a section with a heading and words, the pose, and dimming. */
export function stepMarkup(title, text, view = "rotation:0 0 0", words = "dim") {
    return `<section ${VIEW_ATTR}="${esc(view)}"${words ? ` ${WORDS_ATTR}="${esc(words)}"` : ""} class="flex min-h-screen items-center px-8 py-16 md:px-16"><div class="max-w-md"><h2 class="text-3xl font-semibold tracking-tight text-neutral-900">${esc(title)}</h2><p class="mt-3 text-neutral-600">${esc(text)}</p></div></section>`;
}
/** The 3D scroll story block: the model pinned beside three sections; the model glides to each section's pose, the other sections' words dim. */
export function storyMarkup() {
    return `<div class="grid md:grid-cols-2">` +
        `<div class="sticky top-0 z-10 h-[45vh] bg-white md:order-2 md:h-screen md:self-start">${modelMarkup({ shadow: true }, "block h-full w-full")}</div>` +
        `<div class="md:order-1">` +
        stepMarkup("Meet the design", "Start with the big picture. The model sits still while you read.", "rotation:0 -25 0; camera-angle:10") +
        stepMarkup("Every detail", "Scrolling turns the model and moves the camera in close.", "rotation:0 70 0; camera-angle:25; camera-distance:0.75") +
        stepMarkup("From every side", "Select the model and use Motion to pose it for each section.", "rotation:0 200 0; camera-angle:5; camera-distance:1.15") +
        `</div></div>`;
}

// ── Where a model sits and what it does: the two questions of its panel ──
// Placement (data-wc-place): "background" fills its section behind the content and stays on screen while the section scrolls; "across" does the same
// behind a group of sections; none is an ordinary box. The layout is plain Tailwind classes; the staying on screen is the runtime's (in any layout).
export const PLACE_ATTR = "data-wc-place";
export const PLACES = Object.freeze([["", "In a box"], ["background", "Section background"], ["across", "Across sections"]]);
const LAYOUT_TOKEN = /^(?:[a-z0-9]+:)*(?:-?(?:m[trblxyse]?|inset(?:-[xy])?|top|left|right|bottom|z|translate-[xy])-.+|[wh]-.+|size-.+|(?:min|max)-[wh]-.+|aspect-.+|absolute|relative|fixed|sticky|static|block|inline|inline-block|hidden|isolate|self-.+|order-.+|place-self-.+|justify-self-.+)$/;
/** The model's classes for a placement: its own layout classes (size, place, position) give way to the placement's; the rest (rounding, colours) stay. */
export function placeClasses(cls, place) {
    const keep = String(cls || "").split(/\s+/).filter((t) => t && !LAYOUT_TOKEN.test(t));
    const add = place === "background" || place === "across" ? ["absolute", "inset-x-0", "top-0", "-z-10", "block", "h-screen", "max-h-full", "w-full"] : ["block", "h-80", "w-full"];
    return [...add, ...keep].join(" ");
}

// Effects (data-wc-fx="spin-scroll:1 tilt-mouse:15 float:6"): each a name and an amount. Turntable is the model's own auto-rotate and rotate-speed.
export const FX_ATTR = "data-wc-fx";
/** The gallery: [name, label, default, min, max, step, unit, kind]. `attr`: an effect that is an attribute of its own (turntable). */
export const EFFECTS = Object.freeze([
    { name: "spin-scroll", label: "Spin on scroll", def: 1, min: -3, max: 3, step: 0.25, unit: "turns", kind: "scroll", hint: "Turns while its box (or section) is scrolled through" },
    { name: "zoom-scroll", label: "Zoom on scroll", def: 40, min: -60, max: 150, step: 5, unit: "%", kind: "scroll", hint: "Grows (or shrinks) while it is scrolled through" },
    { name: "tilt-mouse", label: "Tilt to mouse", def: 15, min: 0, max: 45, step: 1, unit: "°", kind: "mouse", hint: "Leans toward the pointer" },
    { name: "float", label: "Float", def: 6, min: 1, max: 30, step: 1, unit: "", kind: "always", hint: "Bobs gently up and down" },
    { name: "turntable", label: "Turntable", def: 30, min: 5, max: 180, step: 5, unit: "°/s", kind: "always", attr: true, hint: "Spins all the time" },
]);
/** `"spin-scroll:1 float:6"` as { "spin-scroll": 1, float: 6 } (only known effects, amounts kept inside their limits). */
export function parseFx(text) {
    const out = {};
    for (const tk of String(text || "").trim().split(/\s+/)) {
        const [n, v] = tk.split(":"), e = EFFECTS.find((x) => x.name === n && !x.attr);
        if (!e) continue;
        const num = v === undefined || v === "" ? e.def : Number(v);
        if (Number.isFinite(num)) out[n] = Math.min(e.max, Math.max(e.min, num));
    }
    return out;
}
/** The other way, in the gallery's order (empty when there are none). */
export const writeFx = (fx) => EFFECTS.filter((e) => !e.attr && fx && fx[e.name] != null && Number.isFinite(Number(fx[e.name]))).map((e) => `${e.name}:${Number(fx[e.name])}`).join(" ");

// ── Click actions: data-wc-act="color #e11d48 | view rotation:0 90 0 | clip Run | model https://…glb" on any element near a model ──
export const ACT_ATTR = "data-wc-act";
export const ACT_KINDS = Object.freeze([["color", "Change colour"], ["view", "Go to a view"], ["clip", "Play an animation"], ["model", "Swap the model"]]);
/** The actions in an attribute value: [{ kind, value }] (anything that isn't a known action with a value is left out). */
export function parseAct(text) {
    const out = [];
    for (const part of String(text || "").split("|")) {
        const a = part.trim(), i = a.indexOf(" ");
        if (i < 1) continue;
        const kind = a.slice(0, i), value = a.slice(i + 1).trim();
        if (ACT_KINDS.some(([k]) => k === kind) && value) out.push({ kind, value });
    }
    return out;
}
/** The attribute value for some actions (empty when there are none). */
export const writeAct = (list) => (list || []).filter((a) => a && a.kind && String(a.value || "").trim() && !String(a.value).includes("|")).map((a) => `${a.kind} ${String(a.value).trim()}`).join(" | ");

/** A boolean attribute is on when it is there, unless it says "false". */
export const boolAttr = (raw) => raw != null && String(raw).trim().toLowerCase() !== "false";

/** A whole <wc-model> tag from the attributes that differ from their default (src always). `extra`: class, id... are added first. */
export function modelMarkup(attrs = {}, cls = "block h-80 w-full") {
    const parts = [];
    if (cls) parts.push(`class="${esc(cls)}"`);
    for (const a of MODEL_ATTRS) {
        const v = attrs[a.name];
        if (v == null || v === "" || v === false) continue;
        if (a.type === "bool") parts.push(a.name);
        else if (a.name !== "src" && String(v) === String(a.def)) continue;
        else parts.push(`${a.name}="${esc(v)}"`);
    }
    return `<${MODEL_TAG} ${parts.join(" ")}></${MODEL_TAG}>`;
}
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** A hotspot: ordinary HTML pinned to a point of the model. `pos` "x y z" is in the model's own units (its bounding sphere has radius 1). */
export function hotspotMarkup(n = 1, pos = "0 0 0", label = "Label") {
    return `<button type="button" slot="hotspot-${n}" data-position="${esc(pos)}" class="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-900 shadow-md">${esc(label)}</button>`;
}
/** The number for the next hotspot of a model's markup (hotspot-1, hotspot-2...): one more than the highest there is. */
export const nextHotspot = (html) => 1 + Math.max(0, ...[...String(html || "").matchAll(/slot="hotspot-(\d+)"/g)].map((m) => Number(m[1])));

/** Files a model can be read from, by their name or type. Only a self-contained glTF (everything inside) works from a data URL. */
export const isModelFile = (name, type) => /\.(glb|gltf)$/i.test(String(name || "")) || /^model\/gltf/i.test(String(type || ""));
/** The most a model embedded in the page may be: the same limit as an embedded image (a design is saved whole, up to a few MB). */
export const MAX_EMBED_BYTES = 1500000;

// ── The element ──────────────────────────────────────────────────────────────────────────────────
// Runs in the page. Written as a function so it stays readable; it is saved as text (MODEL_SCRIPT). It must not use anything outside itself.
function modelRuntime() {
    if (window.customElements && customElements.get("wc-model")) return;
    var editingNow = function () { return !!document.querySelector("script[data-wc-agent]"); };
    // where the scroll is among a story's steps: j the last step whose middle is above the middle of the screen (-1 before the first), t how far it is to
    // the next (eased), and `u` that as a step number (1 is the first)
    function place(els) {
        var line = innerHeight / 2, cs = els.map(function (e) { var b = e.getBoundingClientRect(); return b.top + b.height / 2; }), j = -1, i, t = 0;
        for (i = 0; i < cs.length; i++) if (cs[i] <= line) j = i;
        if (j >= 0 && j < els.length - 1) { t = Math.min(1, Math.max(0, (line - cs[j]) / Math.max(1, cs[j + 1] - cs[j]))); t = t * t * (3 - 2 * t); }
        return { j: j, t: t, u: Math.max(j, 0) + 1 + t };
    }
    var VERSION = "__THREE_VERSION__";
    var CDN = "__THREE_CDN__";
    var libs = null;
    // Three.js, its glTF loader, orbit controls and a studio environment: fetched once, on the first model
    function load() {
        if (libs) return libs;
        var base = CDN + "three@" + VERSION;
        libs = Promise.all([
            import(base + "/+esm"),
            import(base + "/examples/jsm/loaders/GLTFLoader.js/+esm"),
            import(base + "/examples/jsm/controls/OrbitControls.js/+esm"),
            import(base + "/examples/jsm/environments/RoomEnvironment.js/+esm"),
        ]).then(function (m) { return { THREE: m[0], GLTFLoader: m[1].GLTFLoader, OrbitControls: m[2].OrbitControls, RoomEnvironment: m[3].RoomEnvironment }; });
        return libs;
    }
    var GIZMO_REACH = 1.5; // how big the handles are against the model (an arrow then reaches most of the way to its edge)
    // The transform handles the editor shows on a picked model (move, turn, size): fetched only when one is asked for
    var gizmoLib = null;
    function loadGizmo() {
        if (!gizmoLib) gizmoLib = load().then(function () { return import(CDN + "three@" + VERSION + "/examples/jsm/controls/TransformControls.js/+esm"); }).then(function (m) { return m.TransformControls; });
        return gizmoLib;
    }
    var num = function (el, name, def, min, max) {
        var v = el._a ? el._a(name) : el.getAttribute(name);
        if (v == null || String(v).trim() === "") return def;
        v = Number(v);
        return isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
    };
    var flag = function (el, name) { var v = el.getAttribute(name); return v != null && String(v).trim().toLowerCase() !== "false"; };
    var turns = function (v) {
        var n = String(v || "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
        if (!n.length || n.some(function (x) { return !isFinite(x); })) return [0, 0, 0];
        return n.length === 1 ? [0, n[0], 0] : [n[0] || 0, n[1] || 0, n[2] || 0];
    };

    class WcModel extends HTMLElement {
        static get observedAttributes() {
            return ["src", "controls", "zoom", "auto-rotate", "rotate-speed", "animate", "rotation", "camera-angle", "camera-distance", "fov", "environment", "exposure", "light", "light-color", "background", "scroll-rotate", "shadow", "clip", "model-size", "model-position", "data-wc-fx", "data-wc-pin", "data-wc-place"]; // (its effects, and staying on screen: a change shows at once)
        }
        constructor() {
            super();
            var root = this.attachShadow({ mode: "open" });
            // the element is a block that fills its width by default; any class (w-*, h-*, aspect-*, hidden…) outranks these
            root.innerHTML = '<style>:host{display:block;position:relative;width:100%;height:20rem;overflow:hidden}' +
                'canvas{display:block;width:100%;height:100%;touch-action:pan-y}' +
                '.s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:12px system-ui,sans-serif;color:#737373;text-align:center;padding:8px}' +
                '.s[hidden]{display:none}' +
                '.ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font:12px system-ui,sans-serif;color:#737373;text-align:center;padding:8px}.ph[hidden]{display:none}' +
                '.ph svg{width:44px;height:44px;opacity:.7}.ph button{font:500 12px system-ui,sans-serif;background:#111;color:#fff;border:0;border-radius:999px;padding:6px 14px;cursor:pointer}.ph button:hover{background:#333}' +
                '.h{position:absolute;inset:0;overflow:hidden;pointer-events:none}.h>div{position:absolute;left:0;top:0;pointer-events:auto;will-change:transform}</style>' +
                '<slot class="s"></slot><div class="s" part="error" hidden></div><div class="h"></div>' +
                // an empty model, in the editor: a cube and a button that asks the editor to open its list of models
                '<div class="ph" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/></svg><span>No 3D model yet</span><button type="button" data-wc-choose>Choose a model</button></div>';
            this._slot = root.querySelector("slot");
            this._err = root.querySelector("[part=error]");
            this._root = root;
            this._layer = root.querySelector(".h");
            this._ph = root.querySelector(".ph");
            this._spin = 0;
            this._seq = 0;
            this._on = false;
        }
        connectedCallback() {
            this._on = true;
            var self = this;
            if (!this._ro) {
                this._ro = new ResizeObserver(function () { if (self._ground) self._apply(); else self._size(); }); // the camera depends on the box's shape
                this._io = new IntersectionObserver(function (e) { self._visible = e[0].isIntersecting; self._frame(); });
            }
            this._ro.observe(this);
            this._io.observe(this);
            this._visible = true;
            // scroll-rotate follows the page's scroll; hotspots are the element's own children that have a data-position
            this._onScroll = this._onScroll || function () { if (self.hasAttribute("data-wc-place") || self.hasAttribute("data-wc-pin")) self._pinTick(); if (num(self, "scroll-rotate", 0, -720, 720) || self._fxv("spin-scroll") || self._fxv("zoom-scroll") || self._steps().length) self._frame(); };
            window.addEventListener("scroll", this._onScroll, { passive: true });
            window.addEventListener("resize", this._onScroll);
            // tilt to mouse: where the pointer is over the model's box, -1..1 each way
            this._onMove = this._onMove || function (e) {
                if (!self._fxv("tilt-mouse")) return;
                var b = self.getBoundingClientRect();
                self._mx = Math.max(-1, Math.min(1, (e.clientX - (b.left + b.width / 2)) / Math.max(1, b.width / 2)));
                self._my = Math.max(-1, Math.min(1, (e.clientY - (b.top + b.height / 2)) / Math.max(1, b.height / 2)));
                self._frame();
            };
            window.addEventListener("pointermove", this._onMove, { passive: true });
            this._mo = this._mo || new MutationObserver(function () { self._hotspots(); self._frame(); });
            this._mo.observe(this, { childList: true, attributes: true, attributeFilter: ["data-position", "slot"], subtree: true });
            this._hotspots();
            this._build();
        }
        disconnectedCallback() {
            this._on = false;
            if (this._ro) { this._ro.disconnect(); this._io.disconnect(); }
            window.removeEventListener("scroll", this._onScroll);
            window.removeEventListener("resize", this._onScroll);
            window.removeEventListener("pointermove", this._onMove);
            if (this._mo) this._mo.disconnect();
            this._dispose();
        }
        attributeChangedCallback(name, was, now) {
            if (!this._on || was === now) return;
            if (name === "src") return this._build();
            this._apply();
        }
        // The cube and "Choose a model" show only while there is no model and the page is being edited (the agent script is added after the page parses)
        _showPh() { if (this._ph) this._ph.hidden = Boolean(this.getAttribute("src")) || !document.querySelector("script[data-wc-agent]"); }
        _fail(msg) { this._err.textContent = msg; this._err.hidden = false; this._slot.hidden = true; this.dispatchEvent(new CustomEvent("error", { detail: msg })); }
        _dispose() {
            this._seq++;
            cancelAnimationFrame(this._raf); this._raf = 0;
            if (this._controls) this._controls.dispose();
            if (this._scene) this._scene.traverse(function (o) {
                if (o.geometry) o.geometry.dispose();
                var ms = o.material ? [].concat(o.material) : [];
                ms.forEach(function (m) { for (var k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); });
            });
            if (this._renderer) { this._renderer.dispose(); this._renderer.domElement.remove(); }
            this._renderer = this._scene = this._camera = this._controls = this._pivot = this._spinner = this._mixer = this._ground = null;
            this._ov = null; this._twm = {};
            this._clipOn = false;
            if (this._tc) { this._tc.dispose(); }
            this._tc = null; this._tcWait = false;
        }
        _build() {
            var self = this, seq = ++this._seq, src = this.getAttribute("src");
            this._dispose();
            this._seq = seq;
            this._err.hidden = true;
            this._slot.hidden = false;
            this._layer.style.visibility = "hidden"; // hotspots wait for the model
            this._showPh();
            if (!src) return;
            load().then(function (L) {
                if (seq !== self._seq || !self._on) return;
                var T = L.THREE, scene = new T.Scene(), renderer;
                try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return self._fail("This browser can't show 3D (WebGL is off)"); }
                renderer.outputColorSpace = T.SRGBColorSpace;
                renderer.toneMapping = T.ACESFilmicToneMapping;
                self._root.appendChild(renderer.domElement);
                var camera = new T.PerspectiveCamera(40, 1, 0.01, 1000);
                var key = new T.DirectionalLight(0xffffff, 1);
                key.position.set(3, 5, 4);
                var pmrem = new T.PMREMGenerator(renderer);
                scene.add(key);
                var pivot = new T.Group(), spinner = new T.Group();
                pivot.add(spinner);
                scene.add(pivot);
                self._spinner = spinner;
                self._renderer = renderer; self._scene = scene; self._camera = camera; self._pivot = pivot; self._key = key; self._T = T; self._L = L;
                self._env = pmrem.fromScene(new L.RoomEnvironment(), 0.04).texture;
                pmrem.dispose();
                var controls = new L.OrbitControls(camera, renderer.domElement);
                controls.addEventListener("change", function () { if (self._live) self._moved = true; self._frame(); });
                self._controls = controls;
                new L.GLTFLoader().load(src, function (gltf) {
                    if (seq !== self._seq || !self._on) return;
                    var obj = gltf.scene, box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), mid = box.getCenter(new T.Vector3());
                    // every model is scaled so its bounding sphere has radius 1 and centred on the pivot: it spins about its own middle, and a
                    // hotspot's data-position is in those units whatever the file's own scale
                    var r = Math.max(size.length() / 2, 1e-3);
                    obj.position.copy(mid).multiplyScalar(-1 / r);
                    obj.scale.setScalar(1 / r);
                    spinner.add(obj);
                    self._radius = 1;
                    self._floor = -size.y / 2 / r;
                    self._clips = gltf.animations || [];
                    if (self._clips.length) self._mixer = new T.AnimationMixer(obj);
                    // a soft round shadow on the ground under the model (the "shadow" attribute)
                    var cv = document.createElement("canvas"); cv.width = cv.height = 64;
                    var g = cv.getContext("2d").createRadialGradient(32, 32, 0, 32, 32, 32);
                    g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
                    cv.getContext("2d").fillStyle = g; cv.getContext("2d").fillRect(0, 0, 64, 64);
                    var ground = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false }));
                    ground.rotation.x = -Math.PI / 2;
                    ground.position.y = self._floor - 0.01;
                    // as wide as the model's own footprint (not a fixed disc), so a tall thin model doesn't get a huge smudge
                    ground.scale.setScalar(Math.min(1.6, Math.max(0.5, Math.max(size.x, size.z) / r * 1.15)) / 1.8);
                    pivot.add(ground);
                    self._ground = ground;
                    self._slot.hidden = true;
                    self._layer.style.visibility = "";
                    self._apply();
                    self.dispatchEvent(new CustomEvent("load"));
                }, undefined, function (e) { self._fail("Couldn't load the model" + (e && e.message ? ": " + e.message : "")); });
            }, function () { self._fail("Couldn't load Three.js (offline?)"); });
        }
        // every attribute that is not the file: cheap, so it runs on each change
        _apply() {
            if (!this._renderer || !this._ground) return;
            var T = this._T, c = this._camera, r = this._renderer;
            var r3 = turns(this._a("rotation"));
            if (!this._dragging) { // (not while a handle is being dragged: it is the one moving it)
                this._pivot.rotation.set(r3[0] * Math.PI / 180, r3[1] * Math.PI / 180, r3[2] * Math.PI / 180);
                // `model-position`: where the model sits in the scene, in its own units
                var pp = String(this._a("model-position") || "").trim().split(/[\s,]+/).map(Number);
                this._pivot.position.set(isFinite(pp[0]) ? pp[0] : 0, isFinite(pp[1]) ? pp[1] : 0, isFinite(pp[2]) ? pp[2] : 0);
                this._pivot.scale.set(1, 1, 1);
            }
            this._ground.visible = flag(this, "shadow");
            // the clips to play: the one named in `clip`, else all of them
            if (this._mixer) {
                var want = (this.getAttribute("clip") || "").trim(), mx = this._mixer;
                if (this._clipKey !== want || !this._clipOn) { // not on every resize: that would restart the animation
                    this._clipKey = want; this._clipOn = true;
                    mx.stopAllAction();
                    this._clips.forEach(function (cl) { if (!want || cl.name === want) mx.clipAction(cl).play(); });
                }
            }
            c.fov = num(this, "fov", 40, 10, 90);
            // far enough that the model's bounding sphere (a little tightened) fits both ways: the narrower of the two view angles decides
            var half = c.fov * Math.PI / 360, aspect = (this.clientWidth || 1) / (this.clientHeight || 1);
            half = Math.min(half, Math.atan(Math.tan(half) * aspect));
            var W = this.clientWidth || 1, H = this.clientHeight || 1;
            // Without `model-size` the model fits the box (its sphere is about 0.72 of the box's shorter side). With it, the model is that many px
            // (the sphere's width) in any box: the camera keeps its distance (so the perspective does not change with the box) and zooms instead.
            var fit = this._radius * 0.72 / Math.sin(half), ms = num(this, "model-size", 0, 0, 8000), cd = num(this, "camera-distance", 1, 0.3, 4);
            var dist = (ms ? this._radius * 0.72 / Math.sin(c.fov * Math.PI / 360) : fit) * cd;
            c.zoom = ms ? ms * cd / (0.72 * H) : 1; // in a set size `camera-distance` only changes the perspective, not the size
            this._zoom0 = c.zoom;
            c.zoom *= this._zf || 1; // zoom on scroll
            var el = num(this, "camera-angle", 10, -80, 80) * Math.PI / 180;
            c.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
            c.near = dist / 100; c.far = dist * 100;
            c.lookAt(0, 0, 0);
            c.updateProjectionMatrix();
            var ctl = this._controls;
            // inside the editor's canvas the model only looks (the editor owns the pointer, so dragging it moves the element) until the
            // editor turns `_live` on with a double-click on it; the agent script is added after the page parses, so this is checked each time
            var editing = !!document.querySelector("script[data-wc-agent]");
            ctl.enabled = this._live || (flag(this, "controls") && !editing);
            this._renderer.domElement.style.cursor = this._live ? "grab" : "";
            ctl.enableZoom = flag(this, "zoom");
            ctl.enablePan = false;
            ctl.target.set(0, 0, 0);
            ctl.update();
            this._renderer.domElement.style.pointerEvents = ctl.enabled || this._gmode ? "" : "none";
            this._syncGizmo();
            this._tint();
            r.toneMappingExposure = num(this, "exposure", 1, 0, 4);
            this._scene.environment = this.getAttribute("environment") === "none" ? null : this._env;
            this._key.intensity = num(this, "light", 1, 0, 6);
            try { this._key.color.set(this.getAttribute("light-color") || "#ffffff"); } catch (e) { /* a colour the browser doesn't know: white */ }
            var bg = this.getAttribute("background");
            r.setClearColor(bg || 0x000000, bg ? 1 : 0);
            this._size();
            this._frame();
        }
        // ── What the editor does with a model (all of it only while editing a page: the page's own visitors never get any of it) ──
        // Is the model under this point (the page's coordinates inside the editor's frame)? A ray from the camera against the model itself.
        _hit(cx, cy) {
            if (!this._renderer || !this._ground) return false;
            var T = this._T, r = this._renderer.domElement.getBoundingClientRect();
            var rc = new T.Raycaster();
            rc.setFromCamera(new T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1)), this._camera);
            this._scene.updateMatrixWorld(true);
            return rc.intersectObject(this._spinner, true).length > 0;
        }
        // A blue wash over the model: `_hl` 1 says "this can be picked" (its scene is selected), 2 "this is picked". Colours put back when 0.
        _tint() {
            if (!this._spinner) return;
            var level = this._hl || 0;
            this._spinner.traverse(function (o) {
                if (!o.isMesh) return;
                [].concat(o.material).forEach(function (m) {
                    if (!m || !m.emissive) return;
                    if (!m.userData.wcE) m.userData.wcE = { c: m.emissive.clone(), i: m.emissiveIntensity };
                    if (level) { m.emissive.set(0x2f4fdd); m.emissiveIntensity = level === 2 ? 0.32 : 0.14; } else { m.emissive.copy(m.userData.wcE.c); m.emissiveIntensity = m.userData.wcE.i; }
                });
            });
            this._frame();
        }
        // The handles on a picked model: `_gmode` "move", "rotate" or "scale" (null: none). Dragging one changes the model's pivot live; when it
        // is let go the result goes out as `wc-gizmo` (rotation, model-position or model-size) and the editor writes it as attributes.
        _syncGizmo() {
            var self = this, mode = this._gmode;
            if (!this._renderer || !this._ground) return;
            if (!mode) {
                if (this._tc) { this._tc.detach(); this._tc.getHelper().visible = false; this._tc.enabled = false; }
                return;
            }
            if (!this._tc) {
                if (this._tcWait) return;
                this._tcWait = true;
                loadGizmo().then(function (TC) {
                    if (!self._renderer || self._tc) return;
                    var tc = new TC(self._camera, self._renderer.domElement);
                    self._scene.add(tc.getHelper());
                    tc.addEventListener("change", function () { self._frame(); });
                    tc.addEventListener("objectChange", function () {
                        if (self._gmode === "scale") { // one size for the whole model: the axis dragged furthest sets it
                            var s = self._pivot.scale, m = [s.x, s.y, s.z].reduce(function (a, v) { return Math.abs(v - 1) > Math.abs(a - 1) ? v : a; }, 1);
                            s.set(m, m, m);
                        }
                    });
                    tc.addEventListener("dragging-changed", function (e) {
                        self._dragging = e.value;
                        if (!e.value) self._commit();
                    });
                    self._tc = tc;
                    self._syncGizmo();
                });
                return;
            }
            var tc = this._tc;
            tc.setMode(mode === "move" ? "translate" : mode);
            tc.attach(this._pivot);
            this._gizmoSize();
            tc.getHelper().visible = true;
            tc.enabled = true;
            this._frame();
        }
        // The handles at about the model's own size on screen (not a share of the box: a tall box made them huge), at least big enough to grab and at
        // most a share of the box's shorter side. TransformControls scales its handles by its own factor of the camera's distance; `size` sets the rest.
        _gizmoSize() {
            var tc = this._tc, c = this._camera;
            if (!tc || !c) return;
            var W = this.clientWidth || 1, H = this.clientHeight || 1, p = new this._T.Vector3();
            this._pivot.getWorldPosition(p);
            var dist = c.position.distanceTo(p) || 1, half = dist * Math.tan(c.fov * Math.PI / 360) / (c.zoom || 1); // half the box's height, in world units
            var modelPx = (this._radius || 1) * (this._pivot.scale.x || 1) / half * (H / 2); // the model's radius on screen
            var want = Math.max(56, Math.min(modelPx * GIZMO_REACH, Math.min(W, H) * 0.6)); // how far a handle reaches, in px
            var factor = dist * Math.min(1.9 * Math.tan(Math.PI * c.fov / 360) / (c.zoom || 1), 7);
            tc.setSize(Math.max(0.15, 4 * (want / (H / 2) * half) / factor));
        }
        // Over a handle of the gizmo right now (so a press goes to it, not to the editor's own selection)?
        _gizmoAxis(cx, cy) {
            if (!(this._tc && this._tc.enabled && this._gmode)) return false;
            var r = this._renderer.domElement.getBoundingClientRect();
            this._tc.pointerHover({ x: (cx - r.left) / r.width * 2 - 1, y: -((cy - r.top) / r.height * 2 - 1), button: -1 });
            return Boolean(this._tc.axis);
        }
        _commit() {
            var T = this._T, p = this._pivot, d = {}, D = 180 / Math.PI, r1 = function (v) { v = Math.round(v * 10) / 10; return v === 0 ? 0 : v; };
            if (this._gmode === "rotate") {
                var e = new T.Euler().setFromQuaternion(p.quaternion, "XYZ");
                var rot = [r1(e.x * D), r1(e.y * D), r1(e.z * D)];
                d.rotation = rot.every(function (v) { return v === 0; }) ? null : rot.join(" ");
            } else if (this._gmode === "move") {
                var r2 = function (v) { v = Math.round(v * 100) / 100; return v === 0 ? 0 : v; }, q = [r2(p.position.x), r2(p.position.y), r2(p.position.z)];
                d["model-position"] = q.every(function (v) { return v === 0; }) ? null : q.join(" ");
            } else if (this._gmode === "scale") {
                var f = p.scale.x, size = Math.round(Math.min(8000, Math.max(20, this._sizeNow() * f)));
                d["model-size"] = String(size);
                p.scale.set(1, 1, 1);
            }
            this.dispatchEvent(new CustomEvent("wc-gizmo", { bubbles: true, composed: true, detail: d }));
        }
        // The model's size in px as `model-size` counts it (what it is now, fitted or set)
        _sizeNow() { return num(this, "model-size", 0, 0, 8000) || 0.72 * Math.min(this.clientWidth || 1, this.clientHeight || 1); }
        // What the editor saves when someone has turned the model to a new view (see `_live`): the attributes that give that view, so what
        // was left on the canvas is what the page shows. The camera sits on the +z axis at `camera-angle`; turning around the model by an angle
        // is turning the model the other way about the vertical axis, so the turn goes into `rotation` (about the world's y, after its own
        // turns). Null when nothing was turned. A value equal to the default is null (the attribute comes off).
        _bake() {
            if (!this._moved || !this._camera) return null;
            var T = this._T, p = this._camera.position, d = p.length() || 1;
            var el = Math.max(-80, Math.min(80, Math.asin(Math.max(-1, Math.min(1, p.y / d))) * 180 / Math.PI));
            var az = Math.atan2(p.x, p.z), r3 = turns(this._a("rotation")), D = Math.PI / 180;
            var q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -az).multiply(new T.Quaternion().setFromEuler(new T.Euler(r3[0] * D, r3[1] * D, r3[2] * D, "XYZ")));
            var e = new T.Euler().setFromQuaternion(q, "XYZ");
            var r = function (v) { v = Math.round(v / D * 10) / 10; return v === 0 ? 0 : v; };
            var rot = [r(e.x), r(e.y), r(e.z)];
            // the same turn can be written two ways: (180, y, 180) is a plain turn about y of 180 - y: the plain one is what is shown
            if (Math.abs(Math.abs(rot[0]) - 180) < 0.06 && Math.abs(Math.abs(rot[2]) - 180) < 0.06) {
                var y = 180 - rot[1];
                y = y > 180 ? y - 360 : y <= -180 ? y + 360 : y;
                rot = [0, Math.round(y * 10) / 10, 0];
            }
            var ang = Math.round(el * 10) / 10;
            return { rotation: rot.every(function (v) { return v === 0; }) ? null : rot.join(" "), "camera-angle": ang === 10 ? null : String(ang) };
        }
        // hotspots: children with data-position="x y z" (the model's own units: its bounding sphere has radius 1) are pinned to that point on the
        // model, each in a slot of its own, so they are ordinary HTML in the page (any tag, any Tailwind classes, a link or a button)
        _hotspots() {
            var self = this, n = 0;
            this._spots = [];
            [].slice.call(this._layer.children).forEach(function (w) { w.remove(); });
            [].slice.call(this.children).forEach(function (k) {
                if (!k.hasAttribute("data-position")) return;
                var name = k.getAttribute("slot") || "hotspot-" + (++n), p = turns(k.getAttribute("data-position")).map(Number);
                if (!k.getAttribute("slot")) k.setAttribute("slot", name);
                var w = document.createElement("div"), sl = document.createElement("slot");
                sl.name = name; w.appendChild(sl); self._layer.appendChild(w);
                self._spots.push({ w: w, p: p });
            });
        }
        _place() {
            if (!this._spots || !this._spots.length || !this._spinner) return;
            var T = this._T, v = new T.Vector3(), W = this.clientWidth, H = this.clientHeight;
            this._scene.updateMatrixWorld(true);
            for (var i = 0; i < this._spots.length; i++) {
                var s = this._spots[i];
                v.set(s.p[0], s.p[1], s.p[2]);
                this._spinner.localToWorld(v);
                v.project(this._camera);
                s.w.style.display = v.z > 1 ? "none" : "";
                s.w.style.transform = "translate(" + ((v.x * 0.5 + 0.5) * W) + "px," + ((-v.y * 0.5 + 0.5) * H) + "px) translate(-50%,-50%)";
            }
        }
        // what a click action's glide to a view (`_ov`) says while it runs, else the attribute
        _a(name) { var o = this._peek || this._ov; return o && o[name] != null ? o[name] : this.getAttribute(name); }
        // ── Scroll story: the steps are the sections with data-wc-view in the nearest ancestor that has any (and no other model). As the page scrolls the
        // model glides from one step's pose to the next, and steps with data-wc-words dim or fade while they are away from the middle of the screen. ──
        _findSteps() {
            var id = this.id, list = [];
            // linked to it by its id (data-wc-for="its id"): any number of models on a page, each with its own steps anywhere in it
            if (id) list = [].slice.call(document.querySelectorAll("[data-wc-view]")).filter(function (e) { return e.getAttribute("data-wc-for") === id; });
            // not linked: the steps in the nearest box around it that has any and no other model (the Scroll story block, pages made before links)
            if (!list.length) for (var p = this.parentElement; p; p = p.parentElement) {
                if (p.querySelectorAll("wc-model").length > 1) break;
                var f = [].slice.call(p.querySelectorAll("[data-wc-view]")).filter(function (e) { return !e.hasAttribute("data-wc-for"); });
                if (f.length) { list = f; break; }
            }
            // in the order they are down the page (in a free layout that need not be the order of the code)
            return list.map(function (e) { return [e, e.getBoundingClientRect().top + scrollY]; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return x[0]; });
        }
        _steps() {
            var now = performance.now();
            if (this._sc && now - this._sct < 300) return this._sc;
            this._sct = now;
            return (this._sc = editingNow() ? [] : this._findSteps());
        }
        _story() {
            var els = this._steps();
            if (!els.length || !this._ground) return;
            var pl = place(els), a = this._pose(els[Math.max(pl.j, 0)].getAttribute("data-wc-view")), b = pl.j >= 0 && pl.j < els.length - 1 ? this._pose(els[pl.j + 1].getAttribute("data-wc-view")) : a;
            var ov = this._blend(a, b, pl.t), key = JSON.stringify(ov);
            els.forEach(function (st, i) {
                var w = st.getAttribute("data-wc-words");
                if (w !== "dim" && w !== "fade") return;
                var d = Math.min(1, Math.abs(pl.u - (i + 1)));
                st.style.opacity = String(Math.round((w === "fade" ? 1 - d : 1 - 0.7 * d) * 1000) / 1000);
            });
            if (key === this._storyKey) return;
            this._storyKey = key; this._ov = ov;
            this._apply();
        }
        // the editor's Scroll drawer: show one step's pose (`step`), the pose at `u` along the steps (1 is the first), or the model as it is set (neither)
        _showView(view, color) { // the pose `view` (text) and colour `color` shown at once; null: the model as it is set
            if (!this._ground) return;
            var a = view != null ? this._pose(view) : null;
            this._peek = a ? this._blend(a, a, 0) : null;
            this._apply();
            if (color) this._paint(color, true); else if (this._shownCol) this._paint("reset", true);
            this._shownCol = color || null;
        }
        // a small square picture of the model in the pose `view` (for the editor's Scroll strip): drawn at once, without the editor's blue wash or
        // handles, and the model goes back to what it showed. Null while the model is not loaded.
        _snap(view, px) {
            if (!this._renderer || !this._ground) return null;
            var keep = this._peek, hl = this._hl, helper = this._tc && this._tc.getHelper(), hv = helper && helper.visible, a = this._pose(view), url = null;
            this._peek = this._blend(a, a, 0); this._hl = 0; this._tint(); if (helper) helper.visible = false;
            this._apply();
            try {
                this._renderer.render(this._scene, this._camera);
                var src = this._renderer.domElement, c = document.createElement("canvas"), s = Math.min(src.width, src.height);
                c.width = c.height = px || 64;
                c.getContext("2d").drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, c.width, c.height);
                url = c.toDataURL("image/png");
            } catch (e) { url = null; }
            if (helper) helper.visible = hv; this._hl = hl; this._tint();
            this._peek = keep; this._apply();
            return url;
        }
        _showU(u) {
            var els = this._findSteps();
            if (!els.length || !this._ground) return;
            var j = Math.min(els.length - 1, Math.max(0, Math.floor(u - 1))), t = Math.min(1, Math.max(0, u - 1 - j)), k = Math.min(els.length - 1, j + 1);
            this._peek = this._blend(this._pose(els[j].getAttribute("data-wc-view")), this._pose(els[k].getAttribute("data-wc-view")), t);
            this._apply();
        }
        // a view as numbers: the model's own attributes, with what a view text ("rotation:0 90 0; model-size:420", a click action's) sets laid over them
        _pose(view) {
            var g = function (n) { return this.getAttribute(n); }.bind(this), three = function (v) { var q = turns(v); return [q[0], q[1], q[2]]; };
            var fitPx = 0.72 * Math.min(this.clientWidth || 1, this.clientHeight || 1);
            var own = function (n, d, lo, hi) { var v = g(n); if (v == null || String(v).trim() === "" || !isFinite(Number(v))) return d; return Math.min(hi, Math.max(lo, Number(v))); };
            var o = {
                rotation: three(g("rotation")), "model-position": g("model-position") ? three(g("model-position")) : [0, 0, 0],
                "model-size": own("model-size", 0, 0, 8000) || fitPx, "camera-angle": own("camera-angle", 10, -80, 80), "camera-distance": own("camera-distance", 1, 0.3, 4)
            };
            String(view || "").split(";").forEach(function (part) {
                var i = part.indexOf(":");
                if (i < 0) return;
                var k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
                if (k === "rotation" || k === "model-position") o[k] = three(v);
                else if (k === "model-size" || k === "camera-angle" || k === "camera-distance") { var n = Number(v); if (isFinite(n)) o[k] = n; }
            });
            return o;
        }
        // two poses mixed (t 0..1) as the attribute strings `_a` hands out
        _blend(a, b, t) {
            var mix = function (x, y) { return x + (y - x) * t; }, r3 = function (x, y) { return [0, 1, 2].map(function (k) { return Math.round(mix(x[k], y[k]) * 1000) / 1000; }).join(" "); };
            return {
                rotation: r3(a.rotation, b.rotation), "model-position": r3(a["model-position"], b["model-position"]),
                "model-size": String(Math.round(mix(a["model-size"], b["model-size"]))),
                "camera-angle": String(Math.round(mix(a["camera-angle"], b["camera-angle"]) * 100) / 100),
                "camera-distance": String(Math.round(mix(a["camera-distance"], b["camera-distance"]) * 1000) / 1000)
            };
        }
        // ── Click actions: any element with data-wc-act="color #e11d48 | view rotation:0 90 0 | clip Run | model url" does that to its model on a click ──
        // an eased run of `fn(t)` for t 0..1 over `ms`
        _tween(key, ms, fn) { // (one run per `key`: a colour and a view can glide together, a second colour replaces the first)
            var self = this, t0 = performance.now(), tw = this._twm = this._twm || {}, id = tw[key] = (tw[key] || 0) + 1;
            (function step(now) {
                if (id !== self._twm[key] || !self._renderer) return;
                var t = Math.min(1, (now - t0) / ms);
                fn(t * t * (3 - 2 * t));
                if (t < 1) requestAnimationFrame(step);
            })(t0);
        }
        // every material's colour goes to `hex` (a colour the browser knows), or back to the file's own for "reset"
        _paint(hex, instant) {
            if (!this._spinner || !this._T) return;
            var T = this._T, to = null, mats = [];
            this._col = hex === "reset" ? null : hex;
            if (hex !== "reset") { try { to = new T.Color(hex); } catch (e) { return; } }
            this._spinner.traverse(function (o) { if (o.isMesh) [].concat(o.material).forEach(function (m) { if (m && m.color && mats.indexOf(m) < 0) mats.push(m); }); });
            var from = mats.map(function (m) { if (!m.userData.wcC) m.userData.wcC = m.color.clone(); return m.color.clone(); }), self = this;
            var go = function (t) { mats.forEach(function (m, i) { m.color.copy(from[i]).lerp(to || m.userData.wcC, t); }); self._frame(); };
            if (instant) { this._twm = this._twm || {}; this._twm.paint = (this._twm.paint || 0) + 1; go(1); } else this._tween("paint", 350, go);
        }
        // the model glides to the view in `text` ("rotation:0 90 0; model-size:420"), and keeps it: the attributes take over when it arrives
        _goView(text, mode) {
            if (!this._ground) return;
            // the glide starts from what the model shows now (a glide in progress too), so a hover that ends half way turns back from there
            var cur = this._ov, a = this._pose(null), b = this._pose(text), self = this;
            if (cur) a = { rotation: String(cur.rotation).trim().split(/\s+/).map(Number), "model-position": String(cur["model-position"]).trim().split(/\s+/).map(Number), "model-size": Number(cur["model-size"]), "camera-angle": Number(cur["camera-angle"]), "camera-distance": Number(cur["camera-distance"]) };
            this._tween("view", mode ? 450 : 700, function (t) {
                self._ov = self._blend(a, b, t);
                if (t < 1) return self._apply();
                if (mode === "keep") return self._apply(); // held while the pointer is over it
                if (mode === "rest") { self._ov = null; return self._apply(); } // back to how it is set
                var o = self._ov; self._ov = null;
                String(text).split(";").forEach(function (part) {
                    var i = part.indexOf(":"), k = part.slice(0, i).trim();
                    if (i > 0 && o[k] != null) self.setAttribute(k, o[k]);
                });
                self._apply();
            });
        }
        _act(kind, value) {
            if (kind === "color") this._paint(value);
            else if (kind === "view") this._goView(value);
            else if (kind === "clip") { this.setAttribute("clip", value); this.setAttribute("animate", ""); }
            else if (kind === "model") this.setAttribute("src", value);
        }
        // ── Placement: a background (data-wc-place) is scrolled through with its section, or group of sections, and stays on the screen meanwhile
        _area() { return this.hasAttribute("data-wc-place") ? this.parentElement || document.documentElement : this; }
        // how far along its range the page is scrolled, 0..100: a range taller than the screen is scrolled through from its top at the top of the screen to its
        // bottom at the bottom; a shorter one from entering the screen to leaving it
        _scrollPct() {
            var a = this._area(), vh = innerHeight, p;
            if (a === document.documentElement) p = scrollY / Math.max(1, document.documentElement.scrollHeight - vh);
            else { var r = a.getBoundingClientRect(); p = r.height > vh ? -r.top / (r.height - vh) : (vh - r.top) / (vh + r.height); }
            return Math.min(1, Math.max(0, p)) * 100;
        }
        // ── Effects (data-wc-fx="spin-scroll:1 tilt-mouse:15 float:6"): read once per change of the attribute ──
        _fxAll() {
            var t = this.getAttribute("data-wc-fx") || "";
            if (t !== this._fxTxt) {
                var o = {};
                t.trim().split(/\s+/).forEach(function (tk) { var kv = tk.split(":"); if (kv[0] && kv[1] !== undefined && kv[1] !== "" && isFinite(Number(kv[1]))) o[kv[0]] = Number(kv[1]); });
                this._fxTxt = t; this._fxObj = o;
            }
            return this._fxObj;
        }
        _fxv(n) { var v = this._fxAll()[n]; return v == null ? 0 : v; }
        // the editor turns them on for the selected model (`_fxPreview`), with the scroll at `_fxScrub` (0..100) instead of the real one
        _fxOn() { return !editingNow() || !!this._fxPreview; }
        _fxPct() { return editingNow() ? this._fxScrub || 0 : this._scrollPct(); }
        _pinTick() {
            // data-wc-pin (a Scroll story's Keep on screen): the model stays in the middle of the screen from when it gets there until its story's last
            // step has scrolled past; the page's layout is not touched (it is offset with `translate`). data-wc-place: it stays at the top of its section.
            var pin = this.hasAttribute("data-wc-pin"), on = (pin || this.hasAttribute("data-wc-place")) && !editingNow(), cur = this._pinned || 0;
            if (!on) { if (cur) { this.style.removeProperty("translate"); this._pinned = 0; } return; }
            var b = this.getBoundingClientRect(), nat = b.top - cur, a = this._area(), bottom, off = pin ? Math.max(0, (innerHeight - b.height) / 2) : 0;
            if (pin) { var st = this._findSteps(); bottom = st.length ? Math.max.apply(null, st.map(function (e) { return e.getBoundingClientRect().bottom; })) : (this.parentElement || document.documentElement).getBoundingClientRect().bottom; }
            else bottom = a === document.documentElement ? document.documentElement.scrollHeight - scrollY : a.getBoundingClientRect().bottom;
            var s = Math.max(0, Math.min(off - nat, bottom - nat - b.height));
            s = Math.round(s * 10) / 10;
            if (s === cur) return;
            this._pinned = s;
            if (s) this.style.translate = "0 " + s + "px"; else this.style.removeProperty("translate");
        }
        _size() {
            if (!this._renderer) return;
            var w = this.clientWidth || 1, h = this.clientHeight || 1, pr = Math.min(window.devicePixelRatio || 1, 2);
            if (this._sw !== w || this._sh !== h || this._spr !== pr || this._sr !== this._renderer) { // (setting the same size again clears the canvas: not on every scroll step)
                this._sw = w; this._sh = h; this._spr = pr; this._sr = this._renderer;
                this._renderer.setPixelRatio(pr);
                this._renderer.setSize(w, h, false);
                this._camera.aspect = w / h;
            }
            this._camera.updateProjectionMatrix();
            this._frame();
        }
        // draw once; keep drawing only while something moves (spin, animation) and the model is on screen
        _frame() {
            var self = this;
            if (!this._renderer || !this._ground || this._raf) return;
            this._raf = requestAnimationFrame(function () {
                self._raf = 0;
                if (!self._renderer) return;
                self._pinTick();
                self._story();
                var dt = self._last ? Math.min((performance.now() - self._last) / 1000, 0.1) : 0;
                // effects (data-wc-fx): on the page itself, and in the editor only while it previews them
                var fx = self._fxOn() ? self._fxAll() : {}, tilt = fx["tilt-mouse"] || 0, fl = fx.float || 0, D2R = Math.PI / 180;
                var tx = tilt ? -(self._my || 0) * tilt * D2R : 0, ty = tilt ? (self._mx || 0) * tilt * D2R : 0;
                self._tx = (self._tx || 0) + (tx - (self._tx || 0)) * 0.12;
                self._ty = (self._ty || 0) + (ty - (self._ty || 0)) * 0.12;
                var settling = Math.abs(tx - self._tx) > 0.0005 || Math.abs(ty - self._ty) > 0.0005;
                var p = fx["spin-scroll"] || fx["zoom-scroll"] ? self._fxPct() / 100 : 0;
                var zf = 1 + (fx["zoom-scroll"] || 0) / 100 * p;
                if (zf !== (self._zf || 1)) { self._zf = zf; self._camera.zoom = (self._zoom0 || 1) * zf; self._camera.updateProjectionMatrix(); }
                var moving = self._visible && (flag(self, "auto-rotate") || (self._mixer && flag(self, "animate")) || fl > 0 || settling);
                self._last = moving ? performance.now() : 0;
                if (moving) {
                    if (flag(self, "auto-rotate")) self._spin += dt * num(self, "rotate-speed", 30, -360, 360) * Math.PI / 180;
                    if (self._mixer && flag(self, "animate")) self._mixer.update(dt);
                }
                // scroll-rotate: the model turns by that many degrees while the element crosses the screen (half either way)
                var sr = num(self, "scroll-rotate", 0, -720, 720), turn = 0;
                if (sr) { var b = self.getBoundingClientRect(); turn = (Math.min(1, Math.max(0, (innerHeight - b.top) / (innerHeight + b.height))) - 0.5) * sr * Math.PI / 180; }
                self._spinner.rotation.y = self._spin + turn + (fx["spin-scroll"] || 0) * p * 2 * Math.PI + self._ty;
                self._spinner.rotation.x = self._tx;
                self._spinner.position.y = fl ? Math.sin(performance.now() / 1000 * 1.6) * fl / 100 : 0;
                if (self._visible) { self._renderer.render(self._scene, self._camera); self._place(); }
                if (moving) self._frame();
            });
        }
    }
    customElements.define("wc-model", WcModel);
    // The model an element acts on: the one it is (or is inside: a hotspot), else the one in the nearest ancestor that has only one.
    function modelFor(t) {
        var link = t.getAttribute("data-wc-for");
        if (link) { var lm = document.getElementById(link); return lm && lm._act ? lm : null; } // linked to its model by id
        var m = t.tagName === "WC-MODEL" ? t : t.closest("wc-model");
        for (var p = t.parentElement; !m && p; p = p.parentElement) {
            var ms = p.querySelectorAll("wc-model");
            if (ms.length > 1) return null;
            if (ms.length) m = ms[0];
        }
        return m && m._act ? m : null;
    }
    // A click on (or inside) an element with data-wc-act does what it says to the model it belongs to. Only on the page itself: while editing, a click selects.
    document.addEventListener("click", function (e) {
        var t = e.target && e.target.closest ? e.target.closest("[data-wc-act]") : null;
        if (!t || editingNow()) return;
        var m = modelFor(t);
        if (!m) return;
        // a button that is a link to "#" (the editor's Button) would jump the page to its top: the click is for the model
        if (t.tagName === "A" && /^#?$/.test((t.getAttribute("href") || "").trim())) e.preventDefault();
        String(t.getAttribute("data-wc-act")).split("|").forEach(function (a) {
            a = a.trim();
            var i = a.indexOf(" ");
            if (i > 0) m._act(a.slice(0, i), a.slice(i + 1).trim());
        });
    });
    // Hover: data-wc-hover="view rotation:0 40 0 | color #e11d48" does that while the pointer is over the element (or the model, when it has it), and the
    // model goes back to how it was when the pointer leaves.
    function hoverOf(e) { return e.target && e.target.closest ? e.target.closest("[data-wc-hover]") : null; }
    document.addEventListener("pointerover", function (e) {
        var t = hoverOf(e);
        if (!t || editingNow() || (e.relatedTarget && t.contains(e.relatedTarget))) return; // (moving about inside it is still being over it)
        var m = modelFor(t);
        if (!m || m._hovered === t) return;
        m._hovered = t;
        if (!m._hoverBase) { // how it is now, to go back to: its pose (as text) and its colour
            var b = m._pose(null);
            m._hoverBase = "rotation:" + b.rotation.join(" ") + "; model-position:" + b["model-position"].join(" ") + "; model-size:" + b["model-size"] + "; camera-angle:" + b["camera-angle"] + "; camera-distance:" + b["camera-distance"];
            m._colRest = m._col || null;
        }
        String(t.getAttribute("data-wc-hover")).split("|").forEach(function (a) {
            a = a.trim();
            var i = a.indexOf(" "), k = a.slice(0, i), v = a.slice(i + 1).trim();
            if (k === "view") m._goView(v, "keep"); else if (k === "color") m._paint(v);
        });
    });
    document.addEventListener("pointerout", function (e) {
        var t = hoverOf(e);
        if (!t || editingNow() || (e.relatedTarget && t.contains(e.relatedTarget))) return;
        var m = modelFor(t);
        if (!m || m._hovered !== t) return;
        m._hovered = null;
        if (m._hoverBase) { m._goView(m._hoverBase, "rest"); m._paint(m._colRest || "reset"); m._hoverBase = null; }
    });
}

/** The script as it is saved in the page: the element's code, run once. */
export const MODEL_SCRIPT = `${MODEL_MARK}(${modelRuntime.toString().replace("__THREE_VERSION__", THREE_VERSION).replace("__THREE_CDN__", THREE_CDN)})();`;
