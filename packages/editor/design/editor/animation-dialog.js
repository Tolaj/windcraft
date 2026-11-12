import { addAnimation } from "../../../core/config-edit.js";
import { TEMPLATES, PAGE_TEMPLATES, cleanEngine } from "../../../core/config-file.js";
import { PRESETS, GROUPS, EASINGS, EASING_LABEL, REPEATS, DIRECTIONS, FILLS, animationValue, keyframesCss, isEasing } from "../../../core/animation-presets.js";
import { TRIGGERS } from "../../../core/animation-triggers.js";
import { $, data, send } from "./base.js";
import { applyProject, applyPage } from "./config-dialog.js";
import { panelStore } from "../panel-state.js";
import { mountKeyframeEditor } from "../keyframe-editor.js";

// The animation library: a browser of presets (entrances, attention, exits, loops, hover effects) with live previews, a search, and every timing setting. Picking one and pressing
// "Add and use" writes its keyframes into the project's Tailwind config (or this page's), where every Tailwind project keeps them, and puts the class on the selected element.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ON_LABEL = { load: "On load", loop: "Loop", hover: "On hover" };
const field = "mt-1 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5";

let dlg = null, preset = PRESETS[0], group = "all", query = "", onApply = null, timers = [], mode = "library", editor = null;

