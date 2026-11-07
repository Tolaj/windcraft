import { config } from "../config.js";
import { $, S, esc, model } from "./base.js";
import { addToEmpty } from "./add-menu.js";
import { cmd } from "./frame-messages.js";
import { stillDocument } from "./docs.js";
import { curWidth } from "./plane.js";
import { screenHeightFor } from "../../playground/component-source.js";
import { KIND_NAMES, LAYOUTS, SECTIONS, wireframe } from "../../../core/wireframes.js";
export { LAYOUTS, SECTIONS };

// ── Wireframes: blank page and section skeletons to start from ───────────────────────────────────────────────────
// The Properties panel's "Add a wireframe" opens one browser of them, the same for the page and for a selected box (blank regions in
// two greys, no placeholder words; they and their endless generator live in core/wireframes.js). A pick is plain Tailwind HTML put in
// like anything pasted, so it is edited, dragged and undone like the rest. An empty page gets a tip pointing at the button.

/** A page wireframe put inside a box: as tall as a good part of a screen, not the whole screen (min-h-screen in a section would be). */
const inBox = (html) => html.replace(/\bmin-h-screen\b/g, "min-h-[32rem]");

const dismissed = new Set(); // pages where the tip was dismissed: it stays away from them
let box = null, keyShown = null, sizer = null, onEsc = null;

// ── Previews: what the pick will really be ────────────────────────────────────────────────────────────────────────────
// A tile is not the wireframe drawn with the editor's own styles (those follow the editor window's width, not the page's, and have
// neither the project's theme nor the page's CSS): it is measured in a hidden copy of the page, styled as the canvas styles it, at the
// page's width and on its screen, put exactly where the pick would go (inside the selected box, or at the end of the page), and then
// drawn from those measurements. What the tile shows is what lands on the canvas.
let probe = null; // { frame, ready } while the browser is open

function openProbe() {
    closeProbe();
    const w = curWidth(), f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    // the page's screen: a min-h-screen is as tall here as on the canvas (plane.js deviceHeight, component-source.js screenHeightFor)
    f.style.cssText = `position:fixed;left:-30000px;top:0;width:${w}px;height:${screenHeightFor(w)}px;border:0;visibility:hidden;pointer-events:none;`;
    f.srcdoc = stillDocument();
    const ready = new Promise((r) => { f.addEventListener("load", () => r(), { once: true }); setTimeout(r, 8000); });
    document.body.appendChild(f);
    probe = { frame: f, ready, w };
}
function closeProbe() { if (probe) { probe.frame.remove(); probe = null; } }

/** Until the page's Tailwind has written the styles for what was just added (its stylesheet stops changing), at most ~1s. */
async function stylesSettled(doc) {
    const size = () => [...doc.querySelectorAll("style")].reduce((n, st) => n + st.textContent.length, 0);
    let last = -1, same = 0;
    for (let i = 0; i < 50 && same < 2; i++) {
        await new Promise((r) => setTimeout(r, 20));
        const now = size();
        same = now === last ? same + 1 : 0;
        last = now;
    }
}

/** Each wireframe's boxes where it would land: [{ w, h, boxes: [[x, y, w, h, css]] }], in the order given. */
async function measure(list, into) {
    const p = probe;
    if (!p) return [];
    await p.ready;
    const doc = p.frame.contentDocument;
    if (!doc || !doc.body || probe !== p) return [];
    const target = into ? into.path.reduce((el, i) => el && el.children[i], doc.body) : doc.body;
    if (!target) return [];
    // all of them first, out of the page, so its Tailwind writes their styles in one go
    const stage = doc.createElement("div");
    stage.hidden = true;
    stage.innerHTML = list.join("");
    doc.documentElement.appendChild(stage);
    await stylesSettled(doc);
    if (probe !== p || !doc.defaultView) return []; // the browser closed meanwhile (a pick): its copy of the page is gone
    const out = [...stage.children].map((n) => {
        target.appendChild(n); // one at a time, exactly where the pick goes: alone, as it will be
        const o = n.getBoundingClientRect(), boxes = [];
        [n, ...n.querySelectorAll("*")].forEach((el) => {
            const r = el.getBoundingClientRect(), cs = doc.defaultView.getComputedStyle(el);
            if (!r.width || !r.height || cs.visibility === "hidden") return;
            const bg = cs.backgroundColor, bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
            const painted = (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) || bw.some((b) => parseFloat(b) > 0);
            if (!painted) return; // only what shows: a plain wrapper draws nothing
            boxes.push([r.left - o.left, r.top - o.top, r.width, r.height,
                `background:${bg};border-style:${cs.borderTopStyle} ${cs.borderRightStyle} ${cs.borderBottomStyle} ${cs.borderLeftStyle};border-width:${bw.join(" ")};border-color:${cs.borderTopColor} ${cs.borderRightColor} ${cs.borderBottomColor} ${cs.borderLeftColor};border-radius:${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius};`]);
        });
        n.remove();
        return { w: o.width, h: o.height, boxes };
    });
    stage.remove();
    return out;
}

