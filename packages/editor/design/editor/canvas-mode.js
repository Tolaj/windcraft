import { $, S, data } from "./base.js";
import { renderLayers } from "./layers.js";
import { renderInspector } from "./inspector.js";
import { closeCodePanel } from "./code-panel.js";
import { syncLayoutPicker } from "./layout-picker.js";
import { docs, wraps } from "./designs.js";

// ── Nothing selected: the canvas itself ────────────────────────────────────────────────────────────────────────────
// A click on the empty canvas selects nothing, as in Figma. No frame is being worked on, so the Code tool is off (and its panel
// closes), the top-left names the project instead of a page, Layers has nothing to list, and the Properties panel shows the canvas:
// its background and dot grid (kept in this browser), and the frames on it. Picking a frame or an element ends it.

const PREF = "wc:canvas";
const DEFAULT_LOOK = { bg: "#e5e5e5", dots: true };
let look = { ...DEFAULT_LOOK };
try { look = { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(PREF) || "{}") }; } catch { /* storage is optional */ }

/** The canvas's background and dot grid, as set in the panel. */
export const canvasLook = () => ({ ...look });
/** Changes the canvas's look ({ bg, dots }), keeps it for next time and shows it. */
export function setCanvasLook(patch) {
    look = { ...look, ...patch };
    try { localStorage.setItem(PREF, JSON.stringify(look)); } catch { /* storage is optional */ }
    paintCanvas();
    renderInspector();
}
function paintCanvas() {
    const c = $("canvas");
    c.style.backgroundColor = look.bg;
    // the dots stay readable on a dark canvas: lighter dots there
    const dark = (() => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(look.bg); return m ? (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128 : false; })();
    c.style.backgroundImage = look.dots ? `radial-gradient(circle, ${dark ? "#4a4a4a" : "#b4b4b4"} 0.95px, transparent 1.25px)` : "none";
    c.dataset.dark = dark ? "1" : ""; // the frames' names turn light on a dark canvas (styles.css)
}

/** Enters or leaves the nothing-selected state. Leaving it (a frame or an element is picked) also ends a selection of several pages. */
export function setCanvasOnly(on) {
    if (!on && S.framesSel.length) setFramesSel([]);
    if (S.canvasOnly === on) return;
    S.canvasOnly = on;
    syncCanvasMode();
}

/**
 * Several pages selected (no page is being worked on, so the rest of the chrome is as with nothing selected): each gets the
 * selected outline, the Properties panel says how many, and dragging one moves them all (designs.js).
 */
export function setFramesSel(keys) {
    S.framesSel = keys.filter((k) => docs.has(k));
    wraps.forEach((en, key) => en.wrap.classList.toggle("multi", S.framesSel.includes(key)));
    renderInspector();
}
/** Brings the chrome in line with the state: the Code tool, the name at the top left, Layers and the Properties panel. */
export function syncCanvasMode() {
    const off = S.canvasOnly, btn = $("codeBtn");
    btn.disabled = off;
    btn.classList.toggle("opacity-40", off);
    btn.classList.toggle("pointer-events-none", off);
    btn.title = off ? "Select a frame to see its code" : "Code";
    if (off) closeCodePanel();
    const name = $("designsName");
    name.textContent = off ? (data.project && data.project.name) || "Untitled project" : data.title || "Untitled page";
    $("designsBtn").title = off ? "Project" : "Pages";
    renderLayers();
    renderInspector();
    syncLayoutPicker(); // the empty-page tip belongs to a frame: not while nothing is selected
}

/** Registers this part (called once by editor.js). */
export function init() {
    paintCanvas();
}

