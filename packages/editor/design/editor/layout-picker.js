import { host } from "../host.js";
import { config } from "../config.js";
import { buildPreviewDocument, parseComponentSource } from "../../playground/component-source.js";
import { $, S, esc, model } from "./base.js";
import { addToEmpty, draftPage } from "./add-menu.js";
import { docs } from "./designs.js";

// ── A new, empty page: start with a layout ───────────────────────────────────────────────────────────────────────
// Over an empty page the canvas offers ready layouts: a few built-in page skeletons, the frame of another page of the project
// ("Same as Home": its header, sidebar and footer, with an empty middle), and the AI box. A pick is plain Tailwind HTML put in the
// page like anything pasted, so it is edited, dragged and undone like the rest. Blank (or Esc) leaves the page empty.

// Every layout is a wireframe: the regions of the page as real elements (header, aside, main, section), empty, in two greys (the
// frame darker, the content lighter), sized so the shape reads. No placeholder words to delete: content is dropped or drawn in.
const FRAME = "rounded-lg bg-gray-300", SPACE = "rounded-lg bg-gray-200";
const HOLE = `<div class="h-96 ${SPACE}"></div>`;

export const LAYOUTS = [
    ["landing", "Landing", `<div class="flex min-h-screen flex-col gap-4 p-4"><header class="h-14 ${FRAME}"></header><main class="flex flex-1 flex-col gap-4"><section class="h-80 ${SPACE}"></section><section class="grid gap-4 md:grid-cols-3"><div class="h-40 ${FRAME}"></div><div class="h-40 ${FRAME}"></div><div class="h-40 ${FRAME}"></div></section></main><footer class="h-20 ${FRAME}"></footer></div>`],
    ["app", "App shell", `<div class="flex min-h-screen gap-4 p-4"><aside class="hidden w-60 shrink-0 md:block ${FRAME}"></aside><div class="flex min-w-0 flex-1 flex-col gap-4"><header class="h-14 ${FRAME}"></header><main class="flex-1 ${SPACE}"></main></div></div>`],
    ["dashboard", "Dashboard", `<div class="flex min-h-screen gap-4 p-4"><aside class="hidden w-60 shrink-0 md:block ${FRAME}"></aside><main class="flex min-w-0 flex-1 flex-col gap-4"><section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div class="h-24 ${FRAME}"></div><div class="h-24 ${FRAME}"></div><div class="h-24 ${FRAME}"></div><div class="h-24 ${FRAME}"></div></section><section class="flex-1 ${SPACE}"></section></main></div>`],
    ["docs", "Docs", `<div class="flex min-h-screen gap-4 p-4"><nav class="hidden w-52 shrink-0 md:block ${FRAME}"></nav><main class="min-w-0 flex-1 ${SPACE}"></main><aside class="hidden w-44 shrink-0 xl:block ${FRAME}"></aside></div>`],
    ["auth", "Sign in", `<main class="flex min-h-screen items-center justify-center p-4"><section class="h-96 w-full max-w-sm ${FRAME}"></section></main>`],
    ["pricing", "Pricing", `<main class="flex min-h-screen flex-col justify-center gap-4 p-4"><section class="mx-auto grid w-full max-w-5xl items-end gap-4 md:grid-cols-3"><div class="h-80 ${FRAME}"></div><div class="h-96 ${FRAME}"></div><div class="h-80 ${FRAME}"></div></section></main>`],
    ["blog", "Blog post", `<main class="flex min-h-screen justify-center p-4"><article class="flex w-full max-w-2xl flex-col gap-4"><header class="h-12 ${FRAME}"></header><section class="h-[32rem] ${SPACE}"></section></article></main>`],
];

/**
 * The frame of a page, for a new page that should look like it: its header, nav, sidebar and footer stay, what they frame becomes one
 * blank box. Null when the page has no such frame (nothing to share).
 */
export function shellOf(markup) {
    const doc = new DOMParser().parseFromString(`<body>${markup || ""}`, "text/html");
    const body = doc.body;
    const hole = () => { const t = doc.createElement("template"); t.innerHTML = HOLE; return t.content.firstChild; };
    const main = body.querySelector("main");
    if (main) { main.replaceChildren(hole()); return body.innerHTML.trim(); }
    const frame = [...body.querySelectorAll("header, nav, aside, footer")].filter((n) => !n.parentElement.closest("header, nav, aside, footer"));
    if (!frame.length) return null;
    const keep = new Set();
    frame.forEach((n) => { for (let a = n; a && a !== body; a = a.parentElement) keep.add(a); });
    const prune = (box) => {
        let placed = false;
        [...box.children].forEach((k) => {
            if (frame.includes(k)) return; // a header or sidebar: kept as it is
            if (keep.has(k)) return prune(k); // holds part of the frame: go in
            if (!placed) { k.replaceWith(hole()); placed = true; } else k.remove(); // the page's own content: one placeholder for all of it
        });
    };
    prune(body);
    return body.innerHTML.trim();
}

