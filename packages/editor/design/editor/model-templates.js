// The cards of the 3D tab of the wireframe dialog (layout-picker.js): ready-made 3D sections to start from (core/model3d-templates.js). A card is a small
// drawing of the layout, the name, what it does and what moves it; a click puts it on the page like any layout.
import { esc } from "./base.js";
import { TEMPLATES_3D } from "../../../core/model3d-templates.js";

// a few shapes to draw each layout with (a rounded box for the model, bars for words)
const M = (x, y, w, h, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#e5e5e5" stroke="#a3a3a3" ${extra}/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 4}" fill="#737373"/>`;
const T = (x, y, w, dark) => `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2.5" fill="${dark ? "#e5e5e5" : "#a3a3a3"}"/>`;
const DRAWINGS = {
    "scroll-story": `${M(110, 14, 80, 72)}${T(14, 24, 70)}${T(14, 34, 50)}${T(14, 54, 70)}${T(14, 64, 50)}<path d="M200 24v52" stroke="#a3a3a3" stroke-dasharray="3 3"/>`,
    "product-hero": `${T(14, 30, 70)}${T(14, 42, 90)}${T(14, 54, 50)}<rect x="14" y="66" width="34" height="10" rx="5" fill="#171717"/>${M(120, 16, 70, 68)}`,
    "colour-swatches": `${T(80, 12, 60)}${M(80, 24, 60, 40)}<circle cx="94" cy="76" r="6" fill="#e11d48"/><circle cx="112" cy="76" r="6" fill="#2563eb"/><circle cx="130" cy="76" r="6" fill="#16a34a"/><circle cx="148" cy="76" r="6" fill="#171717"/>`,
    "hover-turn": `<rect x="0" y="0" width="200" height="100" fill="#262626"/>${M(14, 14, 80, 72)}<rect x="108" y="16" width="78" height="20" rx="4" fill="#404040"/><rect x="108" y="42" width="78" height="20" rx="4" fill="#525252"/><rect x="108" y="68" width="78" height="20" rx="4" fill="#404040"/>`,
    "background-model": `${M(30, 8, 140, 84, 'opacity=".6"')}${T(50, 38, 100)}${T(70, 50, 60)}<rect x="82" y="64" width="36" height="10" rx="5" fill="#171717"/>`,
};

const card = (t) => `<button type="button" data-template="${esc(t.id)}" class="group block text-left">
    <span class="block overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 transition group-hover:border-neutral-900 group-hover:bg-white"><svg viewBox="0 0 200 100" class="block w-full" aria-hidden="true">${DRAWINGS[t.id] || ""}</svg></span>
    <span class="mt-2 block text-sm font-medium text-neutral-900">${esc(t.name)}</span>
    <span class="mt-0.5 block text-xs leading-snug text-neutral-500">${esc(t.about)}</span>
    <span class="mt-1.5 flex flex-wrap gap-1">${t.tags.map((g) => `<span class="rounded bg-neutral-100 px-1.5 py-0.5 text-[10.5px] text-neutral-600">${esc(g)}</span>`).join("")}</span>
</button>`;

/** The cards, for the grid of the 3D tab. */
export const templateCards = () => TEMPLATES_3D.map(card).join("");
/** The template a card stands for: its markup. */
export const templateHtml = (id) => { const t = TEMPLATES_3D.find((x) => x.id === id); return t ? t.html : null; };
