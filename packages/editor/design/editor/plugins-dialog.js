import { host } from "../host.js";
import { PLUGINS, cleanPlugins, cleanCustom, customError, isStylesheet } from "../../../core/plugins.js";
import { pageTheme } from "../../../core/theme.js";
import { setPreviewTheme } from "../../playground/component-source.js";
import { $, S, data, esc } from "./base.js";
import { loadFrame } from "./docs.js";
import { renderInspector } from "./inspector.js";

// The project's Tailwind plugins, managed here without leaving the editor: a dialog over the canvas. They belong to the whole project (every page
// loads them), so Save writes the project's theme (host.saveProjectTheme) and the open page's canvas reloads with them.

let dlg = null;
let draft = null; // { plugins: [ids], custom: [urls] } while the dialog is open

function build() {
    dlg = document.createElement("dialog");
    dlg.id = "pluginsDlg";
    dlg.className = "m-auto w-[min(540px,94vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
    dlg.innerHTML = `<div class="flex items-center border-b border-neutral-200 px-5 py-3"><div><h3 class="text-sm font-semibold text-neutral-900">Plugins</h3><p class="mt-0.5 text-[11px] text-neutral-500">For every page in this project.</p></div><button type="button" data-x class="ml-auto h-7 w-7 rounded text-neutral-500 hover:bg-neutral-100" aria-label="Close">✕</button></div>
        <div id="plugBody" class="max-h-[62vh] overflow-auto p-5 text-xs"></div>
        <div class="flex items-center gap-2 border-t border-neutral-200 px-5 py-3"><span id="plugErr" class="mr-auto text-[11px] text-red-700"></span><button type="button" data-x class="h-8 rounded-md border border-neutral-200 px-3 text-xs hover:bg-neutral-50">Cancel</button><button type="button" id="plugSave" class="h-8 rounded-md bg-black px-4 text-xs font-semibold text-white hover:bg-neutral-800">Save</button></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-x]")) dlg.close(); }); // the backdrop is the dialog itself
    dlg.addEventListener("change", (e) => { const c = e.target.closest("[data-plug]"); if (!c) return; const set = new Set(draft.plugins); c.checked ? set.add(c.dataset.plug) : set.delete(c.dataset.plug); draft.plugins = cleanPlugins([...set]); });
    dlg.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-unplug]");
        if (rm) { draft.custom = draft.custom.filter((_, i) => i !== Number(rm.dataset.unplug)); draw(); return; }
        if (e.target.id === "plugAdd") {
            const url = $("plugUrl").value.trim(), bad = customError(url, draft.custom);
            if (bad) { $("plugMsg").textContent = bad; return; }
            draft.custom = cleanCustom([...draft.custom, url]); draw();
        }
        if (e.target.id === "plugSave") save();
    });
    dlg.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "plugUrl") { e.preventDefault(); $("plugAdd").click(); } });
}

function draw() {
    const on = new Set(draft.plugins);
    const row = (p) => `<label class="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-0 hover:bg-neutral-50"><span class="min-w-0 flex-1"><span class="block text-[13px] font-medium text-neutral-900">${esc(p.name)}</span><span class="block text-neutral-500">${esc(p.about)}</span></span><input type="checkbox" data-plug="${p.id}" ${on.has(p.id) ? "checked" : ""} class="h-4 w-4 shrink-0 accent-black"></label>`;
    const group = (name, list, first) => `<p class="mb-1.5 ${first ? "" : "mt-4"} font-semibold text-neutral-700">${name}</p><div class="overflow-hidden rounded-lg border border-neutral-200 bg-white">${list.map(row).join("")}</div>`;
    $("plugBody").innerHTML = group("Official", PLUGINS.filter((p) => !p.group), true) + group("Third party", PLUGINS.filter((p) => p.group)) +
        `<p class="mb-1.5 mt-4 font-semibold text-neutral-700">Your own links</p>
        ${draft.custom.length ? `<div class="mb-2 overflow-hidden rounded-lg border border-neutral-200 bg-white">${draft.custom.map((u, i) => `<div class="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 last:border-0"><span class="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">${isStylesheet(u) ? "css" : "js"}</span><span class="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-700" title="${esc(u)}">${esc(u)}</span><button type="button" data-unplug="${i}" class="text-neutral-500 hover:text-red-700">Remove</button></div>`).join("")}</div>` : ""}
        <div class="flex gap-2"><input id="plugUrl" class="field" style="height:32px;flex:1;font-family:ui-monospace,Menlo,monospace;font-size:11px" placeholder="https://cdn.jsdelivr.net/npm/…/plugin.min.js" spellcheck="false"><button type="button" id="plugAdd" class="h-8 rounded-md border border-neutral-200 px-3 hover:bg-neutral-50">Add</button></div>
        <p id="plugMsg" class="mt-1 min-h-[1rem] text-red-700"></p>
        <p class="text-neutral-500">A link to a script (.js) or a stylesheet (.css), https only. It runs in the previews and the canvas, so add only what you trust. A Tailwind plugin that needs a build step can't be loaded this way.</p>`;
}

async function save() {
    const projectId = data.project && data.project.id;
    $("plugErr").textContent = "";
    $("plugSave").disabled = true;
    try {
        const saved = await host.saveProjectTheme(projectId, { ...(data.projectTheme || {}), plugins: draft.plugins, customPlugins: draft.custom });
        data.projectTheme = saved;
        setPreviewTheme(pageTheme(saved, data.twConfig));
        const d = S.curKey; void d;
        dlg.close();
        loadFrame(); // the canvas takes the plugins
        renderInspector();
    } catch (err) { $("plugErr").textContent = err.message || "Could not save the plugins"; }
    $("plugSave").disabled = false;
}

/** Opens the dialog with the project's plugins as they are now. */
export function openPlugins() {
    if (!dlg) build();
    const pt = data.projectTheme || {};
    draft = { plugins: cleanPlugins(pt.plugins), custom: cleanCustom(pt.customPlugins) };
    draw();
    $("plugErr").textContent = "";
    dlg.showModal();
}
