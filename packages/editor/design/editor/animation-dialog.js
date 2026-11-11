import { addAnimation } from "../../../core/config-edit.js";
import { TEMPLATES, PAGE_TEMPLATES, cleanEngine } from "../../../core/config-file.js";
import { $, data, send } from "./base.js";
import { applyProject, applyPage } from "./config-dialog.js";
import { panelStore } from "../panel-state.js";

// "New animation": pick a preset, set its time, easing and repeat, and the keyframes go into the project's Tailwind config (or this page's), where every Tailwind
// project keeps them; the animate-* class is then put on the selected element. Nothing here is special to the editor: the file is the same one the Config dialog edits.

export const PRESETS = [
    { id: "fade-in", label: "Fade in", dur: 0.6, ease: "ease-out", repeat: "once", kf: { "0%": { opacity: "0" }, "100%": { opacity: "1" } } },
    { id: "slide-up", label: "Slide up", dur: 0.6, ease: "ease-out", repeat: "once", kf: { "0%": { opacity: "0", transform: "translateY(24px)" }, "100%": { opacity: "1", transform: "translateY(0)" } } },
    { id: "slide-down", label: "Slide down", dur: 0.6, ease: "ease-out", repeat: "once", kf: { "0%": { opacity: "0", transform: "translateY(-24px)" }, "100%": { opacity: "1", transform: "translateY(0)" } } },
    { id: "zoom-in", label: "Zoom in", dur: 0.4, ease: "ease-out", repeat: "once", kf: { "0%": { opacity: "0", transform: "scale(0.9)" }, "100%": { opacity: "1", transform: "scale(1)" } } },
    { id: "wiggle", label: "Wiggle", dur: 1, ease: "ease-in-out", repeat: "infinite", kf: { "0%, 100%": { transform: "rotate(-3deg)" }, "50%": { transform: "rotate(3deg)" } } },
    { id: "float", label: "Float", dur: 3, ease: "ease-in-out", repeat: "infinite", kf: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } } },
];
const EASES = ["ease-out", "ease-in", "ease-in-out", "linear"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cssOf = (kf) => Object.entries(kf).map(([at, props]) => `${at}{${Object.entries(props).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`).join(";")}}`).join("");

let dlg = null, preset = PRESETS[0];

function build() {
    dlg = document.createElement("dialog");
    dlg.id = "animDlg";
    dlg.setAttribute("aria-labelledby", "animTitle");
    dlg.className = "m-auto w-[min(640px,94vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
    dlg.innerHTML = `<style>${PRESETS.map((p) => `@keyframes pv-${p.id}{${cssOf(p.kf)}}`).join("")}</style>
        <div class="flex items-center border-b border-neutral-200 px-5 py-3"><div><h3 id="animTitle" class="text-sm font-semibold text-neutral-900">New animation</h3><p class="mt-0.5 text-[11px] text-neutral-500">It is added to your Tailwind config, like any animation in a Tailwind project.</p></div><button type="button" data-x class="ml-auto h-7 w-7 rounded text-neutral-500 hover:bg-neutral-100" aria-label="Close">✕</button></div>
        <div class="p-5 text-xs"><p class="mb-2 font-semibold text-neutral-700">Start from</p><div id="animPresets" class="grid grid-cols-3 gap-2"></div>
            <div class="mt-4 grid grid-cols-2 gap-3">
                <label class="block"><span class="text-neutral-500">Name (the class is animate-<b id="animCls">fade-in</b>)</span><input id="animName" class="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 font-mono" spellcheck="false"></label>
                <label class="block"><span class="text-neutral-500">Time (seconds)</span><input id="animDur" type="number" min="0.1" max="30" step="0.1" class="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5"></label>
                <label class="block"><span class="text-neutral-500">Easing</span><select id="animEase" class="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5">${EASES.map((e) => `<option>${e}</option>`).join("")}</select></label>
                <label class="block"><span class="text-neutral-500">Repeat</span><select id="animRepeat" class="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5"><option value="once">Once</option><option value="infinite">Forever</option></select></label></div>
            <fieldset class="mt-4"><legend class="text-neutral-500">Add it to</legend><div class="mt-1 flex gap-4"><label class="flex items-center gap-1.5"><input type="radio" name="animScope" value="project" checked class="accent-black"> The whole project's config</label><label class="flex items-center gap-1.5"><input type="radio" name="animScope" value="page" class="accent-black"> This page's config</label></div></fieldset>
            <p id="animErr" class="mt-3 min-h-[1rem] text-red-700" role="alert"></p></div>
        <div class="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3"><button type="button" data-x class="h-8 rounded-md border border-neutral-200 px-3 hover:bg-neutral-50">Cancel</button><button type="button" id="animCreate" class="h-8 rounded-md bg-black px-4 font-semibold text-white hover:bg-neutral-800">Add and use</button></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("keydown", (e) => e.stopPropagation()); // typing here is not an editor shortcut
    dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-x]")) return dlg.close();
        const card = e.target.closest("[data-preset]");
        if (card) { choose(PRESETS.find((p) => p.id === card.dataset.preset)); return; }
        if (e.target.id === "animCreate") create();
    });
    dlg.addEventListener("input", (e) => { if (e.target.id === "animName") $("animCls").textContent = e.target.value || "…"; });
    $("animPresets").innerHTML = PRESETS.map((p) => `<button type="button" data-preset="${p.id}" class="rounded-lg border border-neutral-200 p-3 text-left hover:bg-neutral-50"><div class="flex h-12 items-center justify-center overflow-hidden"><div class="h-7 w-7 rounded-md bg-neutral-900" style="animation:pv-${p.id} ${Math.min(p.dur, 2)}s ${p.ease} infinite alternate"></div></div><div class="mt-2 font-medium text-neutral-900">${esc(p.label)}</div></button>`).join("");
}

