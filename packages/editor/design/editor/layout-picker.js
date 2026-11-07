import { host } from "../host.js";
import { config } from "../config.js";
import { buildPreviewDocument, parseComponentSource } from "../../playground/component-source.js";
import { $, S, esc, model } from "./base.js";
import { addToEmpty, draftPage } from "./add-menu.js";
import { docs } from "./designs.js";
import { cmd } from "./frame-messages.js";
import { KIND_NAMES, LAYOUTS, SECTIONS, SPACE, wireframe } from "../../../core/wireframes.js";
export { LAYOUTS, SECTIONS };

// ── A new, empty page: start with a layout ───────────────────────────────────────────────────────────────────────
// Over an empty page the canvas offers ready layouts: a few built-in page skeletons, the frame of another page of the project
// ("Same as Home": its header, sidebar and footer, with an empty middle), and the AI box. A pick is plain Tailwind HTML put in the
// page like anything pasted, so it is edited, dragged and undone like the rest. Blank (or Esc) leaves the page empty.

// The wireframes (blank regions in two greys, no placeholder words) and their endless generator live in core/wireframes.js.
const HOLE = `<div class="h-96 ${SPACE}"></div>`;

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

const dismissed = new Set(); // pages where the tip was dismissed: it stays away from them
let box = null, keyShown = null, sizer = null, onEsc = null;

/**
 * A tile: a preview of the layout at 1280 wide, shrunk to fit, and its name. A wireframe (grey boxes only) is drawn right here, which
 * keeps an endless list light; the frame of a real page (`live`) needs its own styles and fonts, so it gets a frame of its own.
 */
function tile(id, name, html, live) {
    const body = !html ? `<div class="flex h-full items-center justify-center text-2xl text-neutral-300">+</div>`
        : live ? `<iframe tabindex="-1" sandbox="allow-scripts" data-shrink class="pointer-events-none absolute left-0 top-0 origin-top-left" style="width:1280px;height:800px;border:0" srcdoc="${esc(buildPreviewDocument(parseComponentSource(html), { width: 1280 }))}"></iframe>`
        : `<div data-shrink class="pointer-events-none absolute left-0 top-0 origin-top-left bg-white" style="width:1280px">${html.replace(/\bmin-h-screen\b/g, "min-h-[800px]")}</div>`;
    return `<button type="button" data-layout="${esc(id)}" class="group text-left">
        <div class="relative aspect-[16/10] overflow-hidden rounded-lg border border-neutral-200 bg-white transition group-hover:border-neutral-900">${body}</div>
        <div class="mt-1.5 truncate text-xs text-neutral-600 group-hover:text-neutral-900" title="${esc(name)}">${esc(name)}</div>
    </button>`;
}
/** Shrinks each preview to its tile; a short one (a section) sits in the middle of its tile rather than at the top. */
function fitTiles(node) {
    node.querySelectorAll("[data-shrink]").forEach((f) => {
        const w = f.parentElement.clientWidth, h = f.parentElement.clientHeight;
        if (!w) return;
        const k = w / 1280, tall = f.tagName === "IFRAME" ? 800 : f.scrollHeight;
        f.style.transform = `translateY(${Math.max(0, (h - tall * k) / 2)}px) scale(${k})`;
    });
}

let watcher = null; // the endless list's "more as you scroll" observer
function hide() { if (watcher) { watcher.disconnect(); watcher = null; } if (sizer) { sizer.disconnect(); sizer = null; } if (box) { box.remove(); box = null; } keyShown = null; onEsc = null; }
function skip() { dismissed.add(S.curKey); hide(); }

/**
 * The wireframe browser: every wireframe, endless. The hand-picked ones lead, then the generator's (core/wireframes.js), twelve more
 * each time the end of the list comes into view, repeats skipped, filtered by kind with the chips.
 *   o.into    the selected element ({ path, tag }) a pick goes inside, or null for the page
 *   o.modal   a dialog over a dimmed canvas (the Properties panel's), or a card that leaves the canvas usable
 *   o.frames, o.ai   for the page: "Like <page>" (live previews of the project's other pages) and the AI box
 *   o.onPick(html), o.onClose()
 */
