import { host } from "../host.js";
import { mountPluginManager } from "../plugin-manager.js";
import { pageTheme } from "../../../core/theme.js";
import { setPreviewTheme } from "../../playground/component-source.js";
import { $, data } from "./base.js";
import { loadFrame } from "./docs.js";
import { renderInspector } from "./inspector.js";

// The project's Tailwind engine and plugins, managed here without leaving the editor: a dialog over the canvas holding the plugin manager (plugin-manager.js,
// the same component the project page uses). They belong to the whole project, so Save writes the project's theme (host.saveProjectTheme) and the open page's
// canvas reloads with them.

let dlg = null, manager = null, current = null;

function build() {
    dlg = document.createElement("dialog");
    dlg.id = "pluginsDlg";
    dlg.className = "m-auto w-[min(640px,94vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
    dlg.innerHTML = `<div class="flex items-center border-b border-neutral-200 px-5 py-3"><div><h3 class="text-sm font-semibold text-neutral-900">Engine and plugins</h3><p class="mt-0.5 text-[11px] text-neutral-500">For every page in this project.</p></div><button type="button" data-x class="ml-auto h-7 w-7 rounded text-neutral-500 hover:bg-neutral-100" aria-label="Close">✕</button></div>
        <div id="plugBody" class="max-h-[70vh] overflow-auto p-5"></div>
        <div class="flex items-center gap-2 border-t border-neutral-200 px-5 py-3"><span id="plugErr" class="mr-auto text-[11px] text-red-700"></span><button type="button" data-x class="h-8 rounded-md border border-neutral-200 px-3 text-xs hover:bg-neutral-50">Cancel</button><button type="button" id="plugSave" class="h-8 rounded-md bg-black px-4 text-xs font-semibold text-white hover:bg-neutral-800">Save</button></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-x]")) dlg.close(); }); // the backdrop is the dialog itself
    dlg.querySelector("#plugSave").addEventListener("click", save);
    dlg.addEventListener("keydown", (e) => e.stopPropagation()); // typing here is not an editor shortcut
}

async function save() {
    const projectId = data.project && data.project.id, st = manager.get();
    $("plugErr").textContent = "";
    $("plugSave").disabled = true;
    try {
        const saved = await host.saveProjectTheme(projectId, { ...(data.projectTheme || {}), engine: st.engine, plugins: st.plugins, recipes: st.recipes });
        data.projectTheme = saved;
        setPreviewTheme(pageTheme(saved, data.twConfig));
        dlg.close();
        loadFrame(); // the canvas takes the engine and the plugins
        renderInspector();
    } catch (err) { $("plugErr").textContent = err.message || "Could not save"; }
    $("plugSave").disabled = false;
}

/** Opens the dialog with the project's engine and plugins as they are now. */
export function openPlugins() {
    if (!dlg) build();
    const pt = data.projectTheme || {};
    current = { engine: pt.engine, plugins: pt.plugins, recipes: pt.recipes };
    if (manager) manager.set(current); else manager = mountPluginManager($("plugBody"), current);
    $("plugErr").textContent = "";
    dlg.showModal();
}
