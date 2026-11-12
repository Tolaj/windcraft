import { STRUCTURED, COMMON_RAW, stopsFromKeyframes, keyframesFromStops, checkStops, blankStops } from "../../core/keyframe-model.js";
import { PRESETS, animationValue, keyframesCss } from "../../core/animation-presets.js";

// The keyframe editor: a timeline of stops (0 to 100%), the properties set at the chosen stop, and a live preview with a scrubber. Everything is plain keyframes underneath
// (core/keyframe-model.js), so any preset opens here and what is made here is written into the Tailwind config like a preset is.
//   mountKeyframeEditor(el, { getTiming, onChange }) -> { setKeyframes(kf), getKeyframes(), problem(), replay() }
//   getTiming(): { dur, delay, ease, repeat, dir, fill } from the dialog's settings, so the preview plays as it will in the page. onChange(): something changed.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const field = "rounded-md border border-neutral-200 bg-white px-2 py-1";
const SHAPES = [["square", "Square", "rounded-lg"], ["circle", "Circle", "rounded-full"], ["bar", "Text", "rounded"]];

export function mountKeyframeEditor(el, { getTiming = () => ({}), onChange = () => {} } = {}) {
    let stops = blankStops(), sel = 0, shape = "square", scrub = null;
    const q = (s) => el.querySelector(s);
    el.innerHTML = `<div class="flex h-full min-h-0 flex-col text-xs">
        <div class="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2">
            <label class="flex items-center gap-2"><span class="text-neutral-500">Start from</span><select data-from class="${field}"><option value="">A blank animation</option>${PRESETS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</select></label>
            <label class="flex items-center gap-2"><span class="text-neutral-500">Preview shape</span><select data-shape class="${field}">${SHAPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
            <button type="button" data-replay class="h-7 rounded-md border border-neutral-200 bg-white px-3 hover:bg-neutral-100">Replay</button>
            <label class="ml-auto flex items-center gap-2"><span class="text-neutral-500">Scrub</span><input data-scrub type="range" min="0" max="100" value="0" class="w-40 accent-black" aria-label="Scrub through the animation"></label></div>
        <div class="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
            <div class="w-44 shrink-0"><div class="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white"><div data-box class="pv-box h-12 w-12 bg-neutral-900 text-white"></div></div><p class="mt-2 text-[11px] text-neutral-500">The preview plays with the time and easing below.</p></div>
            <div class="min-w-0 flex-1">
                <p class="mb-1 font-semibold text-neutral-700">Timeline <span class="font-normal text-neutral-500">· click the bar to add a stop, drag a stop to move it</span></p>
                <div class="relative mx-3 h-12 select-none" data-track><div class="absolute inset-x-0 top-5 h-1.5 rounded-full bg-neutral-200"></div><div data-stops></div></div>
                <div class="mx-3 flex justify-between text-[10px] text-neutral-400"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
                <div class="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3" data-props></div>
                <p class="mt-2 min-h-[1rem] text-amber-800" data-problem role="status"></p></div></div></div>`;

    const kf = () => keyframesFromStops(stops);
    const cur = () => stops[sel] || stops[0];
    const changed = () => { drawStops(); drawProps(); renderPreview(); onChange(); };

    function drawStops() {
        // inline styles: the editor's own stylesheet resets a button's border, which would hide an unselected stop
        q("[data-stops]").innerHTML = stops.map((s, i) => `<button type="button" data-stop="${i}" aria-label="Stop at ${s.at}%" aria-pressed="${i === sel}" title="${s.at}%" class="absolute rotate-45" style="left:${s.at}%;top:10px;margin-left:-10px;width:20px;height:20px;border-radius:3px;cursor:pointer;border:2px solid ${i === sel ? "#171717" : "#a3a3a3"};background:${i === sel ? "#171717" : "#fff"}"></button>`).join("");
    }
    function row(f, s) {
        const on = s.set[f.key] !== undefined, v = on ? (typeof s.set[f.key] === "string" ? parseFloat(s.set[f.key]) : s.set[f.key]) : f.def, isStr = f.key.startsWith("translate");
        return `<div class="flex items-center gap-2 py-1"><label class="flex w-40 items-center gap-2"><input type="checkbox" data-on="${f.key}" ${on ? "checked" : ""} class="accent-black"><span class="${on ? "text-neutral-900" : "text-neutral-500"}">${f.label}</span></label>
            <input type="range" data-range="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" ${on ? "" : "disabled"} class="min-w-0 flex-1 accent-black" aria-label="${f.label}">
            <input type="number" data-num="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" ${on ? "" : "disabled"} class="w-20 ${field}"><span class="w-7 text-neutral-400">${isStr ? (typeof s.set[f.key] === "string" && /%$/.test(s.set[f.key]) ? "%" : "px") : f.unit}</span></div>`;
    }
    function drawProps() {
        const s = cur(), groups = [...new Set(STRUCTURED.map((f) => f.group))];
        q("[data-props]").innerHTML = `<div class="mb-2 flex items-center gap-2"><span class="font-semibold text-neutral-900">Stop at</span><input type="number" data-at min="0" max="100" step="1" value="${s.at}" class="w-16 ${field}" ${s.at === 0 || s.at === 100 ? "disabled" : ""} aria-label="Position of this stop in percent"><span class="text-neutral-500">%</span>
            ${s.at === 0 || s.at === 100 ? `<span class="text-neutral-400">The first and last stop stay at the ends.</span>` : `<button type="button" data-del class="ml-auto h-7 rounded-md border border-neutral-200 bg-white px-3 text-red-700 hover:bg-red-50">Remove this stop</button>`}</div>
            ${groups.map((g) => `<p class="mt-2 text-[10px] uppercase tracking-wide text-neutral-400">${g}</p>${STRUCTURED.filter((f) => f.group === g).map((f) => row(f, s)).join("")}`).join("")}
            <p class="mt-3 text-[10px] uppercase tracking-wide text-neutral-400">Anything else in CSS</p>
            ${Object.entries(s.raw || {}).map(([p, v]) => `<div class="flex items-center gap-2 py-1"><input data-rawp="${esc(p)}" value="${esc(p)}" class="w-40 ${field} font-mono" aria-label="CSS property"><input data-rawv="${esc(p)}" value="${esc(v)}" class="min-w-0 flex-1 ${field} font-mono" aria-label="Value"><button type="button" data-rawdel="${esc(p)}" class="text-neutral-500 hover:text-red-700" aria-label="Remove">✕</button></div>`).join("")}
            <div class="flex items-center gap-2 py-1"><input data-newp list="kfRaw" placeholder="box-shadow" class="w-40 ${field} font-mono" aria-label="New CSS property"><datalist id="kfRaw">${COMMON_RAW.map((p) => `<option value="${p}">`).join("")}</datalist><input data-newv placeholder="0 0 24px rgba(99,102,241,.5)" class="min-w-0 flex-1 ${field} font-mono" aria-label="New value"><button type="button" data-rawadd class="h-7 rounded-md border border-neutral-200 bg-white px-3 hover:bg-neutral-100">Add</button></div>
            <div class="mt-3 flex items-center gap-2 border-t border-neutral-200 pt-3"><span class="text-neutral-500">Easing from here to the next stop</span><select data-ease class="${field}">${[["", "As the animation"], ["ease-in", "Ease in"], ["ease-out", "Ease out"], ["ease-in-out", "Ease in and out"], ["linear", "Linear"]].map(([v, l]) => `<option value="${v}" ${s.ease === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
    }
    function renderPreview() {
        const box = q("[data-box]"), [, , round] = SHAPES.find((x) => x[0] === shape);
        box.className = `pv-box bg-neutral-900 ${round} ${shape === "bar" ? "h-4 w-28" : "h-12 w-12"}`;
        let st = document.getElementById("kfLive"); if (!st) { st = document.createElement("style"); st.id = "kfLive"; document.head.appendChild(st); }
        st.textContent = keyframesCss("pv-live", kf());
        const t = getTiming() || {};
        box.style.animation = "none"; void box.offsetWidth;
        if (scrub !== null) { const dur = Number(t.dur) || 1; box.style.animation = `pv-live ${dur}s linear 0s 1 normal both paused`; box.style.animationDelay = `${-(scrub / 100) * dur}s`; }
        else box.style.animation = animationValue("pv-live", { dur: 1, delay: 0, ease: "ease-out", repeat: "once", dir: "normal", fill: "both" }, { ...t, repeat: t.repeat === "infinite" ? "infinite" : "once" });
        const bad = checkStops(stops); q("[data-problem]").textContent = bad;
    }

    el.addEventListener("click", (e) => {
        const st = e.target.closest("[data-stop]");
        if (st) { sel = Number(st.dataset.stop); scrub = null; q("[data-scrub]").value = 0; drawStops(); drawProps(); renderPreview(); return; }
        if (e.target.closest("[data-replay]")) { scrub = null; q("[data-scrub]").value = 0; renderPreview(); return; }
        if (e.target.closest("[data-del]")) { if (cur().at !== 0 && cur().at !== 100) { stops.splice(sel, 1); sel = Math.max(0, sel - 1); changed(); } return; }
        const rd = e.target.closest("[data-rawdel]"); if (rd) { delete cur().raw[rd.dataset.rawdel]; changed(); return; }
        if (e.target.closest("[data-rawadd]")) { const p = q("[data-newp]").value.trim().toLowerCase(), v = q("[data-newv]").value.trim(); if (/^[a-z][a-z-]{0,40}$/.test(p) && /^[^;{}<>\\]{1,200}$/.test(v) && !["opacity", "animation-timing-function"].includes(p)) { cur().raw[p] = v; changed(); } return; }
        const track = e.target.closest("[data-track]");
        if (track && !e.target.closest("[data-stop]")) { // a click on the bar adds a stop there, with what the animation has at that point left unset
            const r = track.getBoundingClientRect(), at = Math.round(Math.min(99, Math.max(1, ((e.clientX - r.left) / r.width) * 100)));
            if (!stops.some((s) => s.at === at)) { stops.push({ at, set: {}, raw: {}, ease: "" }); stops.sort((a, b) => a.at - b.at); sel = stops.findIndex((s) => s.at === at); changed(); }
        }
    });
    // dragging a stop along the bar
    let drag = null;
    el.addEventListener("pointerdown", (e) => { const st = e.target.closest("[data-stop]"); if (!st) return; const i = Number(st.dataset.stop); if (stops[i].at === 0 || stops[i].at === 100) return; drag = { i, track: q("[data-track]").getBoundingClientRect() }; st.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const at = Math.round(Math.min(99, Math.max(1, ((e.clientX - drag.track.left) / drag.track.width) * 100)));
        if (stops[drag.i].at !== at && !stops.some((s, j) => j !== drag.i && s.at === at)) { const s = stops[drag.i]; s.at = at; stops.sort((a, b) => a.at - b.at); drag.i = stops.indexOf(s); sel = drag.i; drawStops(); drawProps(); renderPreview(); onChange(); }
    });
    el.addEventListener("pointerup", () => { drag = null; });
    el.addEventListener("change", (e) => {
        const t = e.target;
        if (t.dataset.from !== undefined) { const p = PRESETS.find((x) => x.id === t.value); stops = p ? stopsFromKeyframes(p.kf) : blankStops(); sel = 0; changed(); return; }
        if (t.dataset.shape !== undefined) { shape = t.value; renderPreview(); return; }
        if (t.dataset.ease !== undefined) { cur().ease = t.value; changed(); return; }
        if (t.dataset.on) { const f = STRUCTURED.find((x) => x.key === t.dataset.on); if (t.checked) cur().set[f.key] = f.key.startsWith("translate") ? `${f.def}px` : f.def; else delete cur().set[f.key]; changed(); return; }
        if (t.dataset.rawv !== undefined) { cur().raw[t.dataset.rawv] = t.value; changed(); return; }
        if (t.dataset.rawp !== undefined) { const old = t.dataset.rawp, np = t.value.trim().toLowerCase(); if (/^[a-z][a-z-]{0,40}$/.test(np) && np !== old) { cur().raw[np] = cur().raw[old]; delete cur().raw[old]; changed(); } return; }
        if (t.dataset.at !== undefined) { const at = Math.round(Math.min(99, Math.max(1, Number(t.value)))); if (!stops.some((s, j) => j !== sel && s.at === at)) { const s = cur(); s.at = at; stops.sort((a, b) => a.at - b.at); sel = stops.indexOf(s); } changed(); }
    });
    el.addEventListener("input", (e) => {
        const t = e.target;
        if (t.dataset.range !== undefined || t.dataset.num !== undefined) {
            const key = t.dataset.range ?? t.dataset.num, f = STRUCTURED.find((x) => x.key === key), v = Number(t.value);
            if (!Number.isFinite(v)) return;
            const old = cur().set[key], pct = typeof old === "string" && /%$/.test(old);
            cur().set[key] = key.startsWith("translate") ? `${v}${pct ? "%" : "px"}` : Math.min(f.max, Math.max(f.min, v));
            const other = q(t.dataset.range !== undefined ? `[data-num="${key}"]` : `[data-range="${key}"]`); if (other) other.value = t.value;
            renderPreview(); onChange(); return;
        }
        if (t.dataset.scrub !== undefined) { scrub = Number(t.value); renderPreview(); }
    });
    changed();
    return {
        setKeyframes(next) { stops = stopsFromKeyframes(next); if (stops.length < 2) stops = blankStops(); sel = 0; changed(); },
        getKeyframes: kf, problem: () => checkStops(stops), replay() { scrub = null; renderPreview(); },
    };
}
