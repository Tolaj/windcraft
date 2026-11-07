import { host } from "../host.js";
import { config } from "../config.js";
import { buildPreviewDocument, parseComponentSource } from "../../playground/component-source.js";
import { $, S, esc, model } from "./base.js";
import { addToEmpty, draftPage } from "./add-menu.js";
import { docs } from "./designs.js";
import { cmd } from "./frame-messages.js";

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

/** Wireframes for a part of a page: they go inside a selected box (a section, a div), or at the end of the page. */
export const SECTIONS = [
    ["cols2", "Two columns", `<div class="grid gap-4 p-4 md:grid-cols-2"><div class="h-64 ${FRAME}"></div><div class="h-64 ${FRAME}"></div></div>`],
    ["cols3", "Three columns", `<div class="grid gap-4 p-4 md:grid-cols-3"><div class="h-56 ${FRAME}"></div><div class="h-56 ${FRAME}"></div><div class="h-56 ${FRAME}"></div></div>`],
    ["side", "Sidebar + content", `<div class="flex gap-4 p-4"><aside class="hidden h-80 w-56 shrink-0 md:block ${FRAME}"></aside><div class="h-80 min-w-0 flex-1 ${SPACE}"></div></div>`],
    ["hero", "Hero", `<section class="flex flex-col items-center gap-4 px-4 py-16"><div class="h-12 w-2/3 ${FRAME}"></div><div class="h-6 w-1/2 ${SPACE}"></div><div class="mt-4 flex gap-3"><div class="h-10 w-32 ${FRAME}"></div><div class="h-10 w-32 ${SPACE}"></div></div></section>`],
    ["cards", "Card grid", `<div class="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4"><div class="h-48 ${FRAME}"></div><div class="h-48 ${FRAME}"></div><div class="h-48 ${FRAME}"></div><div class="h-48 ${FRAME}"></div></div>`],
    ["split", "Text + image", `<section class="grid items-center gap-8 p-4 md:grid-cols-2"><div class="flex flex-col gap-3"><div class="h-10 w-3/4 ${FRAME}"></div><div class="h-5 ${SPACE}"></div><div class="h-5 w-5/6 ${SPACE}"></div><div class="mt-3 h-10 w-32 ${FRAME}"></div></div><div class="h-72 ${SPACE}"></div></section>`],
];
/** A page wireframe put inside a box: as tall as a good part of a screen, not the whole screen (min-h-screen in a section would be). */
const inBox = (html) => html.replace(/\bmin-h-screen\b/g, "min-h-[32rem]");

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
let box = null, keyShown = null, sizer = null, onEsc = null;

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

/**
 * The card with its tiles. `o`: { title, groups: [{ label, items: [[id, name, html]] }], ai, skip (a label, or null), modal, onPick(html), onSkip() }.
 * Not modal: it sits over the empty page and the canvas around it stays usable. Modal: a popup over a dimmed canvas, closed by a click outside.
 */
