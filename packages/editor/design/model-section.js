// The Properties panel's 3D model section: shown on a <wc-model> (core/model3d.js). Every control writes one plain attribute on the element
// (setAttr), so what is in the panel is what is in the HTML; a value left at its default is taken off again. The size, position, rounding and
// background (a bg- class: the scene itself is see-through) are the panel's other sections, like for any element.
import { html } from "../vendor/preact-htm.js";
import { TextInput, SelectInput, Field } from "./controls.js";
import { MODEL_ATTRS, boolAttr, isModelFile, MAX_EMBED_BYTES, SAMPLE_MODEL } from "../../core/model3d.js";

const mb = (n) => (n / 1e6).toFixed(1);
const GROUPS = [["Camera", ["rotation", "camera-angle", "camera-distance", "fov"]], ["Light", ["environment", "exposure", "light", "light-color"]], ["Motion", ["controls", "zoom", "auto-rotate", "rotate-speed", "animate"]], ["Scene", ["background"]]];

/** `s.attrs`: the element's attributes. `actions.setAttr(name, value)` with "" takes one off. */
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
    const control = (a) => {
        const v = at[a.name];
        const label = html`<span title=${a.hint || undefined}>${a.label}</span>`;
        if (a.type === "bool") return html`<label class="row" title=${a.hint || undefined}><span class="lbl">${a.label}</span>
            <input type="checkbox" checked=${boolAttr(v)} onChange=${(e) => set(a.name, e.target.checked ? true : null)} /></label>`;
        if (a.type === "select") return html`<${Field} label=${a.label} title=${a.hint}><${SelectInput} value=${v || a.def} options=${a.options.map((o) => [o, o])} onChange=${(x) => set(a.name, x === a.def ? null : x)} /></${Field}>`;
        return html`<${Field} label=${label} title=${a.hint}><${TextInput} value=${v ?? ""} placeholder=${String(a.def)} onCommit=${(x) => set(a.name, x.trim() === "" || x.trim() === String(a.def) ? null : x.trim())} /></${Field}>`;
    };
    return html`<div class="sec"><div class="secb nopad"><p class="sub first">3D model</p>
        <${Field} label="Model" title="A .glb/.gltf URL, or a file embedded in the page">
            ${embedded
                ? html`<span class="fi" title="The file is inside the page's HTML">Embedded file (${mb(src.length * 0.75)} MB)</span>`
                : html`<${TextInput} value=${src} placeholder="https://…/model.glb" onCommit=${(x) => set("src", x.trim() || null)} />`}</${Field}>
        <div class="row"><span class="lbl"></span>
            <label class="fi" style="cursor:pointer;text-align:center">Choose .glb file…<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" style="display:none" onChange=${pick} /></label></div>
        <div class="row"><span class="lbl"></span>
            <button type="button" class="fi" onClick=${() => set("src", SAMPLE_MODEL)} title="A free sample model (CC0), loaded from a CDN">Use a sample model</button>
            ${src && html`<button type="button" class="fi" onClick=${() => set("src", null)}>Remove</button>`}</div>
        ${GROUPS.map(([title, names]) => html`<p class="sub">${title}</p>${names.map((n) => control(MODEL_ATTRS.find((a) => a.name === n)))}`)}
    </div></div>`;
}