function browse(o) {
    hide();
    const into = o.into && o.into.path && o.into.path.length ? o.into : null;
    const fitIn = (html) => (into ? inBox(html) : html);
    const canAI = o.ai && typeof host.generate === "function";
    const frames = o.frames || [];
    box = document.createElement("div");
    box.id = "layoutPicker";
    box.dataset.modal = o.modal ? "1" : "";
    // a dialog sits over the canvas toolbars too; the empty page's card under them, so they stay usable
    box.className = o.modal ? "absolute inset-0 z-[60] flex items-center justify-center bg-black/10 p-6" : "pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-6 pb-6 pt-20";
    const chips = [["all", "All"], ...Object.entries(KIND_NAMES)];
    box.innerHTML = `<div data-card class="pointer-events-auto flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_48px_rgba(0,0,0,.18)]">
        <div class="flex items-center justify-between gap-4 px-5 pt-5"><h2 class="truncate text-[15px] font-semibold text-neutral-900">${esc(o.title)}</h2>
            <button type="button" data-skip class="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">${esc(o.closeLabel || "Close")}</button></div>
        ${canAI ? `<form data-ai class="flex gap-2 px-5 pt-3"><input name="prompt" type="text" placeholder="Describe it: a pricing page with three plans and an FAQ" class="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900">
            <button type="submit" class="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Generate</button></form><p data-ai-msg class="hidden px-5 pt-2 text-xs"></p>` : ""}
        <div data-chips class="flex flex-wrap gap-1.5 px-5 pb-3 pt-3">${chips.map(([k, l]) => `<button type="button" data-kind="${k}" class="rounded-full border px-3 py-1 text-xs">${esc(l)}</button>`).join("")}</div>
        <div data-scroll class="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100 px-5 pb-5 pt-4"><div data-grid class="grid grid-cols-4 gap-3"></div>
            <p data-more class="py-6 text-center text-xs text-neutral-400">Loading more…</p></div>
    </div>`;
    $("canvas").appendChild(box);
    const card = box.querySelector("[data-card]"), grid = box.querySelector("[data-grid]"), more = box.querySelector("[data-more]"), scroller = box.querySelector("[data-scroll]");
    const items = new Map();
    let kind = "all", n = 0, seen = new Set(), done = false;
    const add = (id, name, html, live) => { items.set(id, html); grid.insertAdjacentHTML("beforeend", tile(id, name, html, live)); };
    /** The next dozen of this kind; repeats are skipped, and a kind with no new ones left says so. */
    function loadMore() {
        if (done || !box) return;
        let added = 0, tries = 0;
        while (added < 12 && tries < 240) {
            const w = wireframe(kind, n++);
            tries++;
            if (seen.has(w.html)) continue;
            seen.add(w.html);
            add(w.id, w.name, fitIn(w.html));
            added++;
        }
        if (added < 12) { done = true; more.textContent = kind === "all" ? "That's all for now." : `That's every ${KIND_NAMES[kind]} wireframe.`; }
        fitTiles(grid);
        // still room below (a short list, a tall window): fill it, the end of the list must be out of view to wait for a scroll
        requestAnimationFrame(() => { if (!done && box && more.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom + 400) loadMore(); });
    }
    function show(k) {
        kind = k; n = 0; seen = new Set(); done = false; items.clear(); grid.innerHTML = ""; more.textContent = "Loading more…";
        box.querySelectorAll("[data-kind]").forEach((c) => { c.className = `rounded-full border px-3 py-1 text-xs ${c.dataset.kind === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`; });
        const picked = (list) => list.forEach(([id, name, html]) => { seen.add(html); add(`pick-${id}`, name, fitIn(html)); });
        if (k === "all" || k === "pages") {
            frames.forEach((f, i) => add(`frame-${i}`, `Like “${f.title}”`, f.html, true)); // the project's own pages, before anything generic
        }
        // the hand-picked ones lead the list: sections first inside a box, pages first for the page
        if (k === "all") picked(into ? [...SECTIONS, ...LAYOUTS] : [...LAYOUTS, ...SECTIONS]);
        if (k === "pages") picked(LAYOUTS);
        scroller.scrollTop = 0;
        loadMore();
    }
    watcher = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadMore(); }, { root: scroller, rootMargin: "400px" });
    watcher.observe(more);
    sizer = new ResizeObserver(() => fitTiles(grid));
    sizer.observe(grid);
    onEsc = o.onClose;
    // the canvas pans and zooms with the wheel and the pointer: not under the browser
    ["wheel", "pointerdown"].forEach((t) => (o.modal ? box : card).addEventListener(t, (e) => e.stopPropagation()));
    if (o.modal) box.addEventListener("click", (e) => { if (!card.contains(e.target)) o.onClose(); });
    card.addEventListener("click", (e) => {
        if (e.target.closest("[data-skip]")) return o.onClose();
        const chip = e.target.closest("[data-kind]");
        if (chip) return show(chip.dataset.kind);
        const t = e.target.closest("[data-layout]");
        if (!t) return;
        const html = items.get(t.dataset.layout);
        if (!html) return;
        hide();
        o.onPick(html);
    });
    const form = card.querySelector("[data-ai]");
    if (form) form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const prompt = form.prompt.value.trim(), msg = card.querySelector("[data-ai-msg]");
        msg.classList.remove("hidden");
        if (!prompt) { msg.className = "px-5 pt-2 text-xs text-red-600"; msg.textContent = "Describe the page first."; return; }
        msg.className = "px-5 pt-2 text-xs text-neutral-500"; msg.textContent = "Drafting the page…";
        const res = await draftPage(prompt);
        if (!res.ok) { msg.className = "px-5 pt-2 text-xs text-red-600"; msg.textContent = res.message || "Couldn't draft the page. Try again."; }
    });
    show("all");
}

