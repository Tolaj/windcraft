// The Design tab's style sections after Position, Layout and the flex / grid item, named as a frontend developer knows them:
// Typography, Background, Border, Effects, Transform, Motion and Interaction, then a box to add any class or CSS (Spacing is in figma-sections.js). Each
// starts from what the element already has: a background, a border or an effect it has is a row; one it has not is not, and the
// section's + adds it. Set values are solid and marked with where they come from (a class or CSS), with a × to take them off;
// defaults are faint. Every edit goes through the same actions as the rest of the panel, so it is written where the value comes
// from: setProp · setProps · resetProp · setPropLive · setPropDone · setPropsLive · setPropsDone · applyValue · applyColor · addClasses
import { html, useState } from "../vendor/preact-htm.js";
import { rgbToHex } from "./css-props.js";
import { srcOf, shownOf, val, variant } from "./panel-model.js";
import { useUi } from "./panel-state.js";
import { TextInput, ColorInput } from "./controls.js";
import { GroupColor } from "./group-controls.js";
import { I, IconBtn, NumField, FSection, Sub, PropField, PropSelect, TwField, TwSelect, num, owns, has, off, comp, srcKind, srcNote, atVariant } from "./figma-sections.js";
import { twShown } from "../../core/prop-tailwind.js";
import { brandScale, normalizeTheme } from "../../core/theme.js";
import { data } from "./editor/base.js";
import { PropRow } from "./prop-sections.js";
import { TRIGGERS, readTrigger } from "../../core/animation-triggers.js";
import { REVEALS } from "../../core/text-effects.js";
import { parseRules, writeRules, changeParts, changeFrom, WHEN, DO } from "../../core/interactions.js";
import { tailwindClasses } from "./tailwind-classes.js";

const SIDES = ["top", "right", "bottom", "left"];
const CORNERS = [["top-left", "radiusTL", "↖"], ["top-right", "radiusTR", "↗"], ["bottom-right", "radiusBR", "↘"], ["bottom-left", "radiusBL", "↙"]];
/** The alpha of an rgb() / rgba() colour: its fourth value, if it has one. */
const alphaOf = (c) => {
    const m = String(c).match(/^rgba?\(([^)]*)\)$/);
    const parts = m ? m[1].split(/[\s,/]+/).filter(Boolean) : [];
    if (parts.length < 4) return 1;
    return parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
};
const clear = (c) => !c || c === "transparent" || alphaOf(c) === 0;
/** The same value on every side (or corner), or "Mixed". */
const same = (s, props) => { const v = props.map((p) => comp(s, p)); return v.every((x) => x === v[0]) ? num(v[0]) : "Mixed"; };
const anyHas = (s, props) => props.some((p) => has(s, p));
/**
 * Whether the element has something: with a breakpoint or state picked (md:, hover:), whether it has a class for it there (the
 * computed look is the normal one, which says nothing about hover); else what the page shows (`showing`).
 */
