import { closeColorPicker } from "../color-picker.js";
import { CSS_PROP_LIST } from "../css-props.js";
import { panelStore } from "../panel-state.js";
import { $, S, data, frame, model, send } from "./base.js";
import { activate, docs, scheduleLayout, selectFrame, wraps } from "./designs.js";
import { pathKey, renderLayers } from "./layers.js";
import { FLOAT_ACTIONS, ftb, renderFloat, renderSel } from "./frame-handles.js";
import { handleKey, keyZoom, setSpace, setTool } from "./toolbar.js";
import { applyView, fitTo, handleWheel, layout, positions, view } from "./plane.js";
import { commit, updateChrome } from "./docs.js";
import { convertGesture, renderInspector, setRotation } from "./inspector.js";
import { updateCodeHighlight } from "./code-panel.js";
import { suggestLayout } from "./layout-chip.js";
import { syncLayoutPicker } from "./layout-picker.js";
import { setCanvasOnly } from "./canvas-mode.js";
import { chooseModel } from "./model-samples.js";
import { storyDrawer } from "./scroll-drawer.js";

let pendingKey = "";

// A drag that starts in the page and leaves the frame: the frame gets no more pointer events outside itself (it is a separate
// document), so a shape drawn up to the edge never finished. While a gesture runs, this window passes the pointer on, in the page's own units.
let following = null;
function followOutside() {
    if (following) return;
    const forward = (ev) => (e) => {
        const r = frame.getBoundingClientRect(), k = r.width / (frame.offsetWidth || r.width);
        send({ cmd: "extPointer", ev, x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey });
    };
    const move = forward("move"), up = (e) => { forward("up")(e); stopFollowing(); };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    following = { move, up };
}
function stopFollowing() {
    if (!following) return;
    window.removeEventListener("pointermove", following.move, true);
    window.removeEventListener("pointerup", following.up, true);
    following = null;
}
export const cmd = (msg, key = "") => { pendingKey = key; send(key ? { key, ...msg } : msg); };

// A design takes a moment to load into the canvas (its Tailwind styling, its pictures): until it does, the canvas shows a loading
// message instead of an empty frame in a corner. It goes at the first "ready" from the frame, or after 15 seconds whatever happens.
let announced = false;
function hideBoot() {
    const b = document.getElementById("boot");
    if (b) { b.classList.add("hidden"); b.classList.remove("flex"); }
    // the first design is painted: whoever opened the editor (a page, the embedding dialog) can take its own loading message away
    if (!announced) { announced = true; document.dispatchEvent(new CustomEvent("wc-editor-ready")); }
}

/** Registers this part's listeners and does its first draw (called once, in order, by editor.js). */
/**
 * A frame that follows its content's height can't follow content sized by the screen (min-h-screen, h-screen, 100vh) plus
 * anything more (a border, padding, a second section): each time the frame grows to fit, the screen grows with it and the content
 * outgrows it again, without end (the frame's own stylesheet gives the usual Tailwind classes a fixed screen height; inline 100vh and
 * the like can still do it). Growth that repeats by the same or a growing amount, quickly, is that loop: the frame stops following it
 * and keeps the height it has. A height that is smaller starts over.
 */
const growth = [];
function viewportLoop(h) {
    const now = performance.now(), prev = S.frameHeight || 0;
    if (h <= prev) { growth.length = 0; return false; }
    growth.push({ t: now, d: h - prev });
    while (growth.length && now - growth[0].t > 2000) growth.shift();
    const last = growth.slice(-4);
    // the same amount each time (a screen-tall block plus a header), or more each time (two screen-tall blocks double it)
    return last.length >= 4 && last.every((g, i) => i === 0 || g.d >= last[i - 1].d - 1);
}

// ── 3D model files for the canvas ────────────────────────────────────────────
// The canvas is a sandboxed frame: the browser keeps no cache for it, so a model would download again on every load of the canvas (seconds for a
// large one). Its page asks here instead (model3d.js, agent.js): this page has the cache, and keeps the last few files in memory as well.
const modelFiles = new Map(); // url -> Promise<ArrayBuffer>, most recent last
const MODEL_KEEP = 6;
function loadModelFile(url, onProgress) {
    if (modelFiles.has(url)) { const p = modelFiles.get(url); modelFiles.delete(url); modelFiles.set(url, p); return p; }
    const p = (async () => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        // (the length the server gives can be that of the compressed file, while the reader hands over the plain bytes: it only drives the bar)
        const total = Number(r.headers.get("content-length")) || 0;
        if (!r.body) return r.arrayBuffer();
        const parts = [], rd = r.body.getReader();
        let at = 0, last = 0;
        for (;;) {
            const { done, value } = await rd.read();
            if (done) break;
            parts.push(value); at += value.length;
            if (onProgress && performance.now() - last > 100) { last = performance.now(); onProgress(at, Math.max(total, at)); }
        }
        const out = new Uint8Array(at);
        let o = 0;
        for (const v of parts) { out.set(v, o); o += v.length; }
        return out.buffer;
    })();
    modelFiles.set(url, p);
    p.catch(() => modelFiles.delete(url));
    while (modelFiles.size > MODEL_KEEP) modelFiles.delete(modelFiles.keys().next().value);
    return p;
}
async function fetchModel(win, id, url) {
    if (!/^https?:/i.test(url)) return win.postMessage({ cmd: "modelData", id, error: "not a web address" }, "*");
    try {
        const buf = await loadModelFile(url, (loaded, total) => win.postMessage({ cmd: "modelData", id, progress: true, loaded, total }, "*"));
        const copy = buf.slice(0); // the frame gets its own copy (moved, not copied again); this page keeps the original
        win.postMessage({ cmd: "modelData", id, buf: copy }, "*", [copy]);
    } catch (err) {
        win.postMessage({ cmd: "modelData", id, error: String(err && err.message || err) }, "*");
    }
}