// ── An empty page: a tip pointing at the wireframes ─────────────────────────────────────────────────────────────────
// Instead of covering the page, an empty page gets a small tip beside the Properties panel's "Add a wireframe" button (which pulses), or
// under the panel's toolbar button while the panel is closed. It opens the wireframes itself too, and can be dismissed for the page.
let tip = null, tipTimer = 0;
function hideTip() {
    clearInterval(tipTimer); tipTimer = 0;
    if (tip) { tip.remove(); tip = null; }
    delete document.body.dataset.wfHint;
}
function placeTip() {
    if (!tip) return;
    const btn = document.querySelector("#inspector .wfbtn"), r = btn && btn.offsetParent ? btn.getBoundingClientRect() : null;
    const arrow = tip.querySelector("[data-arrow]");
    if (r && r.width) { // beside the button, pointing at it; below it when beside would cover the toolbar
        const w = tip.offsetWidth, h = tip.offsetHeight, side = { left: r.left - w - 14, top: Math.max(8, r.top + r.height / 2 - h / 2) };
        const bar = document.getElementById("pillR"), b = bar && bar.getBoundingClientRect();
        const covers = b && b.width && side.left < b.right && side.left + w > b.left && side.top < b.bottom && side.top + h > b.top;
        if (!covers) {
            Object.assign(tip.style, { left: `${Math.max(8, side.left)}px`, top: `${side.top}px` });
            Object.assign(arrow.style, { left: "", right: "-6px", top: "50%", transform: "translateY(-50%) rotate(45deg)" });
        } else {
            const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
            Object.assign(tip.style, { left: `${left}px`, top: `${r.bottom + 12}px` });
            Object.assign(arrow.style, { right: "", left: `${Math.min(w - 20, Math.max(8, r.left + r.width / 2 - left - 6))}px`, top: "-6px", transform: "rotate(45deg)" });
        }
        tip.querySelector("[data-say]").textContent = "Pick a layout for this empty page.";
    } else { // the panel is closed: under its toolbar button
        const pb = document.getElementById("panelBtn"), q = pb.getBoundingClientRect();
        Object.assign(tip.style, { left: `${Math.max(8, q.right - tip.offsetWidth + 6)}px`, top: `${q.bottom + 12}px` });
        Object.assign(arrow.style, { left: "", right: "14px", top: "-6px", transform: "rotate(45deg)" });
        tip.querySelector("[data-say]").textContent = "Open the panel and select from wireframes.";
    }
}
function showTip() {
    if (tip) return placeTip();
    tip = document.createElement("div");
    tip.id = "wireframeTip";
    tip.className = "fixed z-[70] w-60 rounded-xl bg-neutral-900 p-3 text-white shadow-[0_8px_30px_rgba(0,0,0,.25)]";
    tip.innerHTML = `<span data-arrow class="absolute h-3 w-3 bg-neutral-900"></span>
        <div class="flex items-start justify-between gap-2"><p class="text-[12px] font-semibold">Start from a wireframe</p>
            <button type="button" data-x title="Dismiss" class="-mr-1 -mt-1 rounded px-1 text-neutral-400 hover:text-white">×</button></div>
        <p data-say class="mt-1 text-[11px] leading-snug text-neutral-300"></p>
        <button type="button" data-go class="mt-3 w-full rounded-md bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-900 hover:bg-neutral-100">Select from wireframes</button>`;
    document.body.appendChild(tip);
    document.body.dataset.wfHint = "1"; // the panel's button pulses (styles.css)
    tip.querySelector("[data-x]").addEventListener("click", () => { dismissed.add(S.curKey); hideTip(); });
    tip.querySelector("[data-go]").addEventListener("click", () => openWireframes(null));
    placeTip();
    tipTimer = setInterval(placeTip, 250); // the panel opens, closes and scrolls: the tip follows its button
}

/** On an empty page, the tip; anywhere else, none. Called whenever the page or its content changes. */
export function syncLayoutPicker() {
    const want = S.mode === "edit" && config.ui.panels !== false && model.markup.trim() === "" && !dismissed.has(S.curKey);
    if (want) showTip(); else hideTip();
}

/**
 * The wireframe browser as a popup, from the Properties panel: `target` is the selected element ({ path, tag }) or null for the page.
 * A pick goes inside that element (after what it holds) or at the end of the page (or fills it when it is empty). One undo step.
 */
export function openWireframes(target) {
    hideTip();
    const into = target && target.path && target.path.length ? target : null;
    browse({
        title: into ? `Add a wireframe inside this ${into.tag}` : model.markup.trim() === "" ? "Start with a layout" : "Add a wireframe to the page", modal: true, into, onClose: hide,
        frames: into ? [] : framesHere(), ai: !into && model.markup.trim() === "", // for the page: "Like <page>" and, while it is empty, the AI box
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
