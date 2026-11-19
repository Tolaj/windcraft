// The Scroll strip: one slim row over the bottom of the canvas to set up a Scroll story. Its segments are the story's sections, in the order they are
// down the page, each with a small picture of the 3D model in that section's pose; the playhead runs over them (drag it, or Play). Clicking a segment
// (or its chip on the canvas) picks it: the model shows that pose, turning, moving or sizing it saves into that section, and a small popover holds the
// section's own settings (its words when away, remove). The page keeps plain attributes (data-wc-view, data-wc-words on the sections); the frame's
// agent reads and writes them and sends what to show ({ type: "story" }).
import { $, esc, send } from "./base.js";
import { cmd } from "./frame-messages.js";
import { WORDS } from "../../../core/model3d.js";

let box = null, info = null, playing = 0, scrubU = 1, drag = false;

const stop = () => { if (playing) { cancelAnimationFrame(playing); playing = 0; } };

/** Shows the strip for a story (`next`: what the frame sent), or closes it (null). */
export function storyDrawer(next) {
    info = next;
    if (!info) { stop(); if (box) { box.remove(); box = null; } return; }
    if (!box) mount();
    paint();
}

/** Opens the strip for the selected model's story (the toolbar's Scroll story button). */
export const openStory = (path) => send({ cmd: "storyOpen", path });

const ICON = {
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="2.6"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    pick: '<path d="M5 4.5 11 19l2.2-6.3L19.5 10.5z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const ib = (act, k, title, on) => `<button type="button" data-act="${act}" title="${title}" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-blue-600 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}">${icon(k)}</button>`;

function mount() {
    box = document.createElement("div");
    box.id = "scrollDrawer";
    box.className = "absolute bottom-3 left-1/2 z-[55] w-[min(920px,calc(100%-24px))] -translate-x-1/2 text-xs text-neutral-700";
    $("canvas").appendChild(box);
    // the canvas pans on wheel and selects on a press: neither may reach it from the strip
    ["wheel", "pointerdown"].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));
    box.addEventListener("click", onClick);
    box.addEventListener("change", (e) => {
        const w = e.target.closest("[data-words]");
        if (w) cmd({ cmd: "storyWords", i: Number(w.dataset.words), value: e.target.value || null });
    });
    // the playhead: drag it along the track to see the model along the scroll
    box.addEventListener("pointerdown", (e) => {
        const h = e.target.closest("[data-head]");
        if (!h) return;
        e.preventDefault();
        stop();
        drag = true;
        h.setPointerCapture(e.pointerId);
        const move = (ev) => scrubTo(ev.clientX);
        const up = () => { setTimeout(() => { drag = false; }, 0); h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); };
        h.addEventListener("pointermove", move);
        h.addEventListener("pointerup", up);
    });
}

// the track's x as a place along the scroll: the middle of the first segment is 1, the middle of the last is the number of sections
function scrubTo(clientX) {
    const t = box && box.querySelector("[data-track]");
    if (!t || !info || !info.steps.length) return;
    const r = t.getBoundingClientRect(), n = info.steps.length;
    scrubU = Math.min(n, Math.max(1, ((clientX - r.left) / r.width) * n + 0.5));
    send({ cmd: "storyScrub", u: scrubU });
    paintHead();
}

function onClick(e) {
    const t = e.target.closest("[data-act]");
    if (!t || drag) return;
    const a = t.dataset.act, i = Number(t.dataset.i);
    if (a === "close") { stop(); send({ cmd: "storyClose" }); return; }
    if (a === "pickmode") { stop(); send({ cmd: "storyPickMode", on: !info.picking }); return; }
    if (a === "pick") { stop(); send({ cmd: "storyPick", i: info.cur === i ? -1 : i }); return; }
    if (a === "add") { stop(); cmd({ cmd: "storyAdd" }); return; }
    if (a === "remove") { stop(); cmd({ cmd: "storyRemove", i }); return; }
    if (a === "play") {
        if (playing) { stop(); paintHead(); return; }
        const n = info.steps.length;
        if (n < 2) return;
        const t0 = performance.now(), dur = Math.max(2400, n * 1400);
        if (info.cur >= 0) send({ cmd: "storyPick", i: -1 });
        const tick = (now) => {
            const k = Math.min(1, (now - t0) / dur);
            scrubU = 1 + k * (n - 1);
            send({ cmd: "storyScrub", u: scrubU });
            playing = k < 1 ? requestAnimationFrame(tick) : 0;
            paintHead();
        };
        playing = requestAnimationFrame(tick);
        paintHead();
    }
}

