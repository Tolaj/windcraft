// The Properties panel's 3D model sections: shown on a <wc-model> (core/model3d.js). Every control writes one plain attribute on the element
// (setAttr), so what is in the panel is what is in the HTML; a value left at its default is taken off again (and shows faint, like any
// unset field). The size, position, rounding and background (a bg- class: the scene itself is see-through) are the panel's other sections.
// Built from the same pieces as Position and Layout: FSection, NumField (drag its letter to scrub), toggle buttons, .fbtns.
import { html, useState, useRef } from "../vendor/preact-htm.js";
import { TextInput, SelectInput, ColorInput } from "./controls.js";
import { FSection, NumField, IconBtn, I } from "./figma-sections.js";
import { VIEW_ATTR, parseView, MODEL_ATTRS, boolAttr, numberAttr, parseRotation, isModelFile, MAX_EMBED_BYTES, hotspotMarkup, nextHotspot } from "../../core/model3d.js";

const mb = (n) => (n / 1e6).toFixed(1);
const A = Object.fromEntries(MODEL_ATTRS.map((a) => [a.name, a]));
const tidy = (n) => String(Math.round(n * 1000) / 1000);

/** A number attribute as a field: faint when it is at its default, type a value (empty resets) or drag its label sideways to scrub it. */
function NumAttr({ name, label, unit, at, set, title, ph }) {
    const a = A[name], raw = at[name];
    const [live, setLive] = useState(/** @type {number | null} */ (null));
    const store = (n) => set(name, n === a.def ? null : tidy(n));
    const scrub = (e) => {
        e.preventDefault();
        const x0 = e.clientX, base = numberAttr(name, raw), box = e.currentTarget;
        let cur = base, moved = false;
        box.setPointerCapture(e.pointerId);
        const move = (ev) => {
            const steps = Math.round((ev.clientX - x0) / 4);
            if (steps) moved = true;
            cur = numberAttr(name, base + steps * a.step);
            setLive(cur);
            store(cur); // live: the model follows the drag (the writes merge into one undo step)
        };
        const up = () => {
            box.removeEventListener("pointermove", move);
            box.removeEventListener("pointerup", up);
            setLive(null);
        };
        box.addEventListener("pointermove", move);
        box.addEventListener("pointerup", up);
    };
    const shown = live != null ? tidy(live) : raw ?? "";
    return html`<label class=${`nf ${raw == null && live == null ? "unset" : ""}`} title=${title || a.hint || a.label}>
        <span class="nfl" style="cursor:ew-resize;touch-action:none" onPointerDown=${scrub}>${label}</span>
        <${TextInput} class="nfi" value=${shown} placeholder=${ph || String(a.def)}
            onInput=${(x) => { if (x.trim() !== "" && Number.isFinite(Number(x))) store(numberAttr(name, x)); }}
            onCommit=${(x) => (x.trim() === "" ? set(name, null) : store(numberAttr(name, x)))} />
        ${unit && html`<span class="nfu">${unit}</span>`}</label>`;
}

/** An on/off setting as a button that is pressed when it is on. */
const Toggle = ({ name, label, at, set }) => {
    const on = boolAttr(at[name]);
    return html`<button type="button" class=${`ib txt ${on ? "on" : ""}`} title=${A[name].hint || A[name].label} aria-pressed=${on} onClick=${() => set(name, on ? null : true)}>${label}</button>`;
};

/** A colour attribute: a swatch that opens the picker, the colour typed (any CSS colour), and a clear button. */
function ColorAttr({ name, label, at, set }) {
    const a = A[name], v = at[name];
    const hex = /^#[0-9a-f]{6}$/i.test(v || "") ? v : /^#[0-9a-f]{6}$/i.test(a.def) ? a.def : "#ffffff";
    return html`<label class=${`nf ${v ? "" : "unset"}`} title=${a.hint || a.label}><span class="nfl">${label}</span>
        <${ColorInput} class="cin" value=${hex} onLive=${(x) => set(name, x === a.def ? null : x)} onDone=${(x) => set(name, x === a.def ? null : x)} />
        <${TextInput} class="nfi" value=${v ?? ""} placeholder=${a.def || "see-through"} onInput=${(x) => { if (/^#[0-9a-f]{6}$/i.test(x.trim())) set(name, x.trim() === a.def ? null : x.trim()); }} onCommit=${(x) => set(name, x.trim() === "" || x.trim() === a.def ? null : x.trim())} />
        ${v && html`<${IconBtn} icon=${I.close} title="Back to the default" onClick=${() => set(name, null)} />`}</label>`;
}