/** A tile: an empty preview the measurements fill in (paint), and its name. Its shape is the page's screen. */
function tile(id, name) {
    const w = probe ? probe.w : 1280;
    return `<button type="button" data-layout="${esc(id)}" class="group text-left">
        <div class="relative overflow-hidden rounded-lg border border-neutral-200 bg-white transition group-hover:border-neutral-900" style="aspect-ratio:${w} / ${screenHeightFor(w)}"><div data-shrink class="pointer-events-none absolute left-0 top-0 origin-top-left"></div></div>
        <div class="mt-1.5 truncate text-xs text-neutral-600 group-hover:text-neutral-900" title="${esc(name)}">${esc(name)}</div>
    </button>`;
}
/** Draws a measured wireframe into its tile. */
function paint(t, m) {
    const f = t && t.querySelector("[data-shrink]");
    if (!f || !m) return;
    f.dataset.w = String(m.w);
    f.style.width = `${m.w}px`;
    f.style.height = `${m.h}px`;
    f.innerHTML = m.boxes.map(([x, y, w, h, css]) => `<div style="position:absolute;box-sizing:border-box;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}"></div>`).join("");
}
/** Shrinks each preview to its tile, whole width in view; a short one (a section) sits in the middle of its tile rather than at the top. */
function fitTiles(node) {
    node.querySelectorAll("[data-shrink][data-w]").forEach((f) => {
        const w = f.parentElement.clientWidth, h = f.parentElement.clientHeight;
        if (!w) return;
        const k = w / Math.max(1, parseFloat(f.dataset.w)), tall = f.offsetHeight;
        f.style.transform = `translateY(${Math.max(0, (h - tall * k) / 2)}px) scale(${k})`;
    });
}

let watcher = null; // the endless list's "more as you scroll" observer
function hide() { if (watcher) { watcher.disconnect(); watcher = null; } if (sizer) { sizer.disconnect(); sizer = null; } if (box) { box.remove(); box = null; } closeProbe(); keyShown = null; onEsc = null; }
function skip() { dismissed.add(S.curKey); hide(); }

/**
 * The wireframe browser: every wireframe, endless. The hand-picked ones lead, then the generator's (core/wireframes.js), twelve more
 * each time the end of the list comes into view, repeats skipped, filtered by kind with the chips.
 *   o.into    the selected element ({ path, tag }) a pick goes inside, or null for the page
 *   o.modal   a dialog over a dimmed canvas (the Properties panel's), or a card that leaves the canvas usable
 *   o.onPick(html), o.onClose()
 */