function paint() {
    const n = info.steps.length, cur = info.cur;
    const seg = (s, i) => `<button type="button" data-act="pick" data-i="${i}" title="${i === cur ? "Picked: turn, move or size the model, it's saved for this section. Click again to let go" : `${esc(s.pose)}. Click to pose the model for this section`}"
        class="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-1 text-left ${i === cur ? "border-blue-600 bg-blue-50 text-blue-800" : "border-neutral-200 bg-neutral-50 hover:border-neutral-400"}">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-white">${s.snap ? `<img src="${s.snap}" alt="" class="h-full w-full object-cover">` : `<span class="text-[9px] text-neutral-400">${esc(s.pose.split(",")[0])}</span>`}</span>
        <span class="min-w-0 truncate"><b class="font-medium">${i + 1}</b> ${esc(s.name)}</span></button>`;
    const sel = cur >= 0 ? info.steps[cur] : null;
    // the picked section's own settings, over its segment
    const pop = sel ? `<div class="absolute bottom-[60px] z-10 w-60 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-[0_8px_24px_rgba(0,0,0,.12)]" style="left:clamp(0px, calc(${((cur + 0.5) / n) * 100}% - 120px), calc(100% - 240px))">
        <div class="mb-1 truncate font-semibold text-neutral-900">${cur + 1} · ${esc(sel.name)}</div>
        <p class="mb-2 leading-snug text-neutral-500">Turn, move or size the model now: it's saved for this section (${esc(sel.pose)}).</p>
        <label class="flex items-center justify-between gap-2"><span class="text-neutral-500">Words when away</span>
            <select data-words="${cur}" class="rounded-md border border-neutral-200 bg-white px-1.5 py-1">${WORDS.map(([v, l]) => `<option value="${v}"${v === sel.words ? " selected" : ""}>${l.replace(" when away", "")}</option>`).join("")}</select></label>
        ${n > 1 ? `<button type="button" data-act="remove" data-i="${cur}" class="mt-2 text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline">Remove this section</button>` : ""}</div>` : "";
    const note = info.picking ? `<div class="absolute bottom-[60px] left-0 right-0 z-10 flex items-center justify-between gap-3 rounded-xl bg-blue-600 px-3 py-2 text-white shadow-lg">
        <span>Click the parts of the page that should move the model, top to bottom; click one again to take it out. ${n ? `${n} chosen.` : ""}</span>
        <button type="button" data-act="pickmode" class="shrink-0 rounded-md bg-white px-2.5 py-1 font-medium text-blue-700">Done</button></div>` : "";
    box.innerHTML = `${note}${pop}
        <div class="flex h-[52px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-1.5 shadow-[0_6px_24px_rgba(0,0,0,.12)]">
            ${ib("play", playing ? "pause" : "play", "Play the scroll on the canvas", false)}
            <div data-track class="relative flex min-w-0 flex-1 gap-1">${n ? info.steps.map(seg).join("") : `<span class="flex h-10 flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-neutral-400">No sections yet</span>`}
                ${n > 1 ? `<span data-head title="Drag to see the model along the scroll" class="absolute -bottom-1 -top-1 z-[1] w-3 -translate-x-1/2 cursor-ew-resize touch-none" style="left:${((scrubU - 0.5) / n) * 100}%"><span class="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded bg-blue-600"></span><span class="pointer-events-none absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-blue-600"></span></span>` : ""}</div>
            ${ib("add", "add", "Add a section after the last", false)}
            ${ib("pickmode", "pick", "Choose which parts of the page move the model", info.picking)}
            ${ib("close", "close", "Close", false)}
        </div>`;
}

// only the playhead and the Play button change while the scroll plays or is dragged
function paintHead() {
    if (!box || !info) return;
    const h = box.querySelector("[data-head]"), p = box.querySelector('[data-act="play"]'), n = info.steps.length;
    if (h) h.style.left = `${((scrubU - 0.5) / n) * 100}%`;
    if (p) p.innerHTML = icon(playing ? "pause" : "play");
}
