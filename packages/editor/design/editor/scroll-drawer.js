// The Scroll strip: one slim row over the bottom of the canvas to set up how a 3D model reacts: while the page scrolls (Scroll), when something is clicked
// (Click) and when something is hovered (Hover). Its segments are the elements chosen for the tab (sections, buttons, the model itself), each with a small
// picture of the model in the pose they give it; on Scroll the playhead runs over them (drag it, or Play). Clicking a segment
// (or its chip on the canvas) picks it: the model shows that pose, turning, moving or sizing it saves into that section, and a small popover holds the
// section's own settings (its words when away, remove). The page keeps plain attributes (data-wc-view, data-wc-words on the sections); the frame's
// agent reads and writes them and sends what to show ({ type: "story" }).
import { $, esc, send } from "./base.js";
import { cmd } from "./frame-messages.js";
import { WORDS } from "../../../core/model3d.js";

let box = null, info = null, playing = 0, scrubU = 1, dragEnd = 0;

const stop = () => { if (playing) { cancelAnimationFrame(playing); playing = 0; } };

/** Shows the strip for a story (`next`: what the frame sent), or closes it (null). */
export function storyDrawer(next) {
    info = next;
    if (!info) { stop(); if (box) { box.remove(); box = null; } }
    else { if (!box) mount(); paint(); }
    // the element's toolbar keeps above the strip and its section card (frame-handles.js): now, and again once the selection that came with this has
    // placed the toolbar (it can arrive just after)
    const moved = () => window.dispatchEvent(new Event("wc-strip"));
    moved(); requestAnimationFrame(moved); setTimeout(moved, 200);
}

/** Opens the strip for the selected model's story (the toolbar's Scroll story button). */
export const openStory = (path) => send({ cmd: "storyOpen", path });

