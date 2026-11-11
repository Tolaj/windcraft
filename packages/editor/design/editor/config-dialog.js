import { host } from "../host.js";
import { mountConfigFileEditor } from "../config-file-editor.js";
import { pageTheme } from "../../../core/theme.js";
import { setPreviewTheme } from "../../playground/component-source.js";
import { $, data } from "./base.js";
import { loadFrame } from "./docs.js";
import { renderInspector } from "./inspector.js";

// The project's Tailwind config file, edited here without leaving the editor: a dialog over the canvas holding the same file editor the project page uses
// (config-file-editor.js). It belongs to the whole project, so Apply writes the project's theme (host.saveProjectTheme) and the open page's canvas reloads.

let dlg = null, editor = null;

function build() {
    dlg = document.createElement("dialog");
    dlg.id = "configDlg";
    dlg.className = "m-auto h-[min(82vh,760px)] w-[min(920px,95vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
    dlg.innerHTML = `<div class="flex h-full min-h-0 flex-col"><div class="flex items-center border-b border-neutral-200 px-5 py-3"><div><h3 class="text-sm font-semibold text-neutral-900">Project Tailwind config</h3><p class="mt-0.5 text-[11px] text-neutral-500">For every page in this project. Add plugins the usual way.</p></div><button type="button" data-x class="ml-auto h-7 w-7 rounded text-neutral-500 hover:bg-neutral-100" aria-label="Close">✕</button></div><div id="cfgBody" class="min-h-0 flex-1"></div></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-x]")) dlg.close(); }); // the backdrop is the dialog itself
    dlg.addEventListener("keydown", (e) => e.stopPropagation()); // typing here is not an editor shortcut
}

async function applyPatch(patch) {
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

/** Opens the dialog with the project's config file as it is now. */
export function openProjectConfig() {
    if (!dlg) build();
    const pt = data.projectTheme || {};
    if (editor) editor.set(pt); else editor = mountConfigFileEditor($("cfgBody"), pt, applyPatch);
    dlg.showModal();
}