const present = (s, props, showing) => (variant() ? props.some((p) => has(s, p)) : showing);
/** The hex of a Tailwind colour name (black, blue-500), read from a hidden probe in the editor's own page, which has Tailwind. */
let probe = null;
function hexOf(name) {
    if (!name) return "#000000";
    if (/^(#|rgb|hsl)/.test(name)) return rgbToHex(name) || name;
    const brand = /^brand-(\d+)$/.exec(name); // the project's own scale: the editor's page has no project theme to read it from
    if (brand) return brandScale(normalizeTheme(data.theme).brand)[brand[1]] || "#000000";
    if (!probe) { probe = document.createElement("span"); probe.style.display = "none"; document.body.appendChild(probe); }
    probe.className = `bg-${name.replace(/\/\d+$/, "")}`;
    return rgbToHex(getComputedStyle(probe).backgroundColor) || "#000000";
}
/** A × for a field made of several properties (every side, every corner): takes off each one the element sets, or null when none is. */
const resetAll = (s, actions, props) => (props.some((p) => has(s, p)) ? () => props.forEach((p) => off(s, actions, p)) : null);
const firstSrc = (s, props) => props.map((p) => srcKind(s, p)).find(Boolean) || "";
/** A + that opens a short menu of what can be added (only what the element does not have yet). `items`: [value, label]. */
const AddMenu = ({ title, items, onPick }) => (items.length ? html`<label class="ib addsel" title=${title}>${I.plus}<select onChange=${(e) => { const v = e.target.value; e.target.value = ""; if (v) onPick(v); }}>
    <option value="" selected>${title}</option>${items.map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select></label>` : null);
/** − takes a style off the element (its tooltip says which); a row that has no value yet gets × to cancel instead. */
const Remove = ({ title, onClick }) => html`<${IconBtn} icon=${I.minus} title=${title} onClick=${onClick} />`;
const Cancel = ({ onClick }) => html`<${IconBtn} icon=${I.minus} title="Remove" onClick=${onClick} />`;

/** A colour as a row: a swatch, its value (a Tailwind name where a class gives it, else hex), its opacity when not full. */
function ColorRow({ s, actions, p, all, group, onRemove, removeTitle, title, label }) {
    const src = srcOf(s, p), c = comp(s, p), at = atVariant(s, p);
    // at a picked breakpoint / state: its class's colour (the swatch too); else a Tailwind name where a class gives it, or the hex
    const atName = at ? twShown(p, at.token) : null;
    const hex = atName ? hexOf(atName) : rgbToHex(c) || "#000000", a = atName ? 1 : alphaOf(c);
    const shown = atName ?? (src.source === "tailwind" ? shownOf(s, p, src) : hex.replace(/^#/, "").toUpperCase());
    const value = (v) => (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim()) ? `#${v.trim()}` : v);
    // `all`: the colour goes on every one of these properties (a border's four sides), as one class where it can
    const commit = (v) => (all ? actions.setProps(all, value(v), group) : actions.setProp(p, value(v)));
    return html`<div class="frow">
        <div class=${`nf ${has(s, p) ? "" : "unset"} ${srcKind(s, p) ? `src-${srcKind(s, p)}` : ""}`} title=${`${title || p} · ${srcNote(s, p)}`}>
            ${label && html`<span class="nfl">${label}</span>`}
            <${ColorInput} class="cin" value=${hex} title="Pick a colour" hook=${{ "data-propcolor": p }}
                onLive=${(h) => (all ? actions.setPropsLive(all, h, group) : actions.setPropLive(p, h))}
                onDone=${(h, input) => (all ? actions.setPropsDone(all, h, group, input) : actions.setPropDone(p, h, input))} />
            <${TextInput} class="nfi" list="dl-colors" value=${shown} onCommit=${commit} />
            ${a < 1 && html`<span class="nfu">${Math.round(a * 100)}%</span>`}</div>
        ${onRemove && html`<${Remove} title=${removeTitle || "Remove"} onClick=${onRemove} />`}</div>`;
}

// ── Typography ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TYPE = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "color", "text-decoration-line", "text-transform", "font-style", "white-space"];
const WEIGHTS = [["100", "100 Thin"], ["200", "200 Extra light"], ["300", "300 Light"], ["400", "400 Regular"], ["500", "500 Medium"], ["600", "600 Semibold"], ["700", "700 Bold"], ["800", "800 Extra bold"], ["900", "900 Black"]];
// the three Tailwind families as words (font-sans...), with their stack as the CSS to write when the element is styled with CSS
const STACKS = { sans: "ui-sans-serif, system-ui, sans-serif", serif: "ui-serif, Georgia, serif", mono: "ui-monospace, SFMono-Regular, monospace" };
const MORE_TYPE = [
    { p: "text-decoration-line", l: "Decor", t: "select", o: ["none", "underline", "line-through", "overline"] },
    { p: "text-transform", l: "Case", t: "select", o: ["none", "uppercase", "lowercase", "capitalize"] },
    { p: "font-style", l: "Style", t: "select", o: ["normal", "italic"] },
    { p: "white-space", l: "Wrap", t: "select", o: ["normal", "nowrap", "pre", "pre-wrap", "pre-line"] },
];
export function TypographySection({ s, actions }) {
    const [open, setOpen] = useState(false);
    const [more, setMore] = useState(false);
    const ui = useUi();
    const shown = open || s.ownText || s.tag === "body" || anyHas(s, TYPE);
    if (!shown) return html`<${FSection} title="Typography" extra=${html`<${IconBtn} icon=${I.plus} title="Set this element's text style (its children inherit it)" onClick=${() => setOpen(true)} />`} />`;
    const fam = comp(s, "font-family"), src = srcOf(s, "font-family");
    const famShown = src.source === "tailwind" ? shownOf(s, "font-family", src) : (fam.split(",")[0] || "").replace(/["']/g, "").trim();
    const setFont = (t) => { const v = t.trim().toLowerCase(); return STACKS[v] ? actions.setProp("font-family", v, STACKS[v]) : actions.setProp("font-family", t.trim()); };
    const align = comp(s, "text-align");
    const al = (v, icon, title) => html`<${IconBtn} icon=${icon} title=${title} on=${align === v || (v === "left" && align === "start")} onClick=${() => actions.setProp("text-align", v)} />`;
    const extra = MORE_TYPE.filter((c) => more || has(s, c.p));
    const clamp = val(s, "lineClamp", ui), trunc = val(s, "textOverflow", ui);
    const own = TYPE.filter((p) => has(s, p));
    const removeAll = () => {
        own.forEach((p) => off(s, actions, p, "inherit"));
        if (clamp) actions.applyValue("lineClamp", "");
        if (trunc) actions.applyValue("textOverflow", "");
        setOpen(false); setMore(false);
    };
    return html`<${FSection} title="Typography" extra=${html`${(own.length > 0 || clamp || trunc || (open && !s.ownText)) && html`<${Remove} title=${own.length || clamp || trunc ? "Remove this element's text styles (it goes back to what it inherits)" : "Close"} onClick=${removeAll} />`}
        <${IconBtn} icon=${I.dots} on=${more} title=${more ? "Fewer text settings" : "Decoration, case, italic, wrapping, line clamp, truncate"} onClick=${() => setMore(!more)} />`}>
        <div class="frow"><${NumField} label="Font" title=${`font-family: ${fam} · ${srcNote(s, "font-family")} (type any font, or sans / serif / mono)`} value=${famShown} list="dl-fonts"
            set=${has(s, "font-family")} src=${srcKind(s, "font-family")} onReset=${has(s, "font-family") ? () => off(s, actions, "font-family", "inherit") : null} onCommit=${setFont} /></div>
        <div class="frow">
            <${PropSelect} s=${s} actions=${actions} p="font-weight" title="Weight" options=${WEIGHTS} />
            <${PropField} s=${s} actions=${actions} p="font-size" label="Size" title="Font size (px, or text-sm, 2xl...)" list="dl-fontSize" />
        </div>
        <div class="frow">
            <${PropField} s=${s} actions=${actions} p="line-height" label="Line" title="Line height" list="dl-leading" />
            <${PropField} s=${s} actions=${actions} p="letter-spacing" label="Letter" title="Letter spacing" list="dl-tracking" />
        </div>
        <div class="frow"><div class="ibg wide">${al("left", I.textL, "Align left")}${al("center", I.textC, "Align centre")}${al("right", I.textR, "Align right")}${al("justify", I.textJ, "Justify")}</div></div>
        <${ColorRow} s=${s} actions=${actions} p="color" title="Text colour" />
        ${extra.map((c) => html`<${PropRow} s=${s} actions=${actions} c=${c} />`)}
        ${(more || clamp) && html`<div class="frow"><${TwField} s=${s} k="lineClamp" label="Clamp" title="Show at most this many lines (line-clamp-*)" actions=${actions} />
            ${clamp && html`<${Remove} title="Remove the line clamp" onClick=${() => actions.applyValue("lineClamp", "")} />`}</div>`}
        ${(more || trunc) && html`<div class="frow"><${TwSelect} s=${s} k="textOverflow" label="Overflow" title="Cut long text off with … (truncate)" actions=${actions} />
            ${trunc && html`<${Remove} title="Remove the text overflow" onClick=${() => actions.applyValue("textOverflow", "")} />`}</div>`}
    </${FSection}>`;
}

// ── Background: a colour, a gradient, an image ───────────────────────────────────────────────────────────────────────────
export function BackgroundSection({ s, actions }) {
    const ui = useUi();
    const [adding, setAdding] = useState("");
    const color = present(s, ["background-color"], !clear(comp(s, "background-color"))), img = comp(s, "background-image");
    const grad = Boolean(val(s, "bgImage", ui)) || adding === "gradient";
    const imgSet = Boolean(img) && img !== "none" && !/gradient/.test(img), image = imgSet || adding === "image";
    const cssGrad = /gradient/.test(img) && !val(s, "bgImage", ui); // a gradient from CSS: shown as its value
    // a value this element sets comes off; one from the design's CSS is covered (transparent / none)
    const remove = (p) => (owns(s, p) ? actions.resetProp(p) : actions.setProp(p, p === "background-color" ? "transparent" : "none"));
    const add = (kind) => {
        if (kind === "color") actions.setProp("background-color", "white");
        if (kind === "gradient") { setAdding("gradient"); actions.applyValue("bgImage", "bg-gradient-to-r"); }
        if (kind === "image") setAdding("image");
    };
    const items = [!color && ["color", "Colour"], !grad && !cssGrad && ["gradient", "Gradient"], !image && ["image", "Bg image"]].filter(Boolean);
    return html`<${FSection} title="Background" extra=${html`<${AddMenu} title="Add a background" items=${items} onPick=${add} />`}>
        ${color && html`<${ColorRow} s=${s} actions=${actions} p="background-color" title="Background colour" removeTitle="Remove the background colour" onRemove=${() => remove("background-color")} />`}
        ${grad && html`<div class="frow"><${TwSelect} s=${s} k="bgImage" label="Gradient" title="Gradient direction (bg-gradient-to-*)" actions=${actions} />
                <${Remove} title="Remove the gradient" onClick=${() => { setAdding(""); ["bgImage", "gradFrom", "gradVia", "gradTo"].forEach((k) => actions.applyValue(k, "")); }} /></div>
            <${GroupColor} s=${s} k="gradFrom" label="From" actions=${actions} /><${GroupColor} s=${s} k="gradVia" label="Via" actions=${actions} /><${GroupColor} s=${s} k="gradTo" label="To" actions=${actions} />`}
        ${(image || cssGrad) && html`<div class="frow">
                <${NumField} label=${cssGrad ? "Gradient" : "Bg image"} title=${`A picture behind the content (background-image) · ${srcNote(s, "background-image")}`} placeholder="Paste an image address…"
                    value=${imgSet || cssGrad ? shownOf(s, "background-image", srcOf(s, "background-image")) : ""}
                    set=${has(s, "background-image")} src=${srcKind(s, "background-image")} onCommit=${(t) => { setAdding(""); actions.setProp("background-image", /^(https?:|\/|data:)/.test(t.trim()) ? `url("${t.trim()}")` : t); }} />
                ${imgSet || cssGrad ? html`<${Remove} title="Remove the bg image" onClick=${() => remove("background-image")} />` : html`<${Cancel} onClick=${() => setAdding("")} />`}</div>
            ${imgSet && html`<div class="frow"><${PropSelect} s=${s} actions=${actions} p="background-size" label="Size" options=${[["auto", "Auto"], ["cover", "Cover"], ["contain", "Contain"]]} />
                <${PropSelect} s=${s} actions=${actions} p="background-repeat" label="Repeat" options=${[["repeat", "Repeat"], ["no-repeat", "No repeat"], ["repeat-x", "Across"], ["repeat-y", "Down"]]} /></div>
            <div class="frow"><${PropField} s=${s} actions=${actions} p="background-position" label="Position" title="background-position (center, top, 50% 20%...)" /></div>`}`}
    </${FSection}>`;
}

// ── Border: radius, the border itself, outline and ring ──────────────────────────────────────────────────────────────────
export function BorderSection({ s, actions }) {
    const ui = useUi();
    const widths = SIDES.map((d) => `border-${d}-width`), styles = SIDES.map((d) => `border-${d}-style`), corners = CORNERS.map(([c]) => `border-${c}-radius`);
    const on = present(s, [...SIDES.map((d) => `border-${d}-width`), "border-top-color"], SIDES.some((d) => parseFloat(comp(s, `border-${d}-width`)) > 0 && comp(s, `border-${d}-style`) !== "none"));
    const outline = Boolean(comp(s, "outline-style")) && comp(s, "outline-style") !== "none", ring = Boolean(val(s, "ring", ui));
    const [sides, setSides] = useState(false);
    const [each, setEach] = useState(false);
    const mixedW = same(s, widths) === "Mixed", mixedR = same(s, corners) === "Mixed";
    const addBorder = () => {
        actions.setProps(widths, "1", "borderWidth", ["borderT", "borderR", "borderB", "borderL"]);
        if (comp(s, "border-top-style") === "none") actions.setProps(styles, "solid", "borderStyle"); // Tailwind's base styles already make it solid
    };
    // a border from classes loses them (its colour and style too); one from CSS (or the design's stylesheet) gets a width of 0
    const removeBorder = () => (widths.some((p) => srcOf(s, p).source === "tailwind")
        ? ["borderWidth", "borderT", "borderR", "borderB", "borderL", "borderColor", "borderStyle"].forEach((k) => actions.applyValue(k, ""))
        : actions.setProps(widths, "0", "borderWidth"));
    const removeRadius = () => (corners.some((p) => srcOf(s, p).source === "tailwind")
        ? ["radius", ...CORNERS.map(([, k]) => k)].forEach((k) => actions.applyValue(k, ""))
        : actions.setProps(corners, "0", "radius"));
    const add = (kind) => {
        if (kind === "border") addBorder();
        if (kind === "outline") actions.setProp("outline", "2px solid blue-500");
        if (kind === "ring") actions.applyValue("ring", "2");
    };
    const items = [!on && ["border", "Border (1px)"], !outline && ["outline", "Outline"], !ring && ["ring", "Ring"]].filter(Boolean);
    const style = comp(s, "border-top-style");
    return html`<${FSection} title="Border" extra=${html`<${AddMenu} title="Add a border, outline or ring" items=${items} onPick=${add} />`}>
        <div class="frow">
            <${NumField} label="Radius" title=${`border-radius · ${srcNote(s, "border-top-left-radius")}`} value=${same(s, corners)} set=${anyHas(s, corners)} src=${firstSrc(s, corners)} list="dl-radius"
                onReset=${corners.some((p) => has(s, p)) ? removeRadius : null} onCommit=${(t) => actions.setProps(corners, t, "radius", CORNERS.map(([, k]) => k))} />
            <${IconBtn} icon=${I.corners} on=${each || mixedR} title="Each corner on its own" onClick=${() => setEach(!each)} />
        </div>
        ${(each || mixedR) && html`<div class="frow two2">${CORNERS.map(([c, k, l]) => html`<${NumField} label=${l} title=${`${c} radius`} value=${num(comp(s, `border-${c}-radius`))}
            set=${has(s, `border-${c}-radius`)} src=${srcKind(s, `border-${c}-radius`)} onReset=${resetAll(s, actions, [`border-${c}-radius`])} onCommit=${(t) => actions.setProps([`border-${c}-radius`], t, k)} />`)}</div>`}
        ${on && html`<${Sub}>Border</${Sub}>
            <${ColorRow} s=${s} actions=${actions} p="border-top-color" all=${SIDES.map((d) => `border-${d}-color`)} group="borderColor" title="Border colour (every side)" removeTitle="Remove the border" onRemove=${removeBorder} />
            <div class="frow">
                <${NumField} label="Width" title="Border width" value=${same(s, widths)} set=${anyHas(s, widths)} src=${firstSrc(s, widths)} list="dl-borderWidth" onReset=${resetAll(s, actions, widths)}
                    onCommit=${(t) => actions.setProps(widths, t, "borderWidth", ["borderT", "borderR", "borderB", "borderL"])} />
                <label class=${`nf ${anyHas(s, styles) ? "" : "unset"}`} title="Line style"><select class="nfs wide" onChange=${(e) => actions.setProps(styles, e.target.value, "borderStyle")}>
                    ${["solid", "dashed", "dotted", "double"].map((v) => html`<option value=${v} selected=${style === v}>${v[0].toUpperCase() + v.slice(1)}</option>`)}</select></label>
                <${IconBtn} icon=${I.sides} on=${sides || mixedW} title="Each side on its own" onClick=${() => setSides(!sides)} />
            </div>
            ${(sides || mixedW) && html`<div class="frow two2">${SIDES.map((d, i) => html`<${NumField} label=${["T", "R", "B", "L"][i]} title=${`border-${d}-width`} value=${num(comp(s, `border-${d}-width`))}
                set=${has(s, `border-${d}-width`)} src=${srcKind(s, `border-${d}-width`)} onReset=${resetAll(s, actions, [`border-${d}-width`])} onCommit=${(t) => actions.setProps([`border-${d}-width`], t, ["borderT", "borderR", "borderB", "borderL"][i])} />`)}</div>`}`}
        ${outline && html`<${Sub}>Outline</${Sub}><div class="frow"><${PropField} s=${s} actions=${actions} p="outline" label="Outline" title="outline (width style colour)" />
            <${Remove} title="Remove the outline" onClick=${() => (val(s, "outlineStyle") || val(s, "outlineW") || val(s, "outlineColor") ? actions.setProp("outline", "none") : owns(s, "outline") ? actions.resetProp("outline") : actions.setProp("outline", "none"))} /></div>
            <div class="frow"><${PropField} s=${s} actions=${actions} p="outline-offset" label="Offset" title="Gap between the element and its outline" /></div>`}
        ${ring && html`<${Sub}>Ring</${Sub}><div class="frow"><${TwField} s=${s} k="ring" label="Ring" title="A ring around the element (ring-*)" actions=${actions} />
            <${Remove} title="Remove the ring" onClick=${() => { actions.applyValue("ring", ""); actions.applyValue("ringColor", ""); }} /></div>
            <${GroupColor} s=${s} k="ringColor" label="Colour" actions=${actions} />`}
    </${FSection}>`;
}

// ── Effects: opacity, blend, shadows and filters ─────────────────────────────────────────────────────────────────────────
// the CSS each Tailwind shadow stands for, written when the element is styled with CSS rather than classes
const SHADOWS = {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)", default: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)", inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
};
const SHADOW_NAMES = [["sm", "Small"], ["default", "Default"], ["md", "Medium"], ["lg", "Large"], ["xl", "Extra large"], ["2xl", "2XL"], ["inner", "Inner"], ["custom", "Custom…"]];
const BLEND = [["normal", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"], ["darken", "Darken"], ["lighten", "Lighten"], ["difference", "Difference"]];
export function EffectsSection({ s, actions }) {
    const ui = useUi();
    const [custom, setCustom] = useState(false);
    const [adding, setAdding] = useState(/** @type {string[]} */ ([]));
    const sh = comp(s, "box-shadow"), shTok = ((variant() ? (atVariant(s, "box-shadow") || {}).token : srcOf(s, "box-shadow").token) || "").replace(/^(?:[\w-]+:)*/, "");
    // Tailwind draws a ring with box-shadow too: that is the Border section's ring, not a shadow
    const ringOnly = /^ring/.test(shTok) && !val(s, "shadow", ui);
    const shadow = present(s, ["box-shadow"], Boolean(sh) && sh !== "none" && !ringOnly);
    const shName = shTok === "shadow" ? "default" : /^shadow-/.test(shTok) ? shTok.replace(/^shadow-/, "") : "";
    const preset = shadow && shName && !custom ? shName : "custom";
    const setShadow = (v) => { if (v === "custom") return setCustom(true); setCustom(false); return actions.setProp("box-shadow", v, SHADOWS[v] || v); };
    const tw = (k) => Boolean(val(s, k, ui)) || adding.includes(k);
    const drop = (k) => { setAdding(adding.filter((x) => x !== k)); actions.applyValue(k, ""); };
    const op = comp(s, "opacity");
    const add = (kind) => {
        if (kind === "shadow") setShadow("md");
        else if (kind === "blur" || kind === "backdropBlur") actions.applyValue(kind, "md");
        else setAdding([...adding, kind]);
    };
    const items = [!shadow && ["shadow", "Shadow"], !tw("blur") && ["blur", "Blur"], !tw("backdropBlur") && ["backdropBlur", "Background blur"],
        !tw("brightness") && ["brightness", "Brightness"], !tw("grayscale") && ["grayscale", "Grayscale"]].filter(Boolean);
    return html`<${FSection} title="Effects" extra=${html`<${AddMenu} title="Add an effect" items=${items} onPick=${add} />`}>
        <div class="frow">
            <${NumField} label="Opacity" title=${`opacity · ${srcNote(s, "opacity")}`} value=${op === "" ? "100" : String(Math.round(parseFloat(op) * 100))} set=${has(s, "opacity")} src=${srcKind(s, "opacity")}
                onReset=${has(s, "opacity") ? () => off(s, actions, "opacity") : null}
                onCommit=${(t) => { const n = parseFloat(t); if (Number.isFinite(n)) actions.setProp("opacity", String(Math.max(0, Math.min(100, n)) / 100)); }}><span class="nfu">%</span></${NumField}>
            <${PropSelect} s=${s} actions=${actions} p="mix-blend-mode" title="Blend mode" options=${BLEND} />
        </div>
        ${shadow && html`<div class="frow"><label class=${`nf ${has(s, "box-shadow") ? "" : "unset"} ${srcKind(s, "box-shadow") ? `src-${srcKind(s, "box-shadow")}` : ""}`} title=${`box-shadow · ${srcNote(s, "box-shadow")}`}>
                <span class="nfl">Shadow</span><select class="nfs wide" onChange=${(e) => setShadow(e.target.value)}>${SHADOW_NAMES.map(([v, l]) => html`<option value=${v} selected=${v === preset}>${l}</option>`)}</select></label>
            <${Remove} title="Remove the shadow" onClick=${() => { setCustom(false); return owns(s, "box-shadow") ? actions.resetProp("box-shadow") : actions.setProp("box-shadow", "none"); }} /></div>
            ${preset === "custom" && html`<div class="frow"><${NumField} label="CSS" title="box-shadow: x y blur spread colour" value=${sh} set src=${srcKind(s, "box-shadow")} onReset=${resetAll(s, actions, ["box-shadow"])} onCommit=${(t) => actions.setProp("box-shadow", t)} /></div>`}`}
        ${tw("blur") && html`<div class="frow"><${TwSelect} s=${s} k="blur" label="Blur" title="Blur the element (blur-*)" actions=${actions} /><${Remove} title="Remove the blur" onClick=${() => drop("blur")} /></div>`}
        ${tw("backdropBlur") && html`<div class="frow"><${TwSelect} s=${s} k="backdropBlur" label="Backdrop" title="Blur what is behind it (backdrop-blur-*)" actions=${actions} /><${Remove} title="Remove the background blur" onClick=${() => drop("backdropBlur")} /></div>`}
        ${tw("brightness") && html`<div class="frow"><${TwField} s=${s} k="brightness" label="Bright" title="Brightness % (brightness-*)" actions=${actions} /><${Remove} title="Remove the brightness" onClick=${() => drop("brightness")} /></div>`}
        ${tw("grayscale") && html`<div class="frow"><${TwSelect} s=${s} k="grayscale" label="Gray" title="Grayscale (grayscale)" actions=${actions} /><${Remove} title="Remove the grayscale" onClick=${() => drop("grayscale")} /></div>`}
    </${FSection}>`;
}

// ── Transform, Motion, Interaction: only what is set, + to add ───────────────────────────────────────────────────────────
/** A section of Tailwind groups that shows only the ones the element has (or that were just added), each with a ×. */
function GroupsSection({ s, actions, title, groups, addTitle }) {
    const ui = useUi();
    const [added, setAdded] = useState(/** @type {string[]} */ ([]));
    const shown = groups.filter(([k]) => val(s, k, ui) || added.includes(k));
    const items = groups.filter(([k]) => !shown.some(([x]) => x === k)).map(([k, l]) => [k, l]);
    const drop = (k) => setAdded(added.filter((x) => x !== k));
    return html`<${FSection} title=${title} extra=${html`<${AddMenu} title=${addTitle} items=${items} onPick=${(k) => setAdded([...added, k])} />`}>
        ${shown.map(([k, l, kind]) => html`<div class="frow">${kind === "select"
            ? html`<${TwSelect} s=${s} k=${k} label=${l} actions=${actions} />` : html`<${TwField} s=${s} k=${k} label=${l} actions=${actions} />`}
            ${val(s, k, ui) ? html`<${Remove} title=${`Remove ${l.toLowerCase()}`} onClick=${() => { drop(k); actions.applyValue(k, ""); }} />` : html`<${Cancel} onClick=${() => drop(k)} />`}</div>`)}
    </${FSection}>`;
}
export const TransformSection = ({ s, actions }) => html`<${GroupsSection} s=${s} actions=${actions} title="Transform" addTitle="Add a transform"
    groups=${[["scale", "Scale"], ["rotate", "Rotate"], ["translateX", "Move X"], ["translateY", "Move Y"]]} />`;
export const MotionSection = ({ s, actions }) => html`<${GroupsSection} s=${s} actions=${actions} title="Motion" addTitle="Add a transition"
    groups=${[["transition", "Transition", "select"], ["duration", "Time"], ["delay", "Delay"], ["ease", "Easing", "select"]]} />`;

const BUILTIN_ANIMATIONS = [["spin", "Spin"], ["ping", "Ping"], ["pulse", "Pulse"], ["bounce", "Bounce"]];
/** The animation select: Tailwind's own and the ones the config defines. */
const AnimationSelect = ({ value, custom, onChange }) => {
    const known = BUILTIN_ANIMATIONS.some(([v]) => v === value) || custom.includes(value);
    return html`<select class="nfs wide" onChange=${(e) => onChange(e.target.value)}>
        <option value="" selected=${!value}>–</option>
        <optgroup label="Tailwind">${BUILTIN_ANIMATIONS.map(([v, l]) => html`<option value=${v} selected=${v === value}>${l}</option>`)}</optgroup>
        ${custom.length ? html`<optgroup label="Your animations">${custom.map((v) => html`<option value=${v} selected=${v === value}>${v}</option>`)}</optgroup>` : null}
        ${value && !known ? html`<option value=${value} selected>${value} (not in your config)</option>` : null}</select>`;
};
const SVG_TAGS = ["svg", "g", "path", "line", "polyline", "polygon", "circle", "ellipse", "rect"];
const small = "nfs wide";
/** Effects: a heading's letters or words arriving one by one, text typed out, an SVG's lines drawn. Each adds what it needs to the Tailwind config and the element, in one step. */
function EffectsBlock({ s, actions }) {
    const [e, setE] = useState({ preset: "fade-up", gap: 40, trigger: "load", secs: 0, drawSecs: 1.6, drawGap: 150, outline: true });
    const text = s.text && s.text.trim() ? s.text : "", split = s.attrs && s.attrs["data-split"], isSvg = SVG_TAGS.includes(s.tag);
    const when = (v, on) => html`<div class="frow"><label class="nf" title="When it plays"><span class="nfl">When</span><select class=${small} onChange=${(ev) => on(ev.target.value)}>${TRIGGERS.filter(([k]) => ["load", "scroll", "click"].includes(k)).map(([k, l]) => html`<option value=${k} selected=${k === v}>${l}</option>`)}</select></label></div>`;
    const btn = (label, fn, title) => html`<button type="button" class="nfb" title=${title || label} onClick=${fn}>${label}</button>`;
    if (split) return html`<div class="fsech" style="margin-top:8px"><span>Text effect</span></div><p class="muted" style="margin:0 0 4px">This text arrives ${split === "words" ? "word by word" : "letter by letter"}.</p><div class="frow">${btn("Remove the effect", actions.effectUnreveal)}</div>`;
    if (text) {
        const secs = e.secs || Math.round(Math.max(1, Math.min(8, text.length / 14)) * 10) / 10;
        return html`<div class="fsech" style="margin-top:8px"><span>Text effects</span></div>
            <div class="frow"><label class="nf" title="The entrance each letter or word plays"><span class="nfl">With</span><select class=${small} onChange=${(ev) => setE({ ...e, preset: ev.target.value })}>${REVEALS.map((r) => html`<option value=${r.id} selected=${r.id === e.preset}>${r.label}</option>`)}</select></label></div>
            ${when(e.trigger, (v) => setE({ ...e, trigger: v }))}
            <div class="frow"><${NumField} label="Gap" title="Milliseconds between one letter (or word) and the next" value=${String(e.gap)} onCommit=${(v) => setE({ ...e, gap: Math.max(0, Math.min(1000, Number(v) || 0)) })} /><span class="nfl" style="width:auto">ms</span></div>
            <div class="frow">${btn("By letter", () => actions.effectReveal({ by: "letters", preset: e.preset, gap: e.gap, trigger: e.trigger }), "Split the text into letters that arrive one after another")}${btn("By word", () => actions.effectReveal({ by: "words", preset: e.preset, gap: Math.max(e.gap, 80), trigger: e.trigger }), "Split the text into words that arrive one after another")}</div>
            <div class="frow"><${NumField} label="Type" title="Seconds to type the whole text" value=${String(secs)} onCommit=${(v) => setE({ ...e, secs: Math.max(0.5, Math.min(60, Number(v) || 3)) })} /><span class="nfl" style="width:auto">s</span></div>
            <div class="frow">${btn("Typewriter", () => actions.effectTypewriter({ secs, trigger: e.trigger }), "Type the text out with a blinking caret")}${btn("Remove it", actions.effectUntype, "Take the typewriter off")}</div>`;
    }
    if (isSvg) return html`<div class="fsech" style="margin-top:8px"><span>Draw the lines</span></div>
        ${when(e.trigger, (v) => setE({ ...e, trigger: v }))}
        <div class="frow"><${NumField} label="Time" title="Seconds each line takes to draw" value=${String(e.drawSecs)} onCommit=${(v) => setE({ ...e, drawSecs: Math.max(0.2, Math.min(30, Number(v) || 1.6)) })} /><span class="nfl" style="width:auto">s</span></div>
        <div class="frow"><${NumField} label="Gap" title="Milliseconds between one line and the next" value=${String(e.drawGap)} onCommit=${(v) => setE({ ...e, drawGap: Math.max(0, Math.min(2000, Number(v) || 0)) })} /><span class="nfl" style="width:auto">ms</span></div>
        <div class="frow"><label class="nf" style="gap:6px;cursor:pointer" title="Give shapes an outline and no fill, so there is a line to draw"><input type="checkbox" checked=${e.outline} onChange=${(ev) => setE({ ...e, outline: ev.target.checked })} /><span class="nfl" style="width:auto">Outline only</span></label></div>
        <div class="frow">${btn("Draw the lines", () => actions.effectDraw({ secs: e.drawSecs, gap: e.drawGap, outline: e.outline, trigger: e.trigger }))}${btn("Remove it", actions.effectUndraw, "Take the drawing off")}</div>`;
    return null;
}

/** Animation: which animation an element plays, and WHEN (on load, hover, focus, scrolled into view, clicked), then the cascade of a container's children. All of it is Tailwind classes
 *  (plus a few lines of script for scroll and click, added to the page once). Tailwind's own animations and the config's are one list. */
export function AnimationSection({ s, actions }) {
    const ui = useUi();
    const t = readTrigger(s.classes, s.attrs || {}), custom = ui.animations || [];
    const [st, setSt] = useState({ name: "", trigger: "scroll", step: 80 });
    const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const missing = t && !BUILTIN_ANIMATIONS.some(([v]) => v === t.name) && !custom.includes(t.name);
    const stName = st.name || t?.name || custom[0] || "pulse";
    return html`<${FSection} title="Animation" extra=${html`<${IconBtn} icon=${I.plus} title="Make a new animation, or pick one from the library (the keyframes go into your Tailwind config)" onClick=${actions.newAnimation} />`}>
        <div class="frow"><label class=${`nf ${t ? "src-tw" : "unset"}`} title="The animation this element plays">
            <span class="nfl">Play</span><${AnimationSelect} value=${t?.name || ""} custom=${custom} onChange=${(v) => (v ? actions.setAnimation(v, t?.trigger || "load") : actions.clearAnimation())} /></label>
            ${t ? html`<${Remove} title="Remove the animation" onClick=${actions.clearAnimation} />` : null}</div>
        ${t && reduceMotion && String(s.classes).includes("motion-reduce:animate-none") ? html`<p class="muted" style="margin:0 0 4px;color:#b45309">Your device asks for reduced motion, and this animation respects it, so it stays still in Interact, Preview and here. Turn "Reduce motion" off in your system's accessibility settings to see it.</p>` : null}
        ${missing ? html`<p class="muted" style="margin:0 0 4px;color:#b45309">"${t.name}" is not in your Tailwind config any more, so nothing plays. Pick another animation, remove this one, or add it back in the config.</p>` : null}
        ${t ? html`<div class="frow"><label class="nf src-tw" title="When it plays"><span class="nfl">When</span>
            <select class="nfs wide" onChange=${(e) => actions.setAnimation(t.name, e.target.value)}>${TRIGGERS.map(([v, l]) => html`<option value=${v} selected=${v === t.trigger}>${l}</option>`)}</select></label></div>
            <div class="frow"><button type="button" class="nfb" title="The editor shows designs at rest; this lets the animation run for a few seconds (hover and focus need the pointer)" onClick=${actions.previewAnim}>Preview the animation</button></div>` : null}
        ${s.kids >= 2 ? html`<div class="fsech" style="margin-top:8px"><span>Children, one after another</span></div>
            <div class="frow"><label class="nf" title="The animation each child plays"><span class="nfl">Play</span><${AnimationSelect} value=${stName} custom=${custom} onChange=${(v) => setSt({ ...st, name: v })} /></label></div>
            <div class="frow"><label class="nf" title="When each child plays"><span class="nfl">When</span><select class="nfs wide" onChange=${(e) => setSt({ ...st, trigger: e.target.value })}>${TRIGGERS.map(([v, l]) => html`<option value=${v} selected=${v === st.trigger}>${l}</option>`)}</select></label></div>
            <div class="frow"><${NumField} label="Gap" title="Milliseconds between one child and the next" value=${String(st.step)} onCommit=${(v) => setSt({ ...st, step: Math.max(0, Math.min(2000, Number(v) || 0)) })} /><span class="nfl" style="width:auto">ms</span></div>
            <div class="frow"><button type="button" class="nfb" onClick=${() => actions.staggerChildren({ name: stName, trigger: st.trigger, step: st.step })}>Animate the ${s.kids} children</button>
                <button type="button" class="nfb" style="flex:none" title="Take the animation off every child" onClick=${() => actions.staggerChildren({ clear: true })}>Clear</button></div>` : null}
        <${EffectsBlock} s=${s} actions=${actions} />
    </${FSection}>`;
}

// ── Interactions: "when this is clicked, show that" (the rule lives on the element: core/interactions.js) ────────────────────
const TARGET_LESS = new Set(["scroll", "copy", "classes"]);
/** Class names to offer for what has been typed: the target's own first, then Tailwind's (up to 8). A typed variant ("max-md:") carries over to the suggestions. */
function classSuggestions(text, own, taken) {
    const t = text.trim();
    if (!t) return own.filter((c) => !taken.includes(c)).slice(0, 8);
    const colon = t.lastIndexOf(":"), pre = colon >= 0 ? t.slice(0, colon + 1) : "", rest = t.slice(pre.length);
    const pool = [...own, ...tailwindClasses().filter((c) => !c.endsWith(":")).map((c) => pre + c)];
    const out = [];
    for (const c of pool) if (c.startsWith(t) && !taken.includes(c) && c !== t && !out.includes(c)) { out.push(c); if (out.length >= 8) break; }
    if (!out.length && rest) for (const c of pool) if (c.includes(rest) && !taken.includes(c) && !out.includes(c)) { out.push(c); if (out.length >= 8) break; }
    return out;
}
/** A row of class names as chips with a box to type the next one (Enter, space or comma adds it; Backspace takes the last off), and suggestions under it. */
function ClassChips({ label, title, value, own, onChange }) {
    const [text, setText] = useState("");
    const add = (v) => { const c = String(v).trim().replace(/[,;|]+$/, ""); setText(""); if (c && !/[\s;|]/.test(c) && !value.includes(c)) onChange([...value, c]); };
    const sug = text.trim() ? classSuggestions(text, own, value) : [];
    return html`<div class="cchip" title=${title}><span class="nfl">${label}</span><div class="cbox">
        ${value.map((c) => html`<span class="chip">${c}<button type="button" aria-label=${`Remove ${c}`} onClick=${() => onChange(value.filter((x) => x !== c))}>×</button></span>`)}
        <input value=${text} placeholder=${value.length ? "" : "class name"} spellcheck="false" autocomplete="off" onInput=${(e) => setText(e.target.value)}
            onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " " || e.key === ",") { e.preventDefault(); add(text); } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1)); }} onBlur=${() => add(text)} />
        ${sug.length ? html`<div class="csug">${sug.map((c) => html`<button type="button" onMouseDown=${(e) => { e.preventDefault(); add(c); }}>${c}</button>`)}</div>` : null}</div></div>`;
}
/** The page's interactions for the selected element. A rule reads like a sentence: When [Clicked] Do [Show or hide] On [an element]. The element is picked from a list of the page's layers, or by clicking it on the canvas. */
export function InteractionsSection({ s, actions }) {
    const rules = parseRules((s.attrs || {})["data-wc-do"]);
    const targets = actions.interactionTargets ? actions.interactionTargets() : [];
    const [draft, setDraft] = useState(/** @type {{ when: string, do: string } | null} */ (null));
    const [picking, setPicking] = useState(false);
    const nameOf = (id) => { const t = targets.find((x) => x.id === id); return t ? (t.label ? `${t.tag} · ${t.label}` : t.tag) : `#${id} (not on this page)`; };
    const choose = (path) => actions.targetId(path);
    const change = (i, patch) => {
        // a rule switched to "Change classes" has no classes yet, and a rule with nothing to do is not stored: it becomes a rule being made (the old one stays until it is finished)
        if (patch.do === "classes" && !rules[i].change) { setDraft({ when: rules[i].when, do: "classes", to: rules[i].to, parts: { add: [], remove: [], toggle: [] }, replace: i }); return; }
        actions.setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    };
    const pick = (done) => { setPicking(true); actions.pickTarget((path) => { setPicking(false); if (path) done(path); }); };
    const stopPick = () => { setPicking(false); actions.cancelPick(); };
    const whenSel = (v, onChange) => html`<label class="nf src-tw" title="What starts it"><span class="nfl">When</span><select class="nfs wide" onChange=${(e) => onChange(e.target.value)}>${WHEN.map(([k, l]) => html`<option value=${k} selected=${k === v}>${l}</option>`)}</select></label>`;
    const doSel = (v, onChange) => html`<label class="nf src-tw" title="What it does"><span class="nfl">Do</span><select class="nfs wide" onChange=${(e) => onChange(e.target.value)}>${DO.map(([k, l]) => html`<option value=${k} selected=${k === v}>${l}</option>`)}</select></label>`;
    const target = (value, onPath) => html`<div class="frow"><label class="nf src-tw" title="The element it acts on"><span class="nfl">On</span>
        <select class="nfs wide" onChange=${(e) => { if (e.target.value) onPath(targets.find((t) => t.key === e.target.value).path); }}>
            <option value="" selected=${!value}>Choose an element…</option>
            ${value && !targets.some((t) => t.id === value) ? html`<option value="" selected>${nameOf(value)}</option>` : null}
            ${targets.map((t) => html`<option value=${t.key} selected=${Boolean(value) && t.id === value}>${"\u00a0\u00a0".repeat(Math.min(t.depth, 4))}${t.label ? `${t.tag} · ${t.label}` : t.tag}</option>`)}</select></label>
        <${IconBtn} icon=${I.target} title=${picking ? "Cancel: click an element on the canvas" : "Pick it on the canvas"} onClick=${() => (picking ? stopPick() : pick(onPath))} /></div>`;
    const hasStart = (id) => (targets.find((t) => t.id === id) || {}).start;
    const ownOf = (id) => String((targets.find((t) => t.id === id) || {}).cls || "").split(/\s+/).filter(Boolean);
    /** The three rows of a "classes" rule: what to add, remove and toggle on the element. `parts` is { add, remove, toggle }; `set(parts)` is called with the changed one. */
    const classRows = (id, parts, set) => html`${[["add", "Add", "Classes put on the element"], ["remove", "Remove", "Classes taken off it (the ones it has are suggested)"], ["toggle", "Toggle", "Classes turned on if off and off if on"]].map(([k, l, t]) =>
        html`<${ClassChips} label=${l} title=${t} value=${parts[k]} own=${k === "remove" || k === "toggle" ? ownOf(id) : []} onChange=${(v) => set({ ...parts, [k]: v })} />`)}`;
    return html`<${FSection} title="Interactions" extra=${html`<${IconBtn} icon=${I.plus} title="Add an interaction: when this is clicked, hovered or shown, do something to another element" onClick=${() => setDraft({ when: "click", do: "toggle" })} />`}>
        ${!rules.length && !draft ? html`<p class="muted" style="margin:0 0 4px">Make this do something when it is clicked or hovered: show or hide a menu, scroll to a section, copy some text. They run in Interact and Preview.</p>` : null}
        ${rules.map((r, i) => (draft && draft.replace === i ? null : html`<div class="irule">
            <div class="frow">${whenSel(r.when, (v) => change(i, { when: v }))}<${Remove} title="Remove this interaction" onClick=${() => actions.setRules(rules.filter((_, j) => j !== i))} /></div>
            <div class="frow">${doSel(r.do, (v) => change(i, { do: v }))}<span class="ispace"></span></div>
            ${target(r.to, (path) => change(i, { to: choose(path) }))}
            ${r.do === "classes" ? classRows(r.to, changeParts(r.change), (parts) => { const next = changeFrom(parts); if (next.length) change(i, { change: next }); }) : null}
            ${!TARGET_LESS.has(r.do) && actions.setStart ? html`<label class="frow ichk" title="The element is hidden when the page opens, and this shows it"><input type="checkbox" checked=${Boolean(hasStart(r.to))} onChange=${(e) => actions.setStart(r.to, e.target.checked)} /> <span>${nameOf(r.to)} starts hidden</span></label>` : null}
        </div>`))}
        ${draft ? html`<div class="irule">
            <div class="frow">${whenSel(draft.when, (v) => setDraft({ ...draft, when: v }))}<${Remove} title="Cancel" onClick=${() => { stopPick(); setDraft(null); }} /></div>
            <div class="frow">${doSel(draft.do, (v) => setDraft({ ...draft, do: v }))}<span class="ispace"></span></div>
            ${target(draft.to || "", (path) => { const id = choose(path); if (draft.do === "classes") setDraft({ ...draft, to: id }); else { actions.setRules([...rules, { when: draft.when, do: draft.do, to: id }]); setDraft(null); } })}
            ${draft.do === "classes" && draft.to ? html`${classRows(draft.to, draft.parts || { add: [], remove: [], toggle: [] }, (parts) => setDraft({ ...draft, parts }))}
                <div class="frow"><button type="button" class="nfb" onClick=${() => { const change = changeFrom(draft.parts || {}); if (change.length) { const made = { when: draft.when, do: "classes", to: draft.to, change }; actions.setRules(draft.replace === undefined ? [...rules, made] : rules.map((r, j) => (j === draft.replace ? made : r))); setDraft(null); } }}>Add this interaction</button></div>` : null}
            <p class="muted" style="margin:2px 0 0">${draft.do === "classes" ? "Choose the element, then the classes to add, remove or toggle on it." : "Choose the element it acts on, or click ⌖ and then the element on the canvas."}</p>
        </div>` : null}
    </${FSection}>`;
}

const INTERACTION = [
    { p: "cursor", l: "Cursor", t: "select", o: ["auto", "default", "pointer", "text", "move", "not-allowed", "grab", "grabbing", "crosshair", "help", "wait"] },
    { p: "pointer-events", l: "Pointer", t: "select", o: ["auto", "none"] },
    { p: "user-select", l: "Select", t: "select", o: ["auto", "none", "text", "all"] },
    { p: "visibility", l: "Visible", t: "select", o: ["visible", "hidden"] },
    { p: "object-fit", l: "Object fit", t: "select", o: ["fill", "contain", "cover", "none", "scale-down"] },
    { p: "object-position", l: "Object pos", t: "text" },
];
export function InteractionSection({ s, actions }) {
    const [added, setAdded] = useState(/** @type {string[]} */ ([]));
    const rows = INTERACTION.filter((c) => (has(s, c.p) && shownOf(s, c.p, srcOf(s, c.p)) !== "initial") || added.includes(c.p));
    const left = INTERACTION.filter((c) => !rows.includes(c));
    return html`<${FSection} title="Cursor and pointer" extra=${html`<${AddMenu} title="Add a setting" items=${left.map((c) => [c.p, c.l])} onPick=${(p) => setAdded([...added, p])} />`}>
        ${rows.map((c) => html`<${PropRow} s=${s} actions=${actions} c=${c} onCancel=${added.includes(c.p) ? () => setAdded(added.filter((p) => p !== c.p)) : null} />`)}
    </${FSection}>`;
}

// ── Anything else: a class, or a CSS declaration ─────────────────────────────────────────────────────────────────────────
/** "color: red" (a CSS declaration the browser knows) is set as a property; anything else is added as classes (hover:bg-blue-500 md:flex). */
export function AddBox({ actions }) {
    const commit = (t) => {
        const text = t.trim();
        if (!text) return;
        const m = text.match(/^([a-z-]+)\s*:\s+([^;]+);?$/i); // a space after the colon: a declaration, not hover:bg-...
        if (m && CSS.supports(m[1], m[2].trim())) return actions.setProp(m[1].toLowerCase(), m[2].trim());
        actions.addClasses(text);
    };
    return html`<div class="fsec"><div class="fsech"><span>Add class or CSS</span></div>
        <${NumField} label="+" title="A class (hover:bg-blue-500, md:grid-cols-3) or a CSS declaration (color: red), then Enter" placeholder="hover:underline  or  color: red" value="" set onCommit=${commit} /></div>`;
}
