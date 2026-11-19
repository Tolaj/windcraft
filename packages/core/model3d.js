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
    // The transform handles the editor shows on a picked model (move, turn, size): fetched only when one is asked for
    var gizmoLib = null;
    function loadGizmo() {
        if (!gizmoLib) gizmoLib = load().then(function () { return import(CDN + "three@" + VERSION + "/examples/jsm/controls/TransformControls.js/+esm"); }).then(function (m) { return m.TransformControls; });
        return gizmoLib;
    }
    var num = function (el, name, def, min, max) {
        var v = el.getAttribute(name);
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
            return ["src", "controls", "zoom", "auto-rotate", "rotate-speed", "animate", "rotation", "camera-angle", "camera-distance", "fov", "environment", "exposure", "light", "light-color", "background", "scroll-rotate", "shadow", "clip", "model-size", "model-position"];
        }
        constructor() {
            super();
            var root = this.attachShadow({ mode: "open" });
            // the element is a block that fills its width by default; any class (w-*, h-*, aspect-*, hidden…) outranks these
            root.innerHTML = '<style>:host{display:block;position:relative;width:100%;height:20rem;overflow:hidden}' +
                'canvas{display:block;width:100%;height:100%;touch-action:pan-y}' +
                '.s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:12px system-ui,sans-serif;color:#737373;text-align:center;padding:8px}' +
                '.s[hidden]{display:none}.h{position:absolute;inset:0;overflow:hidden;pointer-events:none}.h>div{position:absolute;left:0;top:0;pointer-events:auto;will-change:transform}</style>' +
                '<slot class="s"></slot><div class="s" part="error" hidden></div><div class="h"></div>';
            this._slot = root.querySelector("slot");
            this._err = root.querySelector("[part=error]");
            this._root = root;
            this._layer = root.querySelector(".h");
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
            this._onScroll = this._onScroll || function () { if (num(self, "scroll-rotate", 0, -720, 720)) self._frame(); };
            window.addEventListener("scroll", this._onScroll, { passive: true });
            this._mo = this._mo || new MutationObserver(function () { self._hotspots(); self._frame(); });
            this._mo.observe(this, { childList: true, attributes: true, attributeFilter: ["data-position", "slot"], subtree: true });
            this._hotspots();
            this._build();
        }
        disconnectedCallback() {
            this._on = false;
            if (this._ro) { this._ro.disconnect(); this._io.disconnect(); }
            window.removeEventListener("scroll", this._onScroll);
            if (this._mo) this._mo.disconnect();
            this._dispose();
        }
        attributeChangedCallback(name, was, now) {
            if (!this._on || was === now) return;
            if (name === "src") return this._build();
            this._apply();
        }
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
            var r3 = turns(this.getAttribute("rotation"));
            if (!this._dragging) { // (not while a handle is being dragged: it is the one moving it)
                this._pivot.rotation.set(r3[0] * Math.PI / 180, r3[1] * Math.PI / 180, r3[2] * Math.PI / 180);
                // `model-position`: where the model sits in the scene, in its own units
                var pp = String(this.getAttribute("model-position") || "").trim().split(/[\s,]+/).map(Number);
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
                    tc.setSize(2.2);
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
            tc.getHelper().visible = true;
            tc.enabled = true;
            this._frame();
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
            var az = Math.atan2(p.x, p.z), r3 = turns(this.getAttribute("rotation")), D = Math.PI / 180;
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
        _size() {
            if (!this._renderer) return;
            var w = this.clientWidth || 1, h = this.clientHeight || 1;
            this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this._renderer.setSize(w, h, false);
            this._camera.aspect = w / h;
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
                var dt = self._last ? Math.min((performance.now() - self._last) / 1000, 0.1) : 0;
                var moving = self._visible && (flag(self, "auto-rotate") || (self._mixer && flag(self, "animate")));
                self._last = moving ? performance.now() : 0;
                if (moving) {
                    if (flag(self, "auto-rotate")) self._spin += dt * num(self, "rotate-speed", 30, -360, 360) * Math.PI / 180;
                    if (self._mixer && flag(self, "animate")) self._mixer.update(dt);
                }
                // scroll-rotate: the model turns by that many degrees while the element crosses the screen (half either way)
                var sr = num(self, "scroll-rotate", 0, -720, 720), turn = 0;
                if (sr) { var b = self.getBoundingClientRect(); turn = (Math.min(1, Math.max(0, (innerHeight - b.top) / (innerHeight + b.height))) - 0.5) * sr * Math.PI / 180; }
                self._spinner.rotation.y = self._spin + turn;
                if (self._visible) { self._renderer.render(self._scene, self._camera); self._place(); }
                if (moving) self._frame();
            });
        }
    }
    customElements.define("wc-model", WcModel);
}

/** The script as it is saved in the page: the element's code, run once. */
export const MODEL_SCRIPT = `${MODEL_MARK}(${modelRuntime.toString().replace("__THREE_VERSION__", THREE_VERSION).replace("__THREE_CDN__", THREE_CDN)})();`;