function browse(o) {
    hide();
    const into = o.into && o.into.path && o.into.path.length ? o.into : null;
    const fitIn = (html) => (into ? inBox(html) : html);
    box = document.createElement("div");
    box.id = "layoutPicker";
    box.dataset.modal = o.modal ? "1" : "";
    // a dialog sits over the canvas toolbars too; the empty page's card under them, so they stay usable
    box.className = o.modal ? "absolute inset-0 z-[60] flex items-center justify-center bg-black/10 p-6" : "pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-6 pb-6 pt-20";
    const chips = [["all", "All"], ...Object.entries(KIND_NAMES)];
    box.innerHTML = `<div data-card class="pointer-events-auto flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_48px_rgba(0,0,0,.18)]">
        <div class="flex items-center justify-between gap-4 px-5 pt-5"><h2 class="truncate text-[15px] font-semibold text-neutral-900">${esc(o.title)}</h2>
            <button type="button" data-skip class="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">${esc(o.closeLabel || "Close")}</button></div>
        <div data-chips class="flex flex-wrap gap-1.5 px-5 pb-3 pt-3">${chips.map(([k, l]) => `<button type="button" data-kind="${k}" class="rounded-full border px-3 py-1 text-xs">${esc(l)}</button>`).join("")}</div>
        <div data-scroll class="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100 px-5 pb-5 pt-4"><div data-grid class="grid grid-cols-4 gap-3"></div>
            <p data-more class="py-6 text-center text-xs text-neutral-400">Loading more…</p></div>
    </div>`;
    $("canvas").appendChild(box);
    const card = box.querySelector("[data-card]"), grid = box.querySelector("[data-grid]"), more = box.querySelector("[data-more]"), scroller = box.querySelector("[data-scroll]");
    const items = new Map();
    let kind = "all", n = 0, seen = new Set(), done = false;
    openProbe();
    let pending = [], painting = false, gen = 0;
    /** Measures the tiles added since the last time, in the copy of the page, and draws them. */
    async function paintPending() {
        if (painting) return;
        painting = true;
        while (pending.length && box) {
            const batch = pending.splice(0, 12), g = gen;
            const ms = await measure(batch.map((id) => items.get(id)), into);
            if (g !== gen || !box) continue; // the list was refiltered meanwhile
            batch.forEach((id, i) => paint(grid.querySelector(`[data-layout="${CSS.escape(id)}"]`), ms[i]));
            fitTiles(grid);
        }
        painting = false;
    }
    const add = (id, name, html) => { items.set(id, html); grid.insertAdjacentHTML("beforeend", tile(id, name)); pending.push(id); };
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
        paintPending();
        // still room below (a short list, a tall window): fill it, the end of the list must be out of view to wait for a scroll
        requestAnimationFrame(() => { if (!done && box && more.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom + 400) loadMore(); });
    }
    function show(k) {
        kind = k; n = 0; seen = new Set(); done = false; items.clear(); grid.innerHTML = ""; pending = []; gen++; more.textContent = "Loading more…";
        box.querySelectorAll("[data-kind]").forEach((c) => { c.className = `rounded-full border px-3 py-1 text-xs ${c.dataset.kind === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`; });
        const picked = (list) => list.forEach(([id, name, html]) => { seen.add(html); add(`pick-${id}`, name, fitIn(html)); });
        // the hand-picked ones lead the list, the same for a box and for the page
        if (k === "all") picked([...SECTIONS, ...LAYOUTS]);
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
    show("all");
}

// ── An empty page: a tip pointing at the wireframes ─────────────────────────────────────────────────────────────────
// Instead of covering the page, an empty page gets a small tip beside the Properties panel's "Add a wireframe" button (which pulses), or
// under the panel's toolbar button while the panel is closed. It opens the wireframes itself too, and can be dismissed for the page.
let tip = null, tipTimer = 0;
/** "Don't show this again": the tip stays off on every page, in this browser (the panel's "Add a wireframe" button still works). */
const NEVER = "wc:wireframeTip:never";
const neverTip = () => { try { return localStorage.getItem(NEVER) === "1"; } catch { return false; } };
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
        <button type="button" data-go class="mt-3 w-full rounded-md bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-900 hover:bg-neutral-100">Select from wireframes</button>
        <button type="button" data-never class="wftip-never">Don't show this again</button>`;
    document.body.appendChild(tip);
    document.body.dataset.wfHint = "1"; // the panel's button pulses (styles.css)
    tip.querySelector("[data-x]").addEventListener("click", () => { dismissed.add(S.curKey); hideTip(); });
    tip.querySelector("[data-go]").addEventListener("click", () => openWireframes(null));
    tip.querySelector("[data-never]").addEventListener("click", () => { try { localStorage.setItem(NEVER, "1"); } catch {} hideTip(); });
    placeTip();
    tipTimer = setInterval(placeTip, 250); // the panel opens, closes and scrolls: the tip follows its button
}

/** On an empty page, the tip; anywhere else, none. Called whenever the page or its content changes. */
export function syncLayoutPicker() {
    const want = S.mode === "edit" && config.ui.panels !== false && !S.canvasOnly && model.markup.trim() === "" && !dismissed.has(S.curKey) && !neverTip();
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
        title: into ? `Add a wireframe inside this ${into.tag}` : "Add a wireframe to the page", modal: true, into, onClose: hide,
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
