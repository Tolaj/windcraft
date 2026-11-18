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

/** The attributes, in the order the panel lists them: { name, type: "text"|"bool"|"number"|"select", def, min, max, step, options, label, hint }. `def` is what the script does without it. */
export const MODEL_ATTRS = Object.freeze([
    { name: "src", type: "text", def: "", label: "Model (.glb)", hint: "A URL, or a file embedded in the page" },
    { name: "controls", type: "bool", def: false, label: "Drag to orbit" },
    { name: "zoom", type: "bool", def: false, label: "Scroll to zoom", hint: "Off, scrolling over the model scrolls the page" },
    { name: "auto-rotate", type: "bool", def: false, label: "Auto-rotate" },
    { name: "rotate-speed", type: "number", def: 30, min: -360, max: 360, step: 5, label: "Spin speed (°/s)" },
    { name: "animate", type: "bool", def: false, label: "Play its animation" },
    { name: "rotation", type: "text", def: "0 0 0", label: "Rotation x y z (°)", hint: "Where the model starts, e.g. 0 45 0" },
    { name: "camera-angle", type: "number", def: 10, min: -80, max: 80, step: 1, label: "Camera angle (°)" },
    { name: "camera-distance", type: "number", def: 1, min: 0.3, max: 4, step: 0.05, label: "Camera distance", hint: "1 fits the whole model; less is closer" },
    { name: "fov", type: "number", def: 40, min: 10, max: 90, step: 1, label: "Field of view (°)" },
    { name: "environment", type: "select", def: "studio", options: ["studio", "none"], label: "Lighting" },
    { name: "exposure", type: "number", def: 1, min: 0, max: 4, step: 0.05, label: "Exposure" },
    { name: "light", type: "number", def: 1, min: 0, max: 6, step: 0.1, label: "Key light" },
    { name: "light-color", type: "text", def: "#ffffff", label: "Light colour" },
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
            return ["src", "controls", "zoom", "auto-rotate", "rotate-speed", "animate", "rotation", "camera-angle", "camera-distance", "fov", "environment", "exposure", "light", "light-color", "background"];
        }
        constructor() {
            super();
            var root = this.attachShadow({ mode: "open" });
            // the element is a block that fills its width by default; any class (w-*, h-*, aspect-*, hidden…) outranks these
            root.innerHTML = '<style>:host{display:block;position:relative;width:100%;height:20rem;overflow:hidden}' +
                'canvas{display:block;width:100%;height:100%;touch-action:pan-y}' +
                '.s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:12px system-ui,sans-serif;color:#737373;text-align:center;padding:8px}' +
                '.s[hidden]{display:none}</style><slot class="s"></slot><div class="s" part="error" hidden></div>';
            this._slot = root.querySelector("slot");
            this._err = root.querySelector("[part=error]");
            this._root = root;
            this._seq = 0;
            this._on = false;
        }
        connectedCallback() {
            this._on = true;
            // inside the editor's canvas the model only looks: the editor owns the pointer there
            this._editing = !!document.querySelector("script[data-wc-agent]");
            var self = this;
            if (!this._ro) {
                this._ro = new ResizeObserver(function () { self._size(); });
                this._io = new IntersectionObserver(function (e) { self._visible = e[0].isIntersecting; self._frame(); });
            }
            this._ro.observe(this);
            this._io.observe(this);
            this._visible = true;
            this._build();
        }
        disconnectedCallback() {
            this._on = false;
            if (this._ro) { this._ro.disconnect(); this._io.disconnect(); }
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
            this._renderer = this._scene = this._camera = this._controls = this._pivot = this._mixer = null;
        }
        _build() {
            var self = this, seq = ++this._seq, src = this.getAttribute("src");
            this._dispose();
            this._seq = seq;
            this._err.hidden = true;
            this._slot.hidden = false;
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
                var pivot = new T.Group();
                scene.add(pivot);
                self._renderer = renderer; self._scene = scene; self._camera = camera; self._pivot = pivot; self._key = key; self._T = T; self._L = L;
                self._env = pmrem.fromScene(new L.RoomEnvironment(), 0.04).texture;
                pmrem.dispose();
                var controls = new L.OrbitControls(camera, renderer.domElement);
                controls.addEventListener("change", function () { self._frame(); });
                self._controls = controls;
                new L.GLTFLoader().load(src, function (gltf) {
                    if (seq !== self._seq || !self._on) return;
                    var obj = gltf.scene, box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), mid = box.getCenter(new T.Vector3());
                    obj.position.sub(mid); // centred on the pivot, so it spins about its own middle
                    pivot.add(obj);
                    self._radius = Math.max(size.length() / 2, 1e-3);
                    if (gltf.animations && gltf.animations.length) {
                        self._mixer = new T.AnimationMixer(obj);
                        gltf.animations.forEach(function (c) { self._mixer.clipAction(c).play(); });
                        self._clock = new T.Clock();
                    }
                    self._slot.hidden = true;
                    self._apply();
                    self.dispatchEvent(new CustomEvent("load"));
                }, undefined, function (e) { self._fail("Couldn't load the model" + (e && e.message ? ": " + e.message : "")); });
            }, function () { self._fail("Couldn't load Three.js (offline?)"); });
        }
        // every attribute that is not the file: cheap, so it runs on each change
        _apply() {
            if (!this._renderer || !this._pivot.children.length) return;
            var T = this._T, c = this._camera, r = this._renderer;
            var r3 = turns(this.getAttribute("rotation"));
            this._pivot.rotation.set(r3[0] * Math.PI / 180, r3[1] * Math.PI / 180, r3[2] * Math.PI / 180);
            c.fov = num(this, "fov", 40, 10, 90);
            // far enough that the model's bounding sphere (a little tightened) fits both ways: the narrower of the two view angles decides
            var half = c.fov * Math.PI / 360, aspect = (this.clientWidth || 1) / (this.clientHeight || 1);
            half = Math.min(half, Math.atan(Math.tan(half) * aspect));
            var dist = this._radius * 0.8 / Math.sin(half) * num(this, "camera-distance", 1, 0.3, 4);
            var el = num(this, "camera-angle", 10, -80, 80) * Math.PI / 180;
            c.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
            c.near = dist / 100; c.far = dist * 100;
            c.lookAt(0, 0, 0);
            c.updateProjectionMatrix();
            var ctl = this._controls;
            ctl.enabled = flag(this, "controls") && !this._editing;
            ctl.enableZoom = flag(this, "zoom");
            ctl.enablePan = false;
            ctl.target.set(0, 0, 0);
            ctl.update();
            this._renderer.domElement.style.pointerEvents = ctl.enabled ? "" : "none";
            r.toneMappingExposure = num(this, "exposure", 1, 0, 4);
            this._scene.environment = this.getAttribute("environment") === "none" ? null : this._env;
            this._key.intensity = num(this, "light", 1, 0, 6);
            try { this._key.color.set(this.getAttribute("light-color") || "#ffffff"); } catch (e) { /* a colour the browser doesn't know: white */ }
            var bg = this.getAttribute("background");
            r.setClearColor(bg || 0x000000, bg ? 1 : 0);
            this._size();
            this._frame();
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
            if (!this._renderer || !this._pivot.children.length || this._raf) return;
            this._raf = requestAnimationFrame(function () {
                self._raf = 0;
                if (!self._renderer) return;
                var dt = self._last ? Math.min((performance.now() - self._last) / 1000, 0.1) : 0;
                var moving = self._visible && (flag(self, "auto-rotate") || (self._mixer && flag(self, "animate")));
                self._last = moving ? performance.now() : 0;
                if (moving) {
                    if (flag(self, "auto-rotate")) self._pivot.rotation.y += dt * num(self, "rotate-speed", 30, -360, 360) * Math.PI / 180;
                    if (self._mixer && flag(self, "animate")) self._mixer.update(dt);
                }
                if (self._visible) self._renderer.render(self._scene, self._camera);
                if (moving) self._frame();
            });
        }
    }
    customElements.define("wc-model", WcModel);
}

/** The script as it is saved in the page: the element's code, run once. */
export const MODEL_SCRIPT = `${MODEL_MARK}(${modelRuntime.toString().replace("__THREE_VERSION__", THREE_VERSION).replace("__THREE_CDN__", THREE_CDN)})();`;
