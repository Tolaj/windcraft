import { config } from "../config.js";
import { parseComponentSource } from "../../playground/component-source.js";

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const data = config.data;

// A two-finger swipe across the editor must never be taken for the browser's Back gesture (it leaves the design behind): the page
// does not chain a scroll that ran out to the browser's own navigation.
document.documentElement.style.overscrollBehavior = "none";
if (document.body) document.body.style.overscrollBehavior = "none";

export const S = {};
S.parsed = parseComponentSource(data.htmlCode);
S.mode = "edit";
S.frameHeight = 600;
S.selected = null;
S.tree = null;
S.history = [];
S.hIndex = -1;
S.isNew = !data.id;
S.savedMarkup = S.isNew ? "" : S.parsed.markup;
S.lastKey = "";
S.lastTime = 0;
S.loadSeq = 0;
S.viewTouched = false;
S.sentZoom = 0;
S.tool = "move";
S.curKey = data.id || "draft-0";
S.draftKey = data.draftId ? S.curKey : null; // a design opened from a Figma draft: its first save sends the draft's id, so its Figma data moves to the new page
S.switching = false;
S.switchToken = 0;
S.frameAt = null;
S.handingOver = false;
S.lastCustom = null;
S.editingInfo = null;
S.gestureOn = false;
S.frameSel = null;
S.ftMenu = false;
S.ftPop = null;
S.ftSides = {};
S.selData = null;
S.leftOpen = false;

export const model = { markup: S.parsed.markup };
export const isTailwindScript = (s) => s.src && /tailwindcss/i.test(s.src);

// ── State ────────────────────────────────────────────────────────────────────

export const DEFAULT_W = 1280;
export const collapsed = new Set();

export const frame = $("frame");
export const send = (msg) => frame.contentWindow && frame.contentWindow.postMessage(msg, "*");
// Nothing on the canvas is selected (a click on the empty canvas, as in Figma): no frame is the one being worked on, so the Code tool
// is off, the toolbar names the project, Layers is empty and the Properties panel shows the canvas itself (canvas-mode.js).
S.canvasOnly = false;
// Several pages selected at once (Ctrl/Cmd+A on the empty canvas, or a box dragged over several): their keys. They move together.
S.framesSel = [];