/** Pages of this project that have a frame to share: [{ title, html }]. */
function framesHere() {
    const out = [];
    docs.forEach((d, key) => {
        if (key === S.curKey) return;
        const markup = d.loaded ? d.markup : parseComponentSource(d.source || "").markup;
        const html = markup && markup.trim() && shellOf(markup);
        if (html) out.push({ title: (d.meta && d.meta.title) || "Untitled page", html });
    });
    return out.slice(0, 4);
}

const dismissed = new Set(); // pages where Blank was chosen: the picker stays away from them
let box = null, keyShown = null, sizer = null;

/** A tile: a live, themed preview of the layout (a real page, shrunk), and its name. */
function tile(id, name, html) {
    const doc = html ? buildPreviewDocument(parseComponentSource(html), { width: 1280 }) : "";
    return `<button type="button" data-layout="${id}" class="group text-left">
        <div class="relative aspect-[16/10] overflow-hidden rounded-lg border border-neutral-200 bg-white transition group-hover:border-neutral-900">
            ${html ? `<iframe tabindex="-1" sandbox="allow-scripts" class="pointer-events-none absolute left-0 top-0 origin-top-left" style="width:1280px;height:800px;border:0" srcdoc="${esc(doc)}"></iframe>` : `<div class="flex h-full items-center justify-center text-2xl text-neutral-300">+</div>`}
        </div>
        <div class="mt-1.5 truncate text-xs text-neutral-600 group-hover:text-neutral-900">${esc(name)}</div>
    </button>`;
}

function build() {
    const frames = framesHere();
    const canAI = typeof host.generate === "function";
    box = document.createElement("div");
    box.id = "layoutPicker";
    box.className = "pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-6";
    box.innerHTML = `<div data-card class="pointer-events-auto max-h-full w-full max-w-[780px] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_48px_rgba(0,0,0,.18)]">
        <div class="flex items-center justify-between"><h2 class="text-[15px] font-semibold text-neutral-900">Start with a layout</h2>
            <button type="button" data-skip class="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">Start blank</button></div>
        <p class="mt-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Built in</p>
        <div class="mt-2 grid grid-cols-4 gap-3">${tile("blank", "Blank", "")}${LAYOUTS.map(([id, name, html]) => tile(id, name, html)).join("")}</div>
        ${frames.length ? `<p class="mt-5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Same as a page in this project</p>
        <div class="mt-2 grid grid-cols-4 gap-3">${frames.map((f, i) => tile(`frame-${i}`, `Like “${f.title}”`, f.html)).join("")}</div>` : ""}
        ${canAI ? `<p class="mt-5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Or describe it</p>
        <form data-ai class="mt-2 flex gap-2"><input name="prompt" type="text" placeholder="A pricing page with three plans and an FAQ" class="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900">
            <button type="submit" class="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Generate</button></form>
        <p data-ai-msg class="mt-2 hidden text-xs"></p>` : ""}
    </div>`;
    $("canvas").appendChild(box);
    // the previews are pages 1280 wide, shrunk to their tile
    const node = box;
    const fit = () => node.querySelectorAll("[data-layout] iframe").forEach((f) => { const w = f.parentElement.clientWidth; if (w) f.style.transform = `scale(${w / 1280})`; });
    sizer = new ResizeObserver(fit);
    sizer.observe(node);
    fit();
    const card = box.querySelector("[data-card]");
    // the canvas pans and zooms with the wheel and the pointer: not under the picker
    ["wheel", "pointerdown"].forEach((t) => card.addEventListener(t, (e) => e.stopPropagation()));
    card.addEventListener("click", (e) => {
        const t = e.target.closest("[data-layout]");
        if (e.target.closest("[data-skip]") || (t && t.dataset.layout === "blank")) return skip();
        if (!t) return;
        const id = t.dataset.layout;
        const html = id.startsWith("frame-") ? frames[Number(id.slice(6))].html : (LAYOUTS.find((l) => l[0] === id) || [])[2];
        if (html && model.markup.trim() === "") { hide(); addToEmpty(html); }
    });
    const form = card.querySelector("[data-ai]");
    if (form) form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const prompt = form.prompt.value.trim(), msg = card.querySelector("[data-ai-msg]");
        msg.classList.remove("hidden");
        if (!prompt) { msg.className = "mt-2 text-xs text-red-600"; msg.textContent = "Describe the page first."; return; }
        msg.className = "mt-2 text-xs text-neutral-500"; msg.textContent = "Drafting the page…";
        const res = await draftPage(prompt);
        if (!res.ok) { msg.className = "mt-2 text-xs text-red-600"; msg.textContent = res.message || "Couldn't draft the page. Try again."; }
    });
}

function hide() { if (sizer) { sizer.disconnect(); sizer = null; } if (box) { box.remove(); box = null; } keyShown = null; }
function skip() { dismissed.add(S.curKey); hide(); }

/** Shows the picker over an empty page (and only then); called whenever the page or its content changes. */
export function syncLayoutPicker() {
    const want = S.mode === "edit" && config.ui.panels !== false && model.markup.trim() === "" && !dismissed.has(S.curKey);
    if (!want) return hide();
    if (box && keyShown === S.curKey) return;
    hide();
    keyShown = S.curKey;
    build();
}

/** Registers this part's listeners (called once by editor.js). */
export function init() {
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box) { e.preventDefault(); skip(); } });
}