const ICON = {
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="2.6"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const ib = (act, k, title, on, off) => `<button type="button" data-act="${act}" title="${title}" aria-pressed="${Boolean(on)}"${off ? " aria-disabled=\"true\"" : ""} class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? "bg-blue-600 text-white" : off ? "text-neutral-300" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"}">${icon(k)}</button>`;

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
        const c = e.target.closest("[data-color]");
        if (c) cmd({ cmd: "storyColor", i: Number(c.dataset.color), value: c.value });
    });
    box.addEventListener("click", (e) => {
        const c = e.target.closest("[data-colorclear]");
        if (c) cmd({ cmd: "storyColor", i: Number(c.dataset.colorclear), value: "" });
    });
    // the playhead: drag it along the track to see the model along the scroll
    box.addEventListener("pointerdown", (e) => {
        const h = e.target.closest("[data-head]");
        if (!h) return;
        e.preventDefault();
        stop();
        h.setPointerCapture(e.pointerId);
        const x0 = e.clientX, y0 = e.clientY;
        let moved = false;
        const move = (ev) => { if (!moved && Math.abs(ev.clientX - x0) < 3) return; moved = true; scrubTo(ev.clientX); };
        const up = (ev) => {
            ["pointermove", "pointerup", "pointercancel", "lostpointercapture"].forEach((t, i) => h.removeEventListener(t, i ? up : move));
            if (moved) { dragEnd = performance.now(); return; }
            // a click on the playhead (no drag) is a click on the section under it: the playhead sits over the middle of one
            if (ev && ev.type === "pointerup") { const seg = document.elementsFromPoint(x0, y0).map((el) => el.closest && el.closest('[data-act="pick"]')).find(Boolean); if (seg) seg.click(); }
        };
        h.addEventListener("pointermove", move);
        ["pointerup", "pointercancel", "lostpointercapture"].forEach((t) => h.addEventListener(t, up));
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
    const k = e.target.closest("[data-kind]");
    if (k && !(performance.now() - dragEnd < 250)) { stop(); if (k.dataset.kind !== info.kind) send({ cmd: "storyKind", kind: k.dataset.kind }); return; }
    const t = e.target.closest("[data-act]");
    if (!t || performance.now() - dragEnd < 250) return; // (the click that ends a drag of the playhead)
    const a = t.dataset.act, i = Number(t.dataset.i);
    if (a === "close") { stop(); send({ cmd: "storyClose" }); return; }
    if (a === "pickmode") { stop(); if (!info.picking) send({ cmd: "storyPickMode", on: true }); else flash("Click an element on the page to add it, or Done when you're finished."); return; } // + always asks for an element
    if (a === "pickdone") { send({ cmd: "storyPickMode", on: false }); return; }
    if (a === "unpick") { send({ cmd: "storyPick", i: -1 }); return; }
    if (a === "pick") { stop(); send({ cmd: "storyPick", i: info.cur === i ? -1 : i }); return; }
    if (a === "pin") { cmd({ cmd: "storyPin", on: !info.pin }); return; }
    if (a === "remove") { stop(); cmd({ cmd: "storyRemove", i }); return; }
    if (a === "play") {
        if (playing) { stop(); paintHead(); return; }
        const n = info.steps.length;
        if (n < 2) { flash(n ? "Choose one more element to play: the model moves between them." : "Choose at least two elements on the page first: the model moves between them."); return; }
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
    const n = info.steps.length, cur = info.cur, kind = info.kind || "scroll";
    const seg = (s, i) => `<button type="button" data-act="pick" data-i="${i}" title="${i === cur ? "Picked: turn, move or size the model, it's saved for this section. Click again to let go" : `${esc(s.pose)}. Click to pose the model for this section`}"
        class="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-1 text-left ${i === cur ? "border-blue-600 bg-blue-50 text-blue-800" : "border-neutral-200 bg-neutral-50 hover:border-neutral-400"}">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-white">${s.snap ? `<img src="${s.snap}" alt="" class="h-full w-full object-cover">` : `<span class="text-[9px] text-neutral-400">${esc(s.pose.split(",")[0])}</span>`}</span>
        <span class="min-w-0 flex-1 truncate"><b class="font-medium">${i + 1}</b> ${esc(s.name)}</span>${s.color ? `<span class="mr-1 h-3 w-3 shrink-0 rounded-full border border-black/10" style="background:${esc(s.color)}" title="Paints the model ${esc(s.color)}"></span>` : ""}</button>`;
    const sel = cur >= 0 ? info.steps[cur] : null;
    const tabs = `<div class="flex shrink-0 rounded-lg bg-neutral-100 p-0.5">${[["scroll", "Scroll"], ["click", "Click"], ["hover", "Hover"]].map(([k, l]) => `<button type="button" data-kind="${k}" title="${k === "scroll" ? "The model moves as the page scrolls" : k === "click" ? "The model changes when something is clicked" : "The model changes while something is hovered"}" class="rounded-md px-2 py-1 ${k === kind ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"}">${l}${info.counts && info.counts[k] ? `<span class="ml-1 text-neutral-400">${info.counts[k]}</span>` : ""}</button>`).join("")}</div>`;
    // the picked section's own settings, over its segment
    const pop = sel ? `<div class="absolute bottom-[60px] z-10 w-60 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-[0_8px_24px_rgba(0,0,0,.12)]" style="left:clamp(0px, calc(${((cur + 0.5) / n) * 100}% - 120px), calc(100% - 240px))">
        <div class="mb-1 flex items-center gap-2"><span class="min-w-0 flex-1 truncate font-semibold text-neutral-900">${cur + 1} · ${esc(sel.name)}</span>
            <button type="button" data-act="unpick" title="Close (the model shows its own pose again)" class="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">${icon("close")}</button></div>
        <p class="mb-2 leading-snug text-neutral-500">Turn, move or size the model now: it's saved for this element (${esc(sel.pose)}).${kind === "click" ? " The model goes there when it is clicked." : kind === "hover" ? " The model goes there while it is hovered, and back when the pointer leaves." : ""}</p>
        ${kind === "scroll" ? `<label class="flex items-center justify-between gap-2"><span class="text-neutral-500">Words when away</span>
            <select data-words="${cur}" class="rounded-md border border-neutral-200 bg-white px-1.5 py-1">${WORDS.map(([v, l]) => `<option value="${v}"${v === sel.words ? " selected" : ""}>${l.replace(" when away", "")}</option>`).join("")}</select></label>`
        : `<label class="flex items-center justify-between gap-2"><span class="text-neutral-500">Also paint it</span><span class="flex items-center gap-1.5">
            <input type="color" data-color="${cur}" value="${/^#[0-9a-f]{6}$/i.test(sel.color) ? sel.color : "#e11d48"}" class="h-6 w-8 cursor-pointer rounded border border-neutral-200 bg-white p-0">
            ${sel.color ? `<button type="button" data-colorclear="${cur}" class="text-neutral-500 underline-offset-2 hover:underline" title="Do not paint the model">Clear</button>` : `<span class="text-neutral-400">not painted</span>`}</span></label>`}
        <button type="button" data-act="remove" data-i="${cur}" class="mt-2 text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline" title="It stays on the page; it just no longer moves the model">${kind === "scroll" ? "Take out of the story" : `Stop it ${kind === "click" ? "reacting to clicks" : "reacting to hover"}`}</button></div>` : "";
    const note = info.picking ? `<div class="absolute bottom-[60px] left-0 right-0 z-10 flex items-center justify-between gap-3 rounded-xl bg-blue-600 px-3 py-2 text-white shadow-lg">
        <span>${kind === "scroll" ? "Click the elements on the page that should move the model, top to bottom (each one is a pose)" : `Click the elements that should move the model when ${kind === "click" ? "clicked" : "hovered"}: a button, a card, or the model itself (each one gets a pose)`}; click one again to take it out. The page is not changed. ${n ? `${n} chosen.` : ""}</span>
        <button type="button" data-act="pickdone" class="shrink-0 rounded-md bg-white px-2.5 py-1 font-medium text-blue-700">Done</button></div>` : "";
    box.innerHTML = `${note}${pop}
        <div class="flex h-[52px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-1.5 shadow-[0_6px_24px_rgba(0,0,0,.12)]">
            ${tabs}
            ${kind === "scroll" ? ib("play", playing ? "pause" : "play", n < 2 ? "Choose at least two elements to play" : "Play the scroll on the canvas", false, n < 2) : ""}
            <div data-track class="relative flex min-w-0 flex-1 gap-1">${n ? info.steps.map(seg).join("") : `<button type="button" data-act="pickmode" class="flex h-10 flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-500 hover:text-neutral-800">${info.picking ? "Click an element on the page to add it" : `Nothing yet: click here or + to choose ${kind === "scroll" ? "the elements" : `what is ${kind === "click" ? "clicked" : "hovered"}`} on the page`}</button>`}
                ${kind === "scroll" && n > 1 ? `<span data-head title="Drag to see the model along the scroll" class="absolute -bottom-1 -top-1 z-[1] w-3 -translate-x-1/2 cursor-ew-resize touch-none" style="left:${((scrubU - 0.5) / n) * 100}%"><span class="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded bg-blue-600"></span><span class="pointer-events-none absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-blue-600"></span></span>` : ""}</div>
            ${ib("pickmode", "add", info.picking ? "Click elements on the page to add or take them out" : "Add elements: click them on the page", info.picking)}
            ${kind === "scroll" ? ib("pin", "pin", info.pin ? "Kept on screen while the story scrolls: click to let it scroll with the page" : "Keep the model on screen until the last element has scrolled past (the layout is not changed)", info.pin) : ""}
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

// a short note over the strip (why something didn't happen)
function flash(text) {
    if (!box) return;
    const n = document.createElement("div");
    n.className = "absolute bottom-[60px] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900 px-3 py-1.5 text-white shadow-lg";
    n.textContent = text;
    box.appendChild(n);
    setTimeout(() => n.remove(), 2600);
}