function build() {
    dlg = document.createElement("dialog");
    dlg.id = "animDlg";
    dlg.setAttribute("aria-labelledby", "animTitle");
    dlg.className = "m-auto h-[min(90vh,820px)] w-[min(980px,96vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
    dlg.innerHTML = `<style>${PRESETS.map((p) => keyframesCss(`pv-${p.id}`, p.kf)).join("")}.pv-card:hover .pv-hover{animation:var(--pv) !important}@media (prefers-reduced-motion: reduce){#animDlg .pv-box{animation:none !important}}</style>
        <div class="flex h-full min-h-0 flex-col">
        <div class="flex items-center gap-3 border-b border-neutral-200 px-5 py-3"><div><h3 id="animTitle" class="text-sm font-semibold text-neutral-900">Animations</h3><p class="mt-0.5 text-[11px] text-neutral-500">Pick one or make your own. It is added to your Tailwind config like any animation in a Tailwind project.</p></div>
            <div class="ml-4 inline-flex overflow-hidden rounded-md border border-neutral-300 text-xs" id="animModes"></div>
            <input id="animSearch" type="search" placeholder="Search animations" aria-label="Search animations" class="ml-auto w-48 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs"><button type="button" data-x class="h-7 w-7 rounded text-neutral-500 hover:bg-neutral-100" aria-label="Close">✕</button></div>
        <div id="animTabs" class="flex gap-1 border-b border-neutral-200 px-4 py-2 text-xs" role="tablist" aria-label="Groups"></div>
        <div id="animEditor" class="hidden min-h-0 flex-1"></div>
        <div id="animGrid" class="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-auto p-4 sm:grid-cols-3 md:grid-cols-4" role="listbox" aria-label="Animations"></div>
        <div class="border-t border-neutral-200 bg-neutral-50 p-4 text-xs">
            <div class="flex gap-4"><div id="animBigWrap" class="hidden w-36 shrink-0 flex-col items-center sm:flex"><div class="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white"><div id="animBig" class="pv-box h-10 w-10 rounded-lg bg-neutral-900"></div></div><button type="button" id="animReplay" class="mt-2 h-7 w-full rounded-md border border-neutral-200 bg-white hover:bg-neutral-100">Replay</button><button type="button" id="animCustomise" class="mt-1 h-7 w-full rounded-md border border-neutral-200 bg-white hover:bg-neutral-100" title="Open its keyframes in the editor">Customise…</button><p id="animNote" class="mt-2 text-[11px] text-neutral-500"></p></div>
                <div class="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4">
                    <label class="block"><span class="text-neutral-500">Name (class: <span id="animCls" class="font-mono"></span>)</span><input id="animName" class="${field} font-mono" spellcheck="false"></label>
                    <label class="block"><span class="text-neutral-500">Time (seconds)</span><input id="animDur" type="number" min="0.1" max="60" step="0.1" class="${field}"></label>
                    <label class="block"><span class="text-neutral-500">Delay (seconds)</span><input id="animDelay" type="number" min="0" max="60" step="0.1" class="${field}"></label>
                    <label class="block"><span class="text-neutral-500">Repeat</span><select id="animRepeat" class="${field}">${REPEATS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
                    <label class="block"><span class="text-neutral-500">Easing</span><select id="animEase" class="${field}">${EASINGS.map((e) => `<option value="${esc(e)}">${EASING_LABEL[e]}</option>`).join("")}<option value="custom">Custom…</option></select></label>
                    <label class="block"><span class="text-neutral-500">Custom easing</span><input id="animEaseCustom" class="${field} font-mono" placeholder="cubic-bezier(0.2, 0.8, 0.2, 1)" spellcheck="false" disabled></label>
                    <label class="block"><span class="text-neutral-500">Direction</span><select id="animDir" class="${field}">${DIRECTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
                    <label class="block"><span class="text-neutral-500">When it ends</span><select id="animFill" class="${field}">${FILLS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
                    <label id="animOnWrap" class="block"><span class="text-neutral-500">It plays</span><select id="animOn" class="${field}">${TRIGGERS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label></div></div>
            <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2"><fieldset class="flex items-center gap-3"><legend class="sr-only">Add it to</legend><span class="text-neutral-500">Add to</span><label class="flex items-center gap-1.5"><input type="radio" name="animScope" value="project" checked class="accent-black"> whole project's config</label><label class="flex items-center gap-1.5"><input type="radio" name="animScope" value="page" class="accent-black"> this page's config</label></fieldset>
                <label class="flex items-center gap-1.5"><input id="animReduced" type="checkbox" checked class="accent-black"> Respect reduced motion</label>
                <p id="animErr" class="min-h-[1rem] flex-1 text-red-700" role="alert"></p><button type="button" data-x class="h-8 rounded-md border border-neutral-200 bg-white px-3 hover:bg-neutral-100">Cancel</button><button type="button" id="animCreate" class="h-8 rounded-md bg-black px-4 font-semibold text-white hover:bg-neutral-800">Add and use</button></div></div></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("keydown", (e) => e.stopPropagation()); // typing here is not an editor shortcut
    dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-x]")) return dlg.close();
        const g = e.target.closest("[data-group]"); if (g) { group = g.dataset.group; drawGrid(); return; }
        const card = e.target.closest("[data-preset]"); if (card) { choose(PRESETS.find((p) => p.id === card.dataset.preset)); return; }
        const md = e.target.closest("[data-mode]"); if (md) { setMode(md.dataset.mode); return; }
        if (e.target.id === "animCustomise") { toEditor(preset); return; }
        if (e.target.id === "animReplay") return playBig();
        if (e.target.id === "animCreate") create();
    });
    dlg.addEventListener("input", (e) => {
        if (e.target.id === "animSearch") { query = e.target.value.trim().toLowerCase(); drawGrid(); return; }
        if (e.target.id === "animName") $("animCls").textContent = `animate-${e.target.value || "…"}`;
        if (e.target.closest("#animDlg") && /^anim(Dur|Delay|Repeat|Ease|EaseCustom|Dir|Fill)$/.test(e.target.id)) { if (e.target.id === "animEase") $("animEaseCustom").disabled = e.target.value !== "custom"; if (mode === "editor" && editor) editor.replay(); else playBig(); }
    });
    dlg.addEventListener("close", () => { timers.forEach(clearInterval); timers = []; });
}

const tabHtml = ([id, label]) => `<button type="button" role="tab" aria-selected="${group === id}" data-group="${id}" class="rounded-full px-3 py-1 ${group === id ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100"}">${label}</button>`;
function drawGrid() {
    $("animTabs").innerHTML = [["all", "All"], ...GROUPS].map(tabHtml).join("");
    const list = PRESETS.filter((p) => (group === "all" || p.group === group) && (!query || `${p.label} ${p.id} ${p.group}`.toLowerCase().includes(query)));
    timers.forEach(clearInterval); timers = [];
    $("animGrid").innerHTML = list.length ? list.map((p) => `<button type="button" role="option" aria-selected="${p.id === preset.id}" data-preset="${p.id}" class="pv-card flex flex-col rounded-lg border p-2.5 text-left ${p.id === preset.id ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200 hover:bg-neutral-50"}">
        <div class="flex h-16 items-center justify-center overflow-hidden rounded-md bg-neutral-50"><div class="pv-box ${p.on === "hover" ? "pv-hover" : ""} h-7 w-7 rounded-md bg-neutral-900" data-box="${p.id}" style="--pv:pv-${p.id} ${Math.min(p.dur, 2)}s ${esc(p.ease)} infinite alternate;${p.on === "hover" ? "" : `animation:pv-${p.id} ${Math.min(p.dur, 2.4)}s ${esc(p.ease)} ${p.on === "loop" ? "infinite" : "1 both"}`}"></div></div>
        <div class="mt-2 text-xs font-medium text-neutral-900">${esc(p.label)}</div><div class="text-[10px] text-neutral-500">${ON_LABEL[p.on]}${p.repeat === "infinite" && p.on !== "loop" ? " · repeats" : ""}</div></button>`).join("") : `<p class="col-span-full p-6 text-center text-neutral-500">Nothing matches "${esc(query)}".</p>`;
    // an entrance, attention or exit plays once: it replays every few seconds so a card never sits at rest
    list.filter((p) => p.on === "load").forEach((p) => {
        const box = $("animGrid").querySelector(`[data-box="${p.id}"]`);
        timers.push(setInterval(() => { if (!box.isConnected) return; box.style.animation = "none"; void box.offsetWidth; box.style.animation = `pv-${p.id} ${Math.min(p.dur, 2.4)}s ${p.ease} 1 both`; }, Math.max(2600, p.dur * 1000 + 1400)));
    });
}