/** `s.attrs`: the element's attributes; `s.clips`: names of the model's animations. `actions.setAttr(name, value)` with null takes one off. */
export function ModelSection({ s, actions }) {
    const at = s.attrs || {};
    const set = (name, v) => actions.setAttr(name, v);
    const src = at.src || "";
    const embedded = /^data:/i.test(src);
    const pick = (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!f) return;
        if (!isModelFile(f.name, f.type)) return alert("Choose a .glb or .gltf file.");
        if (f.size > MAX_EMBED_BYTES) return alert(`That file is ${mb(f.size)} MB. A model inside the page can be up to ${mb(MAX_EMBED_BYTES)} MB: host it somewhere and paste its URL instead.`);
        const r = new FileReader();
        r.onload = () => set("src", r.result);
        r.readAsDataURL(f);
    };
    // rotation is one attribute, "x y z": each field changes its own turn
    const rot = parseRotation(at.rotation);
    const setRot = (i, x) => {
        const n = rot.slice();
        n[i] = Number.isFinite(Number(x)) && String(x).trim() !== "" ? Number(x) : 0;
        set("rotation", n.every((d) => d === 0) ? null : n.map(tidy).join(" "));
    };
    const rotField = (i, l) => html`<label class=${`nf ${at.rotation == null ? "unset" : ""}`} title=${`Turn about ${l} (°): where the model starts`}><span class="nfl">${l}</span>
        <${TextInput} class="nfi" value=${tidy(rot[i])} placeholder="0" onInput=${(x) => { if (x.trim() !== "" && Number.isFinite(Number(x))) setRot(i, x); }} onCommit=${(x) => setRot(i, x)} /><span class="nfu">°</span></label>`;
    const file = useRef(null);
    // where the model sits in the scene is one attribute, "x y z" (units of its own size: 1 is its radius): each field changes its own
    const pos = String(at["model-position"] || "0 0 0").trim().split(/[\s,]+/).map(Number).map((n) => (Number.isFinite(n) ? n : 0)).concat([0, 0, 0]).slice(0, 3);
    const setPos = (i, x) => {
        const n = pos.slice();
        n[i] = Number.isFinite(Number(x)) && String(x).trim() !== "" ? Number(x) : 0;
        set("model-position", n.every((d) => d === 0) ? null : n.map(tidy).join(" "));
    };
    const posField = (i, l) => html`<label class=${`nf ${at["model-position"] == null ? "unset" : ""}`} title=${`Move the model along ${l}, in units of its own size`}><span class="nfl">${l}</span>
        <${TextInput} class="nfi" value=${tidy(pos[i])} placeholder="0" onInput=${(x) => { if (x.trim() !== "" && Number.isFinite(Number(x))) setPos(i, x); }} onCommit=${(x) => setPos(i, x)} /></label>`;
    const light = at.environment === "none" ? "none" : "studio";
    const clips = s.clips || [];
    return html`
        <${FSection} title="3D model" extra=${src && html`<${IconBtn} icon=${I.close} title="Remove the model (the element stays)" onClick=${() => set("src", null)} />`}>
            <label class="nf" title="A .glb/.gltf URL, or a file embedded in the page"><span class="nfl">File</span>
                ${embedded
                    ? html`<span class="nfi" style="line-height:24px;color:#555" title="The file is inside the page's HTML">Embedded (${mb(src.length * 0.75)} MB)</span>`
                    : html`<${TextInput} class="nfi" value=${src} placeholder="https://…/model.glb" onCommit=${(x) => set("src", x.trim() || null)} />`}</label>
            <div class="fbtns">
                <button type="button" title="A .glb or .gltf from your computer, embedded in the page" onClick=${() => file.current && file.current.click()}>Choose file…</button>
                <input ref=${file} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" style="display:none" onChange=${pick} />
                <button type="button" title="Free 3D models to start from, loaded from a CDN" onClick=${() => actions.openSamples()}>Use a sample</button>
            </div>
        </${FSection}>
        <${FSection} title="Model in the scene">
            <div class="frow"><${NumAttr} name="model-size" label="Size" unit="px" ph="fit" at=${at} set=${set} /></div>
            <div class="frow">${posField(0, "X")}${posField(1, "Y")}${posField(2, "Z")}</div>
            <p class="fsub">Its size and place inside the box, whatever the box's size. Double-click the model on the canvas to pick it, then use the tools in the bar (move, turn, size). A size left empty fits the box.</p>
        </${FSection}>
        <${FSection} title="Camera">
            <p class="fsub">Double-click the model on the canvas and drag to turn it: the view you leave it at is saved here.</p>
            <div class="frow">${rotField(0, "X")}${rotField(1, "Y")}${rotField(2, "Z")}</div>
            <div class="frow"><${NumAttr} name="camera-angle" label="Tilt" unit="°" at=${at} set=${set} /><${NumAttr} name="camera-distance" label="Zoom" at=${at} set=${set} title="Camera distance: 1 fits the whole model, less is closer" /></div>
            <div class="frow"><${NumAttr} name="fov" label="FOV" unit="°" at=${at} set=${set} title="Field of view" /></div>
        </${FSection}>
        <${FSection} title="Light">
            <label class="nf" title="Lighting"><span class="nfl">Lighting</span>
                <${SelectInput} class="nfs wide" value=${light} options=${[["studio", "Studio"], ["none", "None (key light only)"]]} onChange=${(x) => set("environment", x === "studio" ? null : x)} /></label>
            <div class="frow"><${NumAttr} name="exposure" label="Exposure" at=${at} set=${set} /><${NumAttr} name="light" label="Key" at=${at} set=${set} title="Key light strength" /></div>
            <${ColorAttr} name="light-color" label="Colour" at=${at} set=${set} />
        </${FSection}>
        <${FSection} title="Motion">
            <div class="ibrow"><div class="ibg wide"><${Toggle} name="auto-rotate" label="Spin" at=${at} set=${set} /><${Toggle} name="controls" label="Orbit" at=${at} set=${set} />
                <${Toggle} name="zoom" label="Zoom" at=${at} set=${set} /><${Toggle} name="animate" label="Play" at=${at} set=${set} /></div></div>
            <div class="frow"><${NumAttr} name="rotate-speed" label="Speed" unit="°/s" at=${at} set=${set} title="Spin speed (degrees per second)" /><${NumAttr} name="scroll-rotate" label="Scroll" unit="°" at=${at} set=${set} title="Degrees the model turns while it crosses the screen" /></div>
            <label class="nf" title="Which of the model's animations play (all by default)"><span class="nfl">Clip</span>
                ${clips.length
                    ? html`<${SelectInput} class="nfs wide" value=${at.clip || ""} options=${[["", "All animations"], ...clips.map((c, i) => [c, c || `Animation ${i + 1}`])]} onChange=${(x) => set("clip", x || null)} />`
                    : html`<${TextInput} class="nfi" value=${at.clip ?? ""} placeholder="all" onInput=${(x) => set("clip", x.trim() || null)} onCommit=${(x) => set("clip", x.trim() || null)} />`}</label>
        </${FSection}>
        <${FSection} title="Scene">
            <div class="ibrow"><div class="ibg wide"><${Toggle} name="shadow" label="Ground shadow" at=${at} set=${set} /></div></div>
            <${ColorAttr} name="background" label="Colour" at=${at} set=${set} />
        </${FSection}>
        <${FSection} title="Hotspots" extra=${html`<${IconBtn} icon=${I.plus} title="Add a button pinned to a point of the model (plain HTML you can restyle and link)"
            onClick=${() => actions.addChild((markup) => hotspotMarkup(nextHotspot(markup), "0 0 0", "Label"))} />`}>
            <p class="fsub">Buttons or labels pinned to a point of the model. Add one, then move it with its X Y Z.</p>
        </${FSection}>`;
}

