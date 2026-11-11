import { host } from "../host.js";
import { mountConfigFileEditor } from "../config-file-editor.js";
import { pageTheme } from "../../../core/theme.js";
import { setPreviewTheme } from "../../playground/component-source.js";
import { $, S, data } from "./base.js";
import { docs } from "./designs.js";
import { loadFrame } from "./docs.js";
import { renderInspector } from "./inspector.js";

// Tailwind config, edited here without leaving the editor: one wide dialog over the canvas with the same file editor the project page uses (config-file-editor.js),
// in two scopes: "This page" (its own file, laid over the project's) and "Whole project" (the project's file, for every page).

let dlg = null, scope = "page";
const editors = { page: null, project: null };

function build() {
    dlg = document.createElement("dialog");
    dlg.id = "configDlg";
    dlg.className = "m-auto h-[min(82vh,760px)] w-[min(920px,95vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
    dlg.innerHTML = `<div class="flex h-full min-h-0 flex-col"><div class="flex items-center gap-4 border-b border-neutral-200 px-5 py-3"><div><h3 class="text-sm font-semibold text-neutral-900">Tailwind config</h3><p id="cfgHint" class="mt-0.5 text-[11px] text-neutral-500"></p></div>
        <div class="ml-4 inline-flex overflow-hidden rounded-md border border-neutral-300 text-xs">${[["page", "This page"], ["project", "Whole project"]].map(([k, t]) => `<button type="button" data-scope="${k}" class="px-3 py-1.5">${t}</button>`).join("")}</div>
        <button type="button" data-x class="ml-auto h-7 w-7 rounded text-neutral-500 hover:bg-neutral-100" aria-label="Close">✕</button></div>
        <div id="cfgPage" class="min-h-0 flex-1"></div><div id="cfgProject" class="hidden min-h-0 flex-1"></div></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-x]")) return dlg.close(); // the backdrop is the dialog itself
        const b = e.target.closest("[data-scope]");
        if (b) show(b.dataset.scope);
    });
    dlg.addEventListener("keydown", (e) => e.stopPropagation()); // typing here is not an editor shortcut
}

function show(next) {
    scope = next;
    $("cfgPage").classList.toggle("hidden", scope !== "page");
    $("cfgProject").classList.toggle("hidden", scope !== "project");
    dlg.querySelectorAll("[data-scope]").forEach((b) => { const on = b.dataset.scope === scope; b.className = `px-3 py-1.5 ${on ? "bg-black font-medium text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`; });
    $("cfgHint").textContent = scope === "page" ? "Only this page uses it, on top of the project's config. Add plugins the usual way." : "Every page in this project uses it. Add plugins the usual way.";
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

/** Opens the dialog on "page" or "project", with both files as they are now. */
export function openConfig(which) {
    if (!dlg) build();
    const pt = data.projectTheme || {};
    if (editors.page) editors.page.set({ theme: pt, tw: data.twConfig }); else editors.page = mountConfigFileEditor($("cfgPage"), { scope: "page", theme: pt, tw: data.twConfig }, applyPage);
    if (editors.project) editors.project.set({ theme: pt }); else editors.project = mountConfigFileEditor($("cfgProject"), { scope: "project", theme: pt }, applyProject);
    show(which);
    dlg.showModal();
}