const easeValue = () => ($("animEase").value === "custom" ? $("animEaseCustom").value.trim() : $("animEase").value);
const settings = () => ({ dur: $("animDur").value, delay: $("animDelay").value, ease: easeValue(), repeat: $("animRepeat").value, dir: $("animDir").value, fill: $("animFill").value });
function playBig() {
    const big = $("animBig"), s = settings();
    big.style.animation = "none"; void big.offsetWidth;
    const hover = preset.on === "hover";
    big.style.animation = animationValue(`pv-${preset.id}`, preset, { ...s, repeat: hover ? "once" : s.repeat }); // a hover effect plays once here: that is what the pointer does
}

function setMode(next) {
    mode = next;
    $("animModes").innerHTML = [["library", "Library"], ["editor", "Create your own"]].map(([k, t]) => `<button type="button" data-mode="${k}" aria-pressed="${mode === k}" class="px-3 py-1.5 ${mode === k ? "bg-black font-medium text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}">${t}</button>`).join("");
    const ed = mode === "editor";
    $("animEditor").classList.toggle("hidden", !ed); $("animGrid").classList.toggle("hidden", ed); $("animTabs").classList.toggle("hidden", ed); $("animSearch").classList.toggle("hidden", ed);
    $("animBigWrap").classList.toggle("hidden", ed); $("animBigWrap").classList.toggle("sm:flex", !ed);
    if (ed && !editor) editor = mountKeyframeEditor($("animEditor"), { getTiming: () => settings(), onChange: () => { $("animErr").textContent = ""; } });
    if (ed) { if ($("animName").value === preset.id) { $("animName").value = "my-animation"; $("animCls").textContent = "animate-my-animation"; } editor.replay(); }
    else choose(preset);
}
/** Opens a preset's keyframes in the editor, to change them; the name gets a suffix so the original stays available. */
function toEditor(p) {
    setMode("editor");
    editor.setKeyframes(p.kf);
    $("animName").value = `${p.id}-custom`.slice(0, 31); $("animCls").textContent = `animate-${$("animName").value}`;
    $("animOn").value = p.on === "hover" ? "hover" : "load";
    editor.replay();
}
const customPreset = (name) => ({ id: name, kf: editor.getKeyframes(), on: $("animOn").value, dur: 0.8, ease: "ease-out", repeat: "once", dir: "normal", fill: "both", delay: 0 });

