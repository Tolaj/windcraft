// The free 3D models dialog. It is the wireframe browser's own kind of dialog (layout-picker.js): a card over the dimmed canvas, not over
// the whole editor, with the same chips, tiles and Close button. A tile is a model: its picture, name, licence and size; below it who made it
// and a link to its page (where the author and the licence are stated). A click on the tile sets it as the selected model's file.
import { $, S, esc } from "./base.js";
import { SAMPLE_MODELS, SAMPLE_KINDS, sampleUrl, sampleThumb, sourceUrl, needsCredit, isModelFile, MAX_EMBED_BYTES } from "../../../core/model3d.js";

let box = null;
let onKey = null;

export function closeSamples() {
    if (onKey) { document.removeEventListener("keydown", onKey, true); onKey = null; }
    if (box) { box.remove(); box = null; }
}

const size = (kb) => (kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${kb} KB`);

const tile = (m, current) => `<div class="group" data-sample="${esc(m.id)}" data-kind="${esc(m.kind)}">
    <button type="button" data-pick="${esc(m.id)}" title="${esc(m.about)}" class="block w-full text-left">
        <span class="relative block aspect-[4/3] overflow-hidden rounded-lg border bg-neutral-100 transition group-hover:border-neutral-900 ${current === sampleUrl(m) ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"}"><img src="${esc(sampleThumb(m))}" alt="" loading="lazy" class="h-full w-full object-cover"></span>
        <span class="mt-1.5 flex items-center justify-between gap-2 text-xs"><span class="truncate font-medium text-neutral-800">${esc(m.name)}</span>
            <span class="flex shrink-0 gap-1 text-[10.5px]">
                <span class="rounded px-1.5 py-0.5 ${needsCredit(m) ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}" title="${needsCredit(m) ? "Needs a credit line on your page" : "No credit needed"}">${esc(m.license.split(" · ")[0])}</span>
                <span class="rounded px-1.5 py-0.5 ${m.kb > 5000 ? "bg-amber-50 text-amber-800" : "bg-neutral-100 text-neutral-500"}" title="${m.kb > 5000 ? "A heavy file: it takes a moment to load" : "File size"}">${size(m.kb)}</span></span></span>
    </button>
    <span class="mt-0.5 flex items-center justify-between gap-2 text-[10.5px] text-neutral-400"><span class="truncate" title="Made by ${esc(m.credit)}">${esc(m.credit)}</span>
        <a href="${esc(sourceUrl(m))}" target="_blank" rel="noopener noreferrer" title="Open this model's page: its author and licence" class="shrink-0 text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">Source ↗</a></span>
</div>`;

/** Opens the dialog over the canvas. `current`: the file the model has now (its tile is outlined); `onPick(url)`: a tile was chosen. */
export function openSamples({ current, onPick }) {
    closeSamples();
    box = document.createElement("div");
    box.id = "modelSamples";
    box.className = "absolute inset-0 z-[60] flex items-center justify-center bg-black/10 p-6";
    const chips = [["all", "All"], ...SAMPLE_KINDS];
    box.innerHTML = `<div role="dialog" aria-label="Free 3D models" style="min-height:min(34rem,100%)" class="pointer-events-auto relative flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_48px_rgba(0,0,0,.18)]">
        <div class="flex items-center justify-between gap-4 px-5 pt-5"><h2 class="truncate text-[15px] font-semibold text-neutral-900">Free 3D models</h2>
            <span class="flex shrink-0 items-center gap-1"><label class="cursor-pointer rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 hover:border-neutral-400" title="A .glb or .gltf from your computer, embedded in the page (up to 1.5 MB)">Upload a file…<input type="file" data-upload accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="hidden"></label>
                <button type="button" data-close class="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">Close</button></span></div>
        <p class="px-5 pt-1 text-xs leading-snug text-neutral-500">Pick one to use in this element. They load from a CDN as a link, so your page stays small. Models marked CC BY need a credit line on your page: each one's Source link shows who made it.</p>
        <div data-chips class="flex flex-wrap gap-1.5 px-5 pb-3 pt-3">${chips.map(([k, l]) => `<button type="button" data-chip="${k}" class="rounded-full border px-3 py-1 text-xs">${esc(l)}</button>`).join("")}</div>
        <div class="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100 px-5 pb-5 pt-4"><div data-grid class="grid grid-cols-4 gap-x-3 gap-y-4">${SAMPLE_MODELS.map((m) => tile(m, current)).join("")}</div></div>
    </div>`;
    $("canvas").appendChild(box);
    // the canvas pans and zooms on wheel and starts a selection on a press: neither may reach it from the dialog (as in the wireframe dialog)
    ["wheel", "pointerdown"].forEach((type) => box.addEventListener(type, (e) => e.stopPropagation()));
    const paint = (k) => {
        box.querySelectorAll("[data-chip]").forEach((c) => { c.className = `rounded-full border px-3 py-1 text-xs ${c.dataset.chip === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`; });
        box.querySelectorAll("[data-sample]").forEach((t) => { t.hidden = k !== "all" && t.dataset.kind !== k; });
    };
    paint("all");
    box.addEventListener("click", (e) => {
        if (e.target === box || e.target.closest("[data-close]")) return closeSamples();
        const chip = e.target.closest("[data-chip]");
        if (chip) return paint(chip.dataset.chip);
        const pick = e.target.closest("[data-pick]");
        const m = pick && SAMPLE_MODELS.find((x) => x.id === pick.dataset.pick);
        if (m) { closeSamples(); onPick(sampleUrl(m)); }
    });
    box.querySelector("[data-upload]").addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!f) return;
        if (!isModelFile(f.name, f.type)) return alert("Choose a .glb or .gltf file.");
        if (f.size > MAX_EMBED_BYTES) return alert(`That file is ${(f.size / 1e6).toFixed(1)} MB. A model inside the page can be up to ${(MAX_EMBED_BYTES / 1e6).toFixed(1)} MB: host it somewhere and paste its URL in the panel instead.`);
        const r = new FileReader();
        r.onload = () => { closeSamples(); onPick(String(r.result)); };
        r.readAsDataURL(f);
    });
    onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSamples(); } };
    document.addEventListener("keydown", onKey, true);
}

/** The list of models for the selected 3D model: a pick (or an upload) becomes its file. `cmd` sends an edit to the page. */
export function chooseModel(cmd) {
    if (!S.selected) return;
    const path = S.selected.path;
    openSamples({ current: (S.selected.attrs || {}).src, onPick: (url) => cmd({ cmd: "setAttr", path, name: "src", value: url }) });
}
