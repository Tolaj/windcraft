// The small toolbar that floats next to whatever is selected (text, a shape, or a whole frame).
// It only renders markup; editor.js places it and turns its clicks into edits.
import { rgbToHex } from "./css-props.js";
import { parseFx } from "../../core/model3d.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONS = {
    bold: icon('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
    italic: icon('<path d="M10 5h8M6 19h8M15 5 9 19"/>'),
    underline: icon('<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'),
    link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    left: icon('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    center: icon('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    right: icon('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
    justify: icon('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
    radius: icon('<path d="M5 19v-7a7 7 0 0 1 7-7h7"/>'),
    border: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4.5" width="16" height="3.4" rx="1.2"/><rect x="4" y="10.3" width="16" height="2.4" rx="1.1"/><rect x="4" y="15.6" width="16" height="1.4" rx=".7"/></svg>',
    spacing: icon('<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke-dasharray="3 2.6"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.6"/>'),
    sides: icon('<rect x="4" y="4" width="16" height="16" rx="3.5" stroke-dasharray="3.4 3"/>'),
    corners: icon('<path d="M4 9V7a3 3 0 0 1 3-3h2M15 4h2a3 3 0 0 1 3 3v2M20 15v2a3 3 0 0 1-3 3h-2M9 20H7a3 3 0 0 1-3-3v-2"/>'),
    none: icon('<circle cx="12" cy="12" r="8"/><path d="M6.3 6.3l11.4 11.4"/>'),
    solid: icon('<path d="M4 12h16"/>'),
    dashed: icon('<path d="M3 12h4M10 12h4M17 12h4"/>'),
    dotted: icon('<path d="M4 12h.01M8 12h.01M12 12h.01M16 12h.01M20 12h.01" stroke-width="2.4"/>'),
    layouts: icon('<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M9.5 4v16M9.5 10h11"/>'),
    turn: icon('<path d="M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>'),
    move: icon('<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>'),
    rotate: icon('<ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-25 12 12)"/><path d="M12 3a9 9 0 0 1 0 18" stroke-dasharray="2.6 2.4"/>'),
    scale: icon('<rect x="4" y="9" width="11" height="11" rx="1.5"/><path d="M13 11l7-7M14.5 4H20v5.5"/>'),
    tilt: icon('<path d="M4 15.5 12 20l8-4.5"/><path d="M4 11 12 15.5 20 11 12 6.5z"/><path d="M15.5 3.5 19 5l-1 3.6"/>'),
    float: icon('<path d="M7 13.5a5 5 0 0 0 10 0 5 5 0 0 0-10 0z"/><path d="M8 21c1.3-.8 2.7-.8 4 0s2.7.8 4 0"/><path d="M12 3v3M10.5 4.5 12 3l1.5 1.5"/>'),
    scroll: icon('<rect x="7" y="2.5" width="10" height="15" rx="5"/><path d="M12 6.5v3"/><path d="M8.5 20 12 22.5 15.5 20"/>'),
    swap: icon('<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.6"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.6"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.6"/>'),
    look: icon('<circle cx="12" cy="12" r="3"/><path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20"/>'),
    spin: icon('<ellipse cx="12" cy="17" rx="8" ry="3"/><path d="M4.5 11.5C5.3 9 8 7.2 12 7.2s6.7 1.8 7.5 4.3M19.5 11.5l-2.4-1.8M19.5 11.5l.5-3"/>'), // a turntable with an arrow going round it
    play: icon('<path d="M8 5.5v13l10-6.5z"/>'),
    shadow: icon('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" fill-opacity=".4" stroke="none"/>'), // a ball shaded on one side
    reset: icon('<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5"/>'),
    more: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
};

export const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "button", "label", "li", "strong", "em", "small", "blockquote", "td", "th", "figcaption"]);
const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96];

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : ""; };
const familyOf = (css) => {
    const first = String(css || "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();
    if (/mono|courier|consolas|menlo/.test(first)) return "mono";
    if (/^(georgia|times|garamond|palatino|serif|ui-serif|cambria)/.test(first)) return "serif";
    return "sans";
};

const btn = (act, svg, title, on, arg) => `<button type="button" class="tbtn ${on ? "on" : ""}" data-ft="${act}"${arg ? ` data-arg="${arg}"` : ""} title="${title}">${svg}</button>`;
const swatch = (kind, value, title) => `<label class="swatch" title="${title}" style="background:${value || "#fff"}${value ? "" : ";background-image:linear-gradient(135deg,transparent 46%,#e5484d 46%,#e5484d 54%,transparent 54%)"}"><input type="color" data-ftcol="${kind}" value="${value || "#000000"}"></label>`;

function moreMenu(st) {
    const abs = st.sel && st.sel.geom && st.sel.geom.abs;
    const item = (act, label, hint = "") => `<button type="button" data-ft="${act}" class="flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[12px] hover:bg-neutral-100"><span>${label}</span><span class="text-neutral-400">${hint}</span></button>`;
    return `<div class="pop absolute right-0 top-9 z-40 w-52 p-1">
        ${item("dup", "Duplicate", "Ctrl+D")}${item("up", "Move earlier")}${item("down", "Move later")}
        ${item("front", "Bring to front", "Ctrl+Shift+]")}${item("back", "Send to back", "Ctrl+Shift+[")}
        ${item("free", abs ? "Back to page flow" : "Free position")}
        ${st.sel && st.sel.count > 1 ? item("group", "Group", "Ctrl+G") : ""}${st.sel && (st.sel.group || (abs && st.sel.leaf === false)) ? item("ungroup", "Ungroup", "Ctrl+Shift+G") : ""}
        ${item("props", "All properties")}
        <div class="my-1 h-px bg-neutral-100"></div>${item("del", "Delete", "Del")}
    </div>`;
}

// Layouts and designs for the selected element: for any element but plain text (a button counts)
// (a 3D model has no layouts: that place has its list of models instead, where the wireframe button is for everything else)
const layoutsBtn = (st) => (st.sel && st.sel.tag === "wc-model" && !st.editing ? btn("mchoose", ICONS.swap, st.sel.attrs && st.sel.attrs.src ? "Change the model: free models or your own file" : "Choose a model: free models or your own file")
    : st.sel && st.sel.tag !== "body" && !st.editing && (st.kind !== "text" || st.sel.tag === "button") ? btn("layouts", ICONS.layouts, "Layouts and designs for this element") : "");
const more = (st) => `<span class="sep"></span>${layoutsBtn(st)}<div class="relative">${btn("more", ICONS.more, "More", st.menu)}${st.menu ? moreMenu(st) : ""}</div>`;

function textBar(st) {
    const cs = (st.sel && st.sel.computed) || {};
    const size = num(cs["font-size"]);
    const fam = familyOf(cs["font-family"]);
    const color = rgbToHex(cs.color || "") || "#000000";
    const fill = rgbToHex(cs["background-color"] || "");
    const fmt = st.editing && st.fmt ? st.fmt : { bold: parseInt(cs["font-weight"], 10) >= 600, italic: cs["font-style"] === "italic", underline: /underline/.test(cs["text-decoration-line"] || "") };
    const align = ["center", "right", "justify"].includes(cs["text-align"]) ? cs["text-align"] : "left";
    const hasFill = st.sel && ["button", "a"].includes(st.sel.tag);
    return `<select data-ftsel="family" title="Font">${[["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]].map(([v, l]) => `<option value="${v}" ${fam === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input type="number" min="1" max="400" data-ftin="size" value="${size}" list="ft-sizes" title="Size">
        <datalist id="ft-sizes">${SIZES.map((n) => `<option value="${n}"></option>`).join("")}</datalist>
        <span class="sep"></span>${swatch("text", color, "Text color")}${hasFill ? swatch("fill", fill, "Fill color") : ""}
        <span class="sep"></span>${btn("bold", ICONS.bold, "Bold", fmt.bold)}${btn("italic", ICONS.italic, "Italic", fmt.italic)}${btn("underline", ICONS.underline, "Underline", fmt.underline)}${btn("link", ICONS.link, "Link")}
        <span class="sep"></span>${btn("align", ICONS[align], `Align ${align}`)}${st.editing ? "" : boxButtons(st)}${more(st)}`;
}

// Border, Radius and Spacing: three buttons, each opening a small panel above the bar (see popHtml)
const popBtn = (st, key, svg, title) => `<button type="button" class="tbtn ${st.pop === key ? "on" : ""}" data-ft="pop" data-arg="${key}" title="${title}">${svg}</button>`;
const boxButtons = (st) => `<span class="sep"></span>${popBtn(st, "border", ICONS.border, "Border")}${popBtn(st, "radius", ICONS.radius, "Corner radius")}${popBtn(st, "spacing", ICONS.spacing, "Padding and margin")}`;

// A 3D model: what it does (turn, spin, orbit, play, shadow) and the box buttons; the rest is in the panel's 3D sections
function modelBar(st) {
    const at = (st.sel && st.sel.attrs) || {}, cs = (st.sel && st.sel.computed) || {};
    const on = (n) => at[n] != null && String(at[n]).trim().toLowerCase() !== "false";
    const sw = (n, svg, title) => btn("mattr", svg, title, on(n), n);
    const fx = parseFx(at["data-wc-fx"]), fxb = (n, svg, title) => btn("mfx", svg, title, fx[n] != null, n); // an effect of data-wc-fx, on or off
    const fill = rgbToHex(cs["background-color"] || "");
    const view = at.rotation != null || at["camera-angle"] != null;
    // the model button picks the model inside the scene (as a double-click on it does); its tools appear to the left of it while it is picked
    const tool = (m, svg, title) => btn("mmode", svg, title, st.picked && st.mode === m, m);
    const empty = !at.src; // no model yet: only "Choose a model" and the box's own buttons make sense
    const tools = st.picked && !empty ? `${tool("move", ICONS.move, "Move: drag an arrow")}${tool("rotate", ICONS.rotate, "Turn: drag a ring")}${tool("scale", ICONS.scale, "Size: drag a cube")}${tool("view", ICONS.look, "Look around it: drag to set the starting view")}<span class="sep"></span>` : "";
    return `${tools}${empty ? "" : btn("mpart", ICONS.turn, st.picked ? "The model is picked: its tools are on the left. Click to let go" : "Pick the model inside the scene (or double-click it)", st.picked)}${view && !empty ? btn("mreset", ICONS.reset, "Back to the default view") : ""}
        ${empty ? "" : '<span class="sep"></span>'}${empty ? "" : btn("mstory", ICONS.scroll, st.sel && st.sel.story ? "Scroll story: pose the model for each section" : "Scroll story: the model moves as the page scrolls, posed for each section")}${sw("auto-rotate", ICONS.spin, "Spin slowly")}${fxb("tilt-mouse", ICONS.tilt, "Tilt toward the pointer")}${fxb("float", ICONS.float, "Float gently up and down")}${sw("animate", ICONS.play, "Play the model's animation")}${sw("shadow", ICONS.shadow, "Ground shadow")}
        <span class="sep"></span>${swatch("fill", fill, "Fill color")}${boxButtons(st)}${more(st)}`;
}

function shapeBar(st) {
    const cs = (st.sel && st.sel.computed) || {};
    const fill = rgbToHex(cs["background-color"] || "");
    const hasText = st.sel && (st.sel.leaf === false || st.sel.tag === "wc-model") ? false : true; // a box with boxes in it, or a 3D model, has no text colour
    return `<span class="lbl2">Fill</span>${swatch("fill", fill, "Fill color")}${hasText ? `<span class="lbl2">Text</span>${swatch("text", rgbToHex(cs.color || "") || "#000000", "Text color")}` : ""}
        ${boxButtons(st)}${more(st)}`;
}

// ── The panels ───────────────────────────────────────────────────────────────
const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0; };
const field = (label, prop, value, min = 0) => `<label class="ffield"><span class="fl">${label}</span><input type="number" ${min === null ? "" : `min="${min}"`} step="1" data-ftp="${prop}" value="${value}"><span class="fu">px</span></label>`;
const sidesBtn = (key, open, svg = ICONS.sides) => `<button type="button" class="tbtn sidebtn ${open ? "on" : ""}" data-ft="side" data-arg="${key}" title="${open ? "Same on all sides" : "Each side on its own"}">${svg}</button>`;
/** Whether a group shows one field per side: your last choice, or automatically when the sides differ. */
const isOpen = (st, key, differs) => (st.sides && st.sides[key] !== undefined ? st.sides[key] : differs);
const same = (a) => a.every((v) => v === a[0]);
/** Four per-side fields in two rows, with the switch back to "all sides" at the end of the first row. */
const grid4 = (f, btn) => `<div class="fgrid">${f[0]}${f[1]}${btn}${f[2]}${f[3]}</div>`;

function borderPanel(st, cs) {
    const sides = ["top", "right", "bottom", "left"];
    const w = sides.map((d) => px(cs[`border-${d}-width`]));
    const seen = sides.find((d, i) => w[i] > 0) || "top";
    const kind = w.every((v) => v === 0) ? "none" : ["dashed", "dotted"].includes(cs[`border-${seen}-style`]) ? cs[`border-${seen}-style`] : "solid";
    const hex = (rgbToHex(cs[`border-${seen}-color`] || "") || "#000000").toUpperCase();
    const open = isOpen(st, "border", !same(w));
    const seg = ["none", "solid", "dashed", "dotted"].map((k) => `<button type="button" data-ft="bstyle" data-arg="${k}" title="${k[0].toUpperCase() + k.slice(1)}" class="${kind === k ? "on" : ""}">${ICONS[k]}</button>`).join("");
    const widths = open
        ? grid4(["top", "right", "bottom", "left"].map((d, i) => field(d[0].toUpperCase(), `bw-${d}`, w[i])), sidesBtn("border", true))
        : `<div class="frow">${field(ICONS.border, "bw-all", w[0])}${sidesBtn("border", false)}</div>`;
    return `<div class="fseg">${seg}</div>
        <div class="frow"><label class="swatch big" style="background:${hex}"><input type="color" data-ftp="border-color" value="${hex}"></label><input type="text" class="fhex" data-ftp="border-color-hex" value="${hex}" spellcheck="false"></div>
        ${widths}`;
}

function radiusPanel(st, cs) {
    const r = ["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => px(cs[`border-${c}-radius`]));
    const open = isOpen(st, "radius", !same(r));
    return open
        ? grid4([["TL", "tl", 0], ["TR", "tr", 1], ["BL", "bl", 2], ["BR", "br", 3]].map(([l, k, i]) => field(l, `r-${k}`, r[i])), sidesBtn("radius", true, ICONS.corners))
        : `<div class="frow">${field("", "r-all", r[0])}${sidesBtn("radius", false, ICONS.corners)}</div>`;
}

function spacingPanel(st, cs) {
    const group = (key, title, prefix, min) => {
        const v = ["top", "right", "bottom", "left"].map((d) => px(cs[`${prefix}-${d}`]));
        const open = isOpen(st, key, v[0] !== v[2] || v[1] !== v[3]);
        const body = open
            ? grid4([["T", "top", 0], ["R", "right", 1], ["B", "bottom", 2], ["L", "left", 3]].map(([l, d, i]) => field(l, `${key}-${d}`, v[i], min)), sidesBtn(key, true))
            : `<div class="frow">${field("H", `${key}-h`, v[1], min)}${field("V", `${key}-v`, v[0], min)}${sidesBtn(key, false)}</div>`;
        return `<div class="fttl">${title}</div>${body}`;
    };
    return `${group("padding", "Padding", "padding", 0)}${group("margin", "Margin", "margin", null)}`;
}

/** The open panel, if any; placed by CSS above the bar (or below it when the bar is near the top). */
function popHtml(st) {
    if (!st.pop || !st.sel) return "";
    const cs = st.sel.computed || {};
    const body = st.pop === "border" ? borderPanel(st, cs) : st.pop === "radius" ? radiusPanel(st, cs) : spacingPanel(st, cs);
    return `<div class="ftpop">${body}</div>`;
}

export const DEVICES = [[1280, "Desktop"], [768, "Tablet"], [390, "Mobile"]];
function frameBar(st) {
    const f = st.frame;
    const preset = DEVICES.some(([w]) => w === f.w);
    // a Custom button appears once the frame has a size that isn't a preset, and keeps your last manual size within reach
    const custom = f.custom || (!preset ? { w: f.w, h: f.auto ? null : f.h } : null);
    const customBtn = custom
        ? `<button type="button" data-ftdev="custom" title="${custom.w} × ${custom.h || "auto"}" class="h-7 rounded-lg px-2 text-[12px] font-medium hover:bg-neutral-100 ${!preset ? "bg-neutral-100" : ""}">Custom</button>`
        : "";
    return `${DEVICES.map(([w, l]) => `<button type="button" data-ftdev="${w}" class="h-7 rounded-lg px-2 text-[12px] font-medium hover:bg-neutral-100 ${f.w === w ? "bg-neutral-100" : ""}">${l}</button>`).join("")}${customBtn}
        <span class="sep"></span><span class="lbl2">W</span><input type="number" min="120" max="8000" data-ftin="fw" value="${f.w}"><span class="lbl2">H</span><input type="number" min="120" max="20000" data-ftin="fh" value="${f.auto ? "" : f.h}" placeholder="auto" title="Leave empty to grow with the content">`;
}

export function toolbarHtml(st) {
    if (st.kind === "frame") return frameBar(st);
    return (st.kind === "text" ? textBar(st) : st.kind === "model" ? modelBar(st) : shapeBar(st)) + popHtml(st);
}

export const FAMILY_STACKS = {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};