function choose(p) {
    preset = p;
    $("animName").value = p.id; $("animCls").textContent = `animate-${p.id}`; $("animOn").value = p.on === "hover" ? "hover" : "load";
    $("animDur").value = p.dur; $("animDelay").value = p.delay || 0; $("animRepeat").value = p.repeat; $("animDir").value = p.dir; $("animFill").value = p.fill;
    const known = EASINGS.includes(p.ease); $("animEase").value = known ? p.ease : "custom"; $("animEaseCustom").disabled = known; $("animEaseCustom").value = known ? "" : p.ease;
    $("animNote").textContent = p.note || ""; $("animErr").textContent = "";
    dlg.querySelectorAll("[data-preset]").forEach((b) => { const on = b.dataset.preset === p.id; b.setAttribute("aria-selected", String(on)); b.classList.toggle("border-neutral-900", on); b.classList.toggle("ring-1", on); b.classList.toggle("ring-neutral-900", on); b.classList.toggle("border-neutral-200", !on); });
    playBig();
}

async function create() {
    const name = $("animName").value.trim().toLowerCase(), scope = dlg.querySelector('[name="animScope"]:checked').value, s = settings();
    const err = (m) => { $("animErr").textContent = m; };
    const chosen = mode === "editor" ? customPreset(name) : preset;
    if (mode === "editor" && editor.problem()) return err(editor.problem());
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) return err("Use lowercase letters, numbers and dashes, starting with a letter.");
    if (!(Number(s.dur) >= 0.1 && Number(s.dur) <= 60)) return err("Time must be between 0.1 and 60 seconds.");
    if (!(Number(s.delay || 0) >= 0 && Number(s.delay || 0) <= 60)) return err("Delay must be between 0 and 60 seconds.");
    if (!isEasing(s.ease)) return err("That easing isn't one the browser knows: try ease-out, linear, steps(4) or cubic-bezier(0.2, 0.8, 0.2, 1).");
    if (!data.projectTheme || !data.project) return err("This design is not in a project, so there is no config to add it to.");
    if (scope === "page" && !data.id) return err("Save the page first, or add it to the project's config.");
    const engine = cleanEngine(data.projectTheme.engine), animation = animationValue(name, chosen, s);
    const tw = data.twConfig || {};
    const base = scope === "page" ? (engine === "4" ? tw.css : tw.js) || PAGE_TEMPLATES[engine].text : (engine === "4" ? data.projectTheme.configCss : data.projectTheme.configJs) || TEMPLATES[engine].text;
    const r = addAnimation(base, engine, { name, keyframes: chosen.kf, animation });
    if (r.status === "exists") return err(`There is already an animation called "${name}" in that config. Pick another name.`);
    if (r.status === "nowhere") return err("Couldn't find where to put it: the config file needs module.exports = { ... }. Add it by hand in the Config dialog.");
    if (r.status !== "added") return err("That name can't be used.");
    $("animCreate").disabled = true;
    const saved = scope === "page"
        ? await applyPage({ js: engine === "4" ? tw.js || "" : r.text, css: engine === "4" ? r.text : tw.css || "", lock: tw.lock || {} }, { reload: false })
        : await applyProject({ engine, configJs: engine === "4" ? data.projectTheme.configJs || "" : r.text, configCss: engine === "4" ? r.text : data.projectTheme.configCss || "", lock: data.projectTheme.lock || {} }, { reload: false });
    $("animCreate").disabled = false;
    if (!saved.ok) return err(`Not saved: ${saved.message || "something went wrong"}`);
    dlg.close();
    // it shows at once (no reload of the design): the canvas gets the keyframes and the class, the panel lists the name, and the class goes on the element
    const trigger = $("animOn").value;
    const sel = { hover: `.hover\\:animate-${name}:hover`, focus: `.focus\\:animate-${name}:focus`, click: `.data-\\[play\\=on\\]\\:animate-${name}[data-play="on"]` }[trigger] || `.animate-${name}`;
    send({ cmd: "injectAnim", css: `${keyframesCss(name, chosen.kf)}${sel}{animation:${animation}}` });
    panelStore.set({ animations: [...new Set([...(panelStore.get().animations || []), name])] });
    if (onApply) onApply({ name, trigger, reducedMotion: $("animReduced").checked });
}

/** Opens the library. `apply({ name, trigger, reducedMotion })` runs after the animation is saved, to put it on the selected element. */
export function newAnimation(apply) {
    onApply = apply || null;
    if (!dlg) build();
    group = "all"; query = ""; $("animSearch").value = "";
    choose(PRESETS[0]);
    drawGrid();
    setMode("library");
    dlg.showModal();
}