/** A hotspot (a child of a model with a data-position): where on the model it is pinned. */
export function HotspotSection({ s, actions }) {
    const three = String(s.attrs["data-position"] || "").trim().split(/[\s,]+/).map(Number).map((n) => (Number.isFinite(n) ? n : 0)).concat([0, 0, 0]).slice(0, 3);
    const write = (i, x) => {
        const n = three.slice();
        n[i] = Number.isFinite(Number(x)) && String(x).trim() !== "" ? Number(x) : 0;
        actions.setAttr("data-position", n.map(tidy).join(" "));
    };
    const field = (i, l) => html`<label class="nf" title=${`${l} on the model, in its own units: its bounding sphere has radius 1, so 0 is the middle and 1 the edge`}><span class="nfl">${l}</span>
        <${TextInput} class="nfi" value=${tidy(three[i])} placeholder="0" onInput=${(x) => { if (x.trim() !== "" && Number.isFinite(Number(x))) write(i, x); }} onCommit=${(x) => write(i, x)} /></label>`;
    return html`<${FSection} title="Hotspot">
        <div class="frow">${field(0, "X")}${field(1, "Y")}${field(2, "Z")}</div>
        <p class="fsub">It stays on that point as the model turns. Style it like any element; give it a link or an interaction.</p>
    </${FSection}>`;
}

/** On a box next to a 3D model: make it a step of the scroll story. Pose the model (move, turn, size), select the box, press the button:
 *  while the page scrolls, the model glides to each step's view. What is kept is one plain attribute, data-wc-view. */
export function StorySection({ s, actions }) {
    const view = (s.attrs || {})[VIEW_ATTR];
    const has = view !== undefined, v = parseView(view);
    return html`<${FSection} title="Scroll story">
        <div class="frow"><button type="button" class="ib txt" style="flex:1" title="Keep how the 3D model looks now as this section's view" onClick=${() => actions.useView(true)}>${has ? "Update this view" : "Use this view"}</button>
            ${has && html`<button type="button" class="ib txt" title="This section stops moving the model" onClick=${() => actions.useView(false)}>Remove</button>`}</div>
        <p class="fsub">${has ? html`The model glides to this view as this section reaches the middle of the screen: ${Object.keys(v).map((k) => k.replace("model-", "").replace("camera-", "")).join(", ") || "its start view"}. Preview the page to see it move.` : "Turn, move or size the model, then press the button: the model goes to that view when this section scrolls into the middle."}</p>
    </${FSection}>`;
}
