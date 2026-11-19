// The Scroll drawer: one place to set up a Scroll story. Its columns are the story's sections, top to bottom of the page; its rows are what happens
// at each: the 3D model's pose while that section is on screen, and whether the section's words dim or fade when it is away. Clicking a column (or
// its chip on the canvas) shows that section's pose on the model: turning, moving or sizing the model then saves into that section. The playhead
// plays the scroll on the canvas. It sits over the bottom of the canvas, like the models dialog sits over it. The page keeps plain attributes
// (data-wc-view, data-wc-words on the sections); the frame's agent reads and writes them and sends the drawer what it shows ({ type: "story" }).
import { $, esc, send } from "./base.js";
import { cmd } from "./frame-messages.js";
import { WORDS } from "../../../core/model3d.js";

let box = null, info = null, playing = 0, scrubU = 1;

const stop = () => { if (playing) { cancelAnimationFrame(playing); playing = 0; } };

/** Shows the drawer for a story (`next`: what the frame sent), or closes it (null). */
export function storyDrawer(next) {
    info = next;
    if (!info) { stop(); if (box) { box.remove(); box = null; } return; }
    if (!box) mount();
    paint();
}

/** Opens the drawer for the selected model's story (the toolbar's Scroll button). */
export const openStory = (path) => send({ cmd: "storyOpen", path });

function mount() {
    box = document.createElement("div");
    box.id = "scrollDrawer";
    box.className = "absolute inset-x-3 bottom-3 z-[55] rounded-xl border border-neutral-200 bg-white px-4 pb-3 pt-2.5 text-xs text-neutral-700 shadow-[0_8px_32px_rgba(0,0,0,.14)]";
    $("canvas").appendChild(box);
    // the canvas pans on wheel and selects on a press: neither may reach it from the drawer
    ["wheel", "pointerdown"].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));
    box.addEventListener("click", onClick);
    box.addEventListener("change", (e) => {
        const w = e.target.closest("[data-words]");
        if (w) cmd({ cmd: "storyWords", i: Number(w.dataset.words), value: e.target.value || null });
    });
    box.addEventListener("input", (e) => {
        if (!e.target.matches("[data-scrub]")) return;
        stop();
        scrubU = Number(e.target.value);
        send({ cmd: "storyScrub", u: scrubU });
        paintHead();
    });
}

function onClick(e) {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const a = t.dataset.act, i = Number(t.dataset.i);
    if (a === "close") { stop(); send({ cmd: "storyClose" }); return; }
    if (a === "pick") { stop(); send({ cmd: "storyPick", i: info && info.cur === i ? -1 : i }); return; }
    if (a === "add") { stop(); cmd({ cmd: "storyAdd" }); return; }
    if (a === "remove") { stop(); cmd({ cmd: "storyRemove", i }); return; }
    if (a === "play") {
        if (playing) { stop(); paintHead(); return; }
        const n = info.steps.length, t0 = performance.now(), dur = Math.max(2400, n * 1400);
        const tick = (now) => {
            const k = Math.min(1, (now - t0) / dur);
            scrubU = 1 + k * (n - 1);
            send({ cmd: "storyScrub", u: scrubU });
            paintHead();
            playing = k < 1 ? requestAnimationFrame(tick) : 0;
            if (!playing) paintHead();
        };
        playing = requestAnimationFrame(tick);
        paintHead();
    }
}

const col = (n) => `grid-template-columns:76px repeat(${n},minmax(0,1fr)) 40px`;

function paint() {
    const n = info.steps.length, cur = info.cur;
    const cell = "flex min-h-[34px] items-center gap-1.5 border-t border-neutral-100 px-2 py-1.5";
    const head = info.steps.map((s, i) => `<div class="${cell} border-t-0 ${i === cur ? "bg-blue-50" : ""}"><button type="button" data-act="pick" data-i="${i}" class="min-w-0 flex-1 truncate text-left font-medium ${i === cur ? "text-blue-700" : "text-neutral-800"}" title="Show this section's pose on the model">${i + 1}&nbsp; ${esc(s.name)}</button>${n > 1 ? `<button type="button" data-act="remove" data-i="${i}" class="shrink-0 rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" title="Take this section out of the page">×</button>` : ""}</div>`).join("");
    const pose = info.steps.map((s, i) => `<div class="${cell} ${i === cur ? "bg-blue-50" : ""}"><button type="button" data-act="pick" data-i="${i}" class="w-full truncate rounded-md border px-2 py-1 text-left ${i === cur ? "border-blue-600 bg-white text-blue-700" : "border-neutral-200 hover:border-neutral-400"}" title="${i === cur ? "Now turn, move or size the model: it is saved for this section" : "Pick it, then turn, move or size the model"}">${esc(s.pose)}${i === cur ? " · posing" : ""}</button></div>`).join("");
    const words = info.steps.map((s, i) => `<div class="${cell} ${i === cur ? "bg-blue-50" : ""}"><select data-words="${i}" class="w-full rounded-md border border-neutral-200 bg-white px-1.5 py-1">${WORDS.map(([v, l]) => `<option value="${v}"${v === s.words ? " selected" : ""}>${l}</option>`).join("")}</select></div>`).join("");
    box.innerHTML = `<div class="mb-1.5 flex items-center gap-3">
            <span class="text-[13px] font-semibold text-neutral-900">Scroll story</span>
            <button type="button" data-act="play" class="rounded-md border border-neutral-200 px-2 py-0.5 hover:border-neutral-400" data-play title="Play the scroll on the canvas">Play ▶</button>
            <input data-scrub type="range" min="1" max="${Math.max(1, n)}" step="0.01" value="${scrubU}" class="min-w-0 flex-1" title="Drag to see the model along the scroll">
            <span class="hidden text-neutral-400 md:inline">${cur >= 0 ? `Section ${cur + 1}: turn, move or size the model, it's saved here.` : "Pick a section, then pose the model."}</span>
            <button type="button" data-act="close" class="rounded-md px-2 py-0.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" title="Close the drawer">Close</button></div>
        <div class="grid" style="${col(n)}">
            <div class="${cell} border-t-0 text-neutral-400">Section</div>${head}<div class="${cell} border-t-0 justify-center"><button type="button" data-act="add" class="rounded-md border border-neutral-200 px-2 py-0.5 hover:border-neutral-400" title="Add a section after the last, with its own pose">+</button></div>
            <div class="${cell} text-neutral-400">3D model</div>${pose}<div class="${cell}"></div>
            <div class="${cell} text-neutral-400">Words</div>${words}<div class="${cell}"></div>
        </div>`;
}

function paintHead() {
    if (!box) return;
    const r = box.querySelector("[data-scrub]"), p = box.querySelector("[data-play]");
    if (r) r.value = String(scrubU);
    if (p) p.textContent = playing ? "Pause ❚❚" : "Play ▶";
}
