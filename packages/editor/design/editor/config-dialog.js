import { host } from "../host.js";
import { mountConfigFileEditor } from "../config-file-editor.js";
import { pageTheme } from "../../../core/theme.js";
import { setPreviewTheme } from "../../playground/component-source.js";
import { $, S, data } from "./base.js";
import { docs } from "./designs.js";
import { loadFrame } from "./docs.js";
import { renderInspector } from "./inspector.js";

// Tailwind config, edited here without leaving the editor: one wide dialog over the canvas holding the same workspace the project page uses (config-file-editor.js):
// a file tab for this page, one for the whole project, and the result beside the file.

let dlg = null, editor = null;

function build() {
    dlg = document.createElement("dialog");
    dlg.id = "configDlg";
    dlg.setAttribute("aria-labelledby", "cfgTitle");
    dlg.className = "m-auto h-[min(88vh,820px)] w-[min(1200px,96vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
    dlg.innerHTML = `<div class="flex h-full min-h-0 flex-col"><div class="flex items-center border-b border-neutral-200 px-5 py-3"><div><h3 id="cfgTitle" class="text-sm font-semibold text-neutral-900">Tailwind config</h3><p class="mt-0.5 text-[11px] text-neutral-500">A file, as in any Tailwind project. This page's file is laid over the project's.</p></div><button type="button" data-x class="ml-auto h-7 w-7 rounded text-neutral-500 hover:bg-neutral-100" aria-label="Close">✕</button></div><div id="cfgBody" class="min-h-0 flex-1"></div></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-x]")) dlg.close(); }); // the backdrop is the dialog itself
    dlg.addEventListener("keydown", (e) => e.stopPropagation()); // typing here is not an editor shortcut
}

async function applyProject(patch) {
    const projectId = data.project && data.project.id;
    try {
        const saved = await host.saveProjectTheme(projectId, { ...(data.projectTheme || {}), ...patch });
        data.projectTheme = saved;
        setPreviewTheme(pageTheme(saved, data.twConfig));
        loadFrame(); // the canvas takes the new config
        renderInspector();
        return { ok: true };
    } catch (err) { return { ok: false, message: err.message || "Could not save" }; }
}

async function applyPage(patch) {
    if (!data.id) return { ok: false, message: "Save the page first." };
    const tw = patch.js || patch.css ? patch : null;
    try { await host.updateComponent(data.id, { twConfig: tw || {} }); } catch (err) { return { ok: false, message: err.message || "Could not save it" }; }
    data.twConfig = tw;
    const d = docs.get(S.curKey); if (d) d.meta.twConfig = tw;
    setPreviewTheme(pageTheme(data.projectTheme, tw));
    loadFrame();
    renderInspector();
    return { ok: true };
}

/** Opens the dialog on the "page" or "project" file. */
export function openConfig(which) {
    if (!dlg) build();
    const next = { theme: data.projectTheme || {}, tw: data.twConfig, scopes: ["page", "project"], scope: which };
    if (editor) editor.set(next); else editor = mountConfigFileEditor($("cfgBody"), next, (scope, patch) => (scope === "page" ? applyPage(patch) : applyProject(patch)));
    dlg.showModal();
}