function choose(p) {
    preset = p;
    $("animName").value = p.id; $("animCls").textContent = p.id;
    $("animDur").value = p.dur; $("animEase").value = p.ease; $("animRepeat").value = p.repeat;
    dlg.querySelectorAll("[data-preset]").forEach((b) => { const on = b.dataset.preset === p.id; b.classList.toggle("border-neutral-900", on); b.classList.toggle("ring-1", on); b.classList.toggle("ring-neutral-900", on); });
    $("animErr").textContent = "";
}

async function create() {
    const name = $("animName").value.trim().toLowerCase(), dur = Number($("animDur").value), scope = dlg.querySelector('[name="animScope"]:checked').value;
    const err = (m) => { $("animErr").textContent = m; };
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(name)) return err("Use lowercase letters, numbers and dashes, starting with a letter.");
    if (!(dur >= 0.1 && dur <= 30)) return err("Time must be between 0.1 and 30 seconds.");
    if (!data.projectTheme || !data.project) return err("This design is not in a project, so there is no config to add it to.");
    if (scope === "page" && !data.id) return err("Save the page first, or add it to the project's config.");
    const engine = cleanEngine(data.projectTheme.engine), repeat = $("animRepeat").value, ease = $("animEase").value;
    const animation = `${name} ${dur}s ${ease} ${repeat === "infinite" ? "infinite" : "both"}`;
    const tw = data.twConfig || {};
    const base = scope === "page" ? (engine === "4" ? tw.css : tw.js) || PAGE_TEMPLATES[engine].text : (engine === "4" ? data.projectTheme.configCss : data.projectTheme.configJs) || TEMPLATES[engine].text;
    const r = addAnimation(base, engine, { name, keyframes: preset.kf, animation });
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
    send({ cmd: "injectAnim", css: `@keyframes ${name}{${cssOf(preset.kf)}}.animate-${name}{animation:${animation}}` });
    panelStore.set({ animations: [...new Set([...(panelStore.get().animations || []), name])] });
    if (onApply) onApply(name);
}

let onApply = null;

/** Opens the dialog. `apply(name)` is called after the animation is saved, to put it on the selected element. */
export function newAnimation(apply) {
    onApply = apply || null;
    if (!dlg) build();
    choose(PRESETS[0]);
    dlg.showModal();
}