function build(o) {
    const canAI = o.ai && typeof host.generate === "function";
    const items = new Map();
    o.groups.forEach((g) => g.items.forEach(([id, , html]) => items.set(id, html)));
    box = document.createElement("div");
    box.id = "layoutPicker";
    box.className = `${o.modal ? "bg-black/10" : "pointer-events-none"} absolute inset-0 z-40 flex items-center justify-center p-6`;
    box.innerHTML = `<div data-card class="pointer-events-auto max-h-full w-full max-w-[780px] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_48px_rgba(0,0,0,.18)]">
        <div class="flex items-center justify-between gap-4"><h2 class="truncate text-[15px] font-semibold text-neutral-900">${esc(o.title)}</h2>
            <button type="button" data-skip class="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">${esc(o.skip || "Close")}</button></div>
        ${o.groups.filter((g) => g.items.length).map((g, i) => `<p class="${i ? "mt-5" : "mt-3"} text-[11px] font-medium uppercase tracking-wide text-neutral-400">${esc(g.label)}</p>
        <div class="mt-2 grid grid-cols-4 gap-3">${g.items.map(([id, name, html]) => tile(id, name, html)).join("")}</div>`).join("")}
        ${canAI ? `<p class="mt-5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Or describe it</p>
        <form data-ai class="mt-2 flex gap-2"><input name="prompt" type="text" placeholder="A pricing page with three plans and an FAQ" class="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900">
            <button type="submit" class="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Generate</button></form>
        <p data-ai-msg class="mt-2 hidden text-xs"></p>` : ""}
    </div>`;
    $("canvas").appendChild(box);
    box.dataset.modal = o.modal ? "1" : "";
    onEsc = o.onSkip;
    // the previews are pages 1280 wide, shrunk to their tile
    const node = box;
    const fit = () => node.querySelectorAll("[data-layout] iframe").forEach((f) => { const w = f.parentElement.clientWidth; if (w) f.style.transform = `scale(${w / 1280})`; });
    sizer = new ResizeObserver(fit);
    sizer.observe(node);
    fit();
    const card = box.querySelector("[data-card]");
    // the canvas pans and zooms with the wheel and the pointer: not under the picker
    ["wheel", "pointerdown"].forEach((t) => card.addEventListener(t, (e) => e.stopPropagation()));
    if (o.modal) {
        ["wheel", "pointerdown"].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));
        box.addEventListener("click", (e) => { if (!card.contains(e.target)) o.onSkip(); });
    }
    card.addEventListener("click", (e) => {
        const t = e.target.closest("[data-layout]");
        if (e.target.closest("[data-skip]") || (t && t.dataset.layout === "blank")) return o.onSkip();
        if (!t) return;
        const html = items.get(t.dataset.layout);
        if (html) { hide(); o.onPick(html); }
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

function hide() { if (sizer) { sizer.disconnect(); sizer = null; } if (box) { box.remove(); box = null; } keyShown = null; onEsc = null; }
function skip() { dismissed.add(S.curKey); hide(); }

/** Shows the picker over an empty page (and only then); called whenever the page or its content changes. */
export function syncLayoutPicker() {
    if (box && box.dataset.modal) return; // a wireframe popup the person opened stays until they pick or close it
    const want = S.mode === "edit" && config.ui.panels !== false && model.markup.trim() === "" && !dismissed.has(S.curKey);
    if (!want) return hide();
    if (box && keyShown === S.curKey) return;
    hide();
    keyShown = S.curKey;
    const frames = framesHere();
    build({
        title: "Start with a layout", skip: "Start blank", ai: true, modal: false, onSkip: skip,
        groups: [{ label: "Built in", items: [["blank", "Blank", ""], ...LAYOUTS] }, { label: "Same as a page in this project", items: frames.map((f, i) => [`frame-${i}`, `Like “${f.title}”`, f.html]) }],
        onPick: (html) => { if (model.markup.trim() === "") addToEmpty(html); },
    });
}

/**
 * The wireframes as a popup, from the Properties panel: `target` is the selected element ({ path, tag }) or null for the page. A pick
 * goes inside that element (after what it holds), or at the end of the page (or fills it when it is empty). One undo step.
 */
export function openWireframes(target) {
    hide();
    const into = target && target.path && target.path.length ? target : null;
    build({
        title: into ? `Add a wireframe inside this ${into.tag}` : "Add a wireframe to the page", skip: null, ai: false, modal: true, onSkip: hide,
        groups: [{ label: "Sections", items: SECTIONS }, { label: "Pages", items: LAYOUTS.map(([id, name, html]) => [id, name, into ? inBox(html) : html]) }],
        onPick: (html) => {
            if (!into && model.markup.trim() === "") return addToEmpty(html);
            cmd({ cmd: "insert", path: into ? into.path : [], html, position: "inside" });
        },
    });
}

/** Registers this part's listeners (called once by editor.js). */
export function init() {
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box && onEsc) { e.preventDefault(); onEsc(); } });
}