export function init() {
    // The canvas is moved by panning (view), never by scrolling: a scrollIntoView inside the page frame can still scroll it, which shifts the strip,
    // the toolbars and every overlay away from the design. Any such scroll is put back at once.
    const cv = $("canvas");
    cv.addEventListener("scroll", () => { if (cv.scrollTop || cv.scrollLeft) { cv.scrollTop = 0; cv.scrollLeft = 0; } });
    const boot = document.getElementById("boot");
    if (boot && (data.htmlCode || data.id)) { boot.classList.remove("hidden"); boot.classList.add("flex"); setTimeout(hideBoot, 15000); }

    // ── Messages from the frame ──────────────────────────────────────────────────
    window.addEventListener("message", (e) => {
        const m = e.data || {};
        if (m.type === "preview-height" && e.source !== frame.contentWindow) {
            for (const [key, en] of wraps) {
                if (en.ghost && en.ghost.contentWindow === e.source) { docs.get(key).height = Math.max(120, Math.min(6000, m.height)); scheduleLayout(); return; }
            }
            return;
        }
        if (m.type === "modelFetch" && e.source && typeof m.url === "string") return fetchModel(e.source, m.id, m.url);
        if (e.source !== frame.contentWindow) return;
        // a document that was replaced (switching designs reloads the frame) can still have messages in flight
        if (m.load !== undefined && m.load !== S.loadSeq) return;
        if (S.handingOver) return; // the page being left, still in the frame for a moment (activate)
        // Pressing inside the page doesn't take focus from a field in the bar. Let that field commit (to the element it was showing)
        // before the selection moves on, so the bar then rebuilds for the new element instead of keeping a stale field.
        // An edit reports the same element back: that must not blur a field still in use (a colour picker being dragged).
        const otherElement = m.type === "selected" && !(S.selected && m.info && pathKey(S.selected.path) === pathKey(m.info.path));
        if (otherElement || (m.type === "gesture" && m.on)) {
            closeColorPicker(); // its colours belong to the element it was opened for
            const a = document.activeElement;
            if (a && ftb.contains(a) && a.matches("input, select")) a.blur();
        }
        if (m.type === "zoomKey") return keyZoom(m.key);
        if (m.type === "tw-names") { panelStore.set({ animations: Array.isArray(m.animations) ? m.animations.filter((n) => /^[a-z][a-z0-9-]*$/.test(n)) : [] }); return; }
        if (m.type === "wcGoto") { // an interaction's "Go to page" while Interact runs the page: open that page here and carry on in Interact
            if (S.mode === "preview" && m.load === S.loadSeq && docs.has(m.key)) activate(m.key);
            return;
        }
        if (m.type === "reveal") { // a part of the page to bring into view (a section picked in the Motion strip): the canvas pans to its top
            const pos = positions()[S.curKey] || { x: 0, y: 0 }, H = $("canvas").clientHeight;
            const top = view.y + (pos.y + m.y) * view.z;
            if (top < 60 || top > H * 0.45) { view.y += 90 - top; applyView(); }
            return;
        }
        if (m.type === "wheel") {
            const pos = positions()[S.curKey] || { x: 0, y: 0 };
            return handleWheel({ dx: m.dx, dy: m.dy, zoomKey: m.zoom, cx: view.x + (pos.x + m.x) * view.z, cy: view.y + (pos.y + m.y) * view.z });
        }
        if (m.type === "ready") {
            storyDrawer(null); // a fresh page: no story is open in the drawer
            if (S.storyNext) { S.storyNext = false; send({ cmd: "storyOpen" }); } // unless a Scroll story was just added: the frame opens its first one
            if (S.switching) {
                S.switching = false;
                // the frame moves over now (layout below) but shows a moment later, once Tailwind has styled the new design; the
                // snapshot is right in the meantime
                const key = S.curKey, token = S.switchToken;
                setTimeout(() => {
                    if (token !== S.switchToken || key !== S.curKey) return;
                    const en = wraps.get(key);
                    if (en && en.ghost) { en.ghost.remove(); en.ghost = null; }
                    frame.style.visibility = "";
                }, 120);
            }
            if (!S.history.length) { S.history = [m.html]; S.hIndex = 0; model.markup = m.html; if (!S.isNew) S.savedMarkup = m.html; }
            S.tree = m.tree;
            renderLayers();
            updateChrome();
            layout();
            if (!S.viewTouched) fitTo([S.curKey]);
            S.sentZoom = 0;
            applyView();
            setTimeout(hideBoot, 150); // the first paint of the fitted design, then the loading message goes
            send({ cmd: "tool", tool: S.tool });
            send({ cmd: "cssProps", props: CSS_PROP_LIST });
            send({ cmd: "previewState", state: panelStore.get().st }); // a reloaded frame shows the picked state again
            renderFloat();
            syncLayoutPicker(); // an empty page offers ready layouts
        } else if (m.type === "height" || m.type === "preview-height") {
            if (viewportLoop(m.height)) return;
            S.frameHeight = m.height;
            layout();
            if (!S.viewTouched) fitTo([S.curKey]);
        } else if (m.type === "changed") {
            S.tree = m.tree;
            if (m.silent) model.markup = m.html;
            else commit(m.html, m.key || pendingKey);
            pendingKey = "";
            if (m.info) S.selected = m.info;
            if (m.body) S.pageBody = m.body;
            renderLayers();
            renderInspector();
            renderFloat();
            syncLayoutPicker();
        } else if (m.type === "rotate") {
            // the rotate handle was let go: the angle is written like the panel's rotation field does
            if (S.selected && pathKey(S.selected.path) === pathKey(m.path)) setRotation(m.value);
        } else if (m.type === "radius") {
            // a corner dot was dragged: apply the radius the same way the toolbar does (class in Tailwind mode, style otherwise)
            if (S.selected && pathKey(S.selected.path) === pathKey(m.path)) FLOAT_ACTIONS.radius(m.value);
        } else if (m.type === "info") {
            // the same element with fresh numbers (styles finished loading): update quietly
            if (S.selected && m.info && pathKey(S.selected.path) === pathKey(m.info.path)) {
                S.selected = m.info;
                renderInspector();
                renderFloat();
            }
        } else if (m.type === "typing") {
            model.markup = m.html;
            updateChrome();
        } else if (m.type === "picked") { // the element clicked for an interaction's target (the panel asked for it)
            const done = S.pickCb;
            S.pickCb = null;
            if (done) done(m.path);
        } else if (m.type === "overlay") {
            S.selData = m;
            renderSel();
        } else if (m.type === "chooseModel") {
            chooseModel(cmd);
        } else if (m.type === "story") { // the Scroll story open in the drawer (null: closed)
            storyDrawer(m.info);
        } else if (m.type === "model") {
            S.modelPart = m.part;
            S.modelMode = m.mode;
            renderFloat(true);
        } else if (m.type === "editing") {
            S.editingInfo = m;
            renderFloat();
        } else if (m.type === "gesture") {
            S.gestureOn = m.on;
            m.on ? followOutside() : stopFollowing();
            renderFloat();
        } else if (m.type === "tool") {
            setTool(m.tool, true);
        } else if (m.type === "space") {
            setSpace(m.down);
        } else if (m.type === "selected") {
            if (m.info) setCanvasOnly(false); // an element of a frame is picked: that frame is the one being worked on
            // once something is picked the person is working on the design: the view stays where it is from now on. Fitting it again
            // whenever the height changes (an edit, a font arriving) would zoom and move the page under the pointer between two clicks.
            if (m.info) S.viewTouched = true;
            // the same element reporting again (after an edit) keeps its open menu; a different one starts fresh
            const newSelection = !(S.selected && m.info && pathKey(S.selected.path) === pathKey(m.info.path));
            if (newSelection) {
                S.ftMenu = false; S.ftPop = null; S.ftSides = {};
                // a state (Hover, Focus...) belongs to the element it was picked for: the next one starts at its normal look. The screen size stays (it is the frame's).
                if (panelStore.get().st) { panelStore.set({ st: "" }); send({ cmd: "previewState", state: "" }); }
            }
            S.selected = m.info;
            S.frameSel = null;
            updateCodeHighlight(newSelection); // find it in the code, and scroll there when it is a different element
            renderLayers();
            renderInspector();
            renderFloat();
        } else if (m.type === "body") {
            S.pageBody = m.info; // the page's styling (its body), shown under the page panel
            if (!S.selected) renderInspector();
        } else if (m.type === "frameClick") {
            selectFrame(); // the empty part of the design was clicked: the frame, with its handles and the page panel
        } else if (m.type === "hoverFrame") {
            const en = wraps.get(S.curKey);
            if (en) en.wrap.classList.toggle("bodyhover", Boolean(m.on));
        } else if (m.type === "layoutHint") {
            suggestLayout(m); // absolute boxes that line up: offer the row, column or grid that explains them
        } else if (m.type === "convert") {
            convertGesture(m.items || []);
        } else if (m.type === "key") {
            handleKey(m);
        }
    });
}
