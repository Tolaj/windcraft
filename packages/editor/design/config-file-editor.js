import { resolveFile } from "../../core/config-resolve.js";
import { checkTheme } from "./config-check.js";
import { TEMPLATES, PAGE_TEMPLATES, cleanEngine } from "../../core/config-file.js";
import { TAILWIND_DEFAULTS, TAILWIND_VERSION, effectiveConfig } from "../../core/tailwind-defaults.js";
import { themeHead, normalizeTheme } from "../../core/theme.js";

// The Tailwind config workspace, used on the project page (the Config tab) and in the editor (a dialog). It looks like any code editor:
//   file tabs      tailwind.config.js (or global.css on Tailwind 4) for the whole project, and one for this page. A page's file is laid over the project's.
//   your file      on the left: the file as you write it (only your changes and plugins).
//   the result     on the right, always: what Tailwind ends up with (its defaults + your theme choices + the files), worked out by running them, live as you type.
//                  Sections your files change are open and marked; untouched defaults stay folded.
//   Apply          at the bottom, for the open file: it looks up every package the file names, runs the file once in a hidden page, and only then saves.
// Packages are marked line by line in the gutter (green: loaded or built in; amber: warning; red: a page can't do this without a build) and listed under the file.
//   onApply(scope, patch) -> Promise<{ ok, message? }>     scope "project": { engine, configJs, configCss, lock }   scope "page": { js, css, lock }

const COMPACT_HINT = "Every page uses this file, and it applies as you type. Press i to see how to add your own plugin.";
/** How to add a plugin, for the "i" button (Tailwind 3: a config file; Tailwind 4: CSS, since a page has no build for @plugin). Each one is applied as it is, so it can be copied straight into the file. */
const PLUGIN_HELP = {
    "3": [
        ["An official plugin", "Typography, forms and container queries come with the Tailwind CDN. Name them in plugins.", 'module.exports = {\n  plugins: [require("@tailwindcss/typography")],\n};'],
        ["A plugin from npm", "Any package with a plugin file: it is looked up and loaded for you (a plugin that needs a build is marked red).", 'module.exports = {\n  plugins: [require("preline/plugin")],\n};'],
        ["Your own plugin", "Write one in the file: add utilities (single classes) or components (a group of styles under one class).", 'const plugin = require("tailwindcss/plugin");\n\nmodule.exports = {\n  plugins: [\n    plugin(function ({ addUtilities, addComponents, theme }) {\n      addUtilities({\n        ".text-balance": { "text-wrap": "balance" },\n      });\n      addComponents({\n        ".btn": {\n          padding: "0.5rem 1rem",\n          borderRadius: theme("borderRadius.md"),\n          backgroundColor: theme("colors.black"),\n          color: theme("colors.white"),\n        },\n      });\n    }),\n  ],\n};'],
    ],
    "4": [
        ["Your own utility", "A class that does one thing: use it as class=\"text-balance\".", "@utility text-balance {\n  text-wrap: balance;\n}"],
        ["Your own component", "A group of styles under one class name.", "@layer components {\n  .btn {\n    padding: 0.5rem 1rem;\n    border-radius: 0.375rem;\n    background: black;\n    color: white;\n  }\n}"],
        ["Plugins from a package", "@plugin needs a build, which a page doesn't have. Paste the CSS the plugin's docs show instead: @import lines work.", '@import "https://cdn.jsdelivr.net/npm/some-package/styles.css";'],
    ],
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const get = async (url, kind) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return kind === "text" ? r.text() : r.json(); };
const DOT = { ok: "#16a34a", warn: "#d97706", error: "#dc2626" };
const STYLE = `.cfe-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:20px}.cfe-gutter div{height:20px;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding-right:10px}.cfe-gutter i{width:7px;height:7px;border-radius:50%;display:inline-block}.cfe-ta{tab-size:2}.cfe-res pre{margin:0;padding:6px 12px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.5;color:#404040;overflow:auto;max-height:340px;white-space:pre}.cfe-res details>summary{cursor:pointer;list-style:none}.cfe-res details>summary::-webkit-details-marker{display:none}@media (max-width:760px){.cfe-cols{flex-direction:column}.cfe-cols>*{flex:none!important;min-height:0}.cfe-cols .cfe-left{height:50vh}.cfe-cols .cfe-res{max-height:40vh}}`;

/** Mounts the workspace into `el` (which should have a height). `opts`: { theme (the project's, as stored), tw (this page's { js, css, lock }), scopes: ["project"] or ["page", "project"], scope (the one open first) }. Returns { set(opts), show(scope) }. */
export function mountConfigFileEditor(el, opts, onApply) {
    if (!document.getElementById("cfe-style")) { const st = document.createElement("style"); st.id = "cfe-style"; st.textContent = STYLE; document.head.appendChild(st); }
    let { theme, tw, scopes = ["project"] } = opts;
    const compact = Boolean(opts.compact); // one file, edited live: no file tabs, no result column, no Apply (it applies itself a moment after typing)
    let scope = opts.scope || scopes[0], engine = cleanEngine(theme.engine);
    const name = (sc, e) => (e === "4" ? "global.css" : "tailwind.config.js");
    const tmpl = (sc, e) => (sc === "page" ? PAGE_TEMPLATES[e] : TEMPLATES[e]).text;
    const initial = () => ({
        project: { "3": theme.configJs || TEMPLATES["3"].text, "4": theme.configCss || TEMPLATES["4"].text },
        page: { "3": (tw && tw.js) || PAGE_TEMPLATES["3"].text, "4": (tw && tw.css) || PAGE_TEMPLATES["4"].text },
    });
    let texts = initial(), saved = initial(), locks = { project: theme.lock || {}, page: (tw && tw.lock) || {} };
    let diag = { project: [], page: [] }, status = { project: "", page: "" }, busy = false, seq = 0, timer = null;

    el.innerHTML = `<div class="flex h-full min-h-0 flex-col bg-white text-xs">
        <div class="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 px-3 pt-2" role="tablist" aria-label="Config files" data-tabs></div>
        <div class="cfe-cols flex min-h-0 flex-1 overflow-auto">
            <div class="cfe-left flex min-w-0 flex-[3] flex-col"><div class="flex min-h-0 flex-1"><div class="cfe-mono cfe-gutter w-14 shrink-0 select-none overflow-hidden border-r border-neutral-100 bg-neutral-50 py-4 text-neutral-400" data-gutter></div>
                <textarea data-ta wrap="off" spellcheck="false" aria-label="Config file" class="cfe-mono cfe-ta min-w-0 flex-1 resize-none border-0 bg-white p-4 text-neutral-900 outline-none"></textarea></div>
                <div class="max-h-40 shrink-0 overflow-auto border-t border-neutral-200 bg-neutral-50 px-4 py-2" aria-live="polite" aria-label="Checks" data-diag></div></div>
            <div class="cfe-res flex min-w-0 flex-[2] flex-col border-l border-neutral-200 bg-neutral-50"><div class="border-b border-neutral-200 px-4 py-2.5"><p class="font-semibold text-neutral-900">Result</p><p class="mt-0.5 text-neutral-500" aria-live="polite" data-resnote></p></div><div class="min-h-0 flex-1 overflow-auto" data-res></div></div></div>
        <div class="flex items-center gap-3 border-t border-neutral-200 px-4 py-2.5"><span class="min-w-0 flex-1 truncate text-neutral-500" role="status" aria-live="polite" data-status></span><button type="button" data-note class="hidden text-neutral-500 underline hover:text-neutral-900"></button><button type="button" data-values title="Your changes next to Tailwind's default values" style="border:1px solid #d4d4d4;border-radius:4px;padding:1px 8px" class="hidden shrink-0 text-neutral-600 hover:text-neutral-900">Default values</button><button type="button" data-help title="How to add a plugin" aria-label="How to add a plugin" style="width:20px;height:20px;color:#737373;background:none;border:1px solid #a3a3a3;border-radius:9999px;font:italic 12px Georgia,serif;line-height:1" class="hidden shrink-0 items-center justify-center hover:text-neutral-900">i</button><button type="button" data-reset class="text-neutral-500 underline hover:text-neutral-900">Reset this file</button><button type="button" data-apply class="h-8 rounded-md bg-black px-5 font-semibold text-white hover:bg-neutral-800">Apply</button></div></div>`;
    let infoDlg = null; // the dialog behind the "i" button (compact only)
    const q = (s) => el.querySelector(s) || (infoDlg && infoDlg.querySelector(s)), ta = q("[data-ta]");
    if (compact) { ["[data-tabs]", ".cfe-res", "[data-apply]"].forEach((sel) => q(sel).classList.add("hidden")); q(".cfe-left").classList.add("flex-1"); }
    let autoTimer = null, tried = "";
    // compact: the result column is not beside the file; the "i" button shows it (what is custom and what is Tailwind's default) in a dialog
    if (compact) { q("[data-values]").classList.remove("hidden"); q("[data-help]").classList.replace("hidden", "flex"); }
    let helpDlg = null;
    function showHelp() {
        if (!helpDlg) {
            const items = PLUGIN_HELP[engine] || PLUGIN_HELP["3"];
            helpDlg = document.createElement("dialog");
            helpDlg.className = "m-auto max-h-[min(86vh,720px)] w-[min(680px,94vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
            helpDlg.innerHTML = `<div class="flex max-h-[inherit] min-h-0 flex-col bg-white text-xs"><div class="flex items-center justify-between border-b border-neutral-200 px-5 py-3"><div><h3 class="text-sm font-semibold text-neutral-900">Adding a plugin</h3><p class="mt-0.5 text-[11px] text-neutral-500">Put one of these in the file; it applies as you type. Tailwind ${engine}.</p></div><button type="button" data-close aria-label="Close" class="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100">Close</button></div><div class="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">${items.map(([t, d, code], i) => `<section><div class="flex items-center justify-between gap-3"><p class="font-semibold text-neutral-900">${esc(t)}</p><button type="button" data-copy="${i}" class="rounded px-2 py-0.5 text-neutral-500 underline hover:text-neutral-900">Copy</button></div><p class="mt-0.5 text-neutral-500">${esc(d)}</p><pre data-example="${i}" class="cfe-mono mt-1.5 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-neutral-900">${esc(code)}</pre></section>`).join("")}</div></div>`;
            document.body.appendChild(helpDlg);
            helpDlg.addEventListener("click", (e) => {
                if (e.target === helpDlg || e.target.closest("[data-close]")) return helpDlg.close();
                const c = e.target.closest("[data-copy]");
                if (c) navigator.clipboard.writeText(items[Number(c.dataset.copy)][2]).then(() => { c.textContent = "Copied"; setTimeout(() => { c.textContent = "Copy"; }, 1200); }, () => { c.textContent = "Copy failed"; });
            });
            helpDlg.addEventListener("keydown", (e) => e.stopPropagation());
        }
        helpDlg.showModal();
    }
    function showValues() {
        if (!infoDlg) {
            infoDlg = document.createElement("dialog");
            infoDlg.className = "m-auto h-[min(80vh,640px)] w-[min(720px,94vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
            infoDlg.innerHTML = `<div class="flex h-full min-h-0 flex-col bg-white text-xs"><div class="flex items-center justify-between border-b border-neutral-200 px-5 py-3"><div><h3 class="text-sm font-semibold text-neutral-900">Default values</h3><p class="mt-0.5 text-[11px] text-neutral-500">What Tailwind uses now: its default values, with the sections your file changes marked "customised" and open.</p></div><button type="button" data-close aria-label="Close" class="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100">Close</button></div><div class="min-h-0 flex-1 overflow-hidden" data-slot></div></div>`;
            document.body.appendChild(infoDlg);
            infoDlg.addEventListener("click", (e) => { if (e.target === infoDlg || e.target.closest("[data-close]")) infoDlg.close(); });
            infoDlg.addEventListener("keydown", (e) => e.stopPropagation());
            infoDlg.addEventListener("close", () => { const r = infoDlg.querySelector(".cfe-res"); if (r) { r.classList.add("hidden"); el.querySelector(".cfe-cols").appendChild(r); } });
        }
        const res = q(".cfe-res") || infoDlg.querySelector(".cfe-res");
        res.classList.remove("hidden"); res.classList.add("h-full", "border-l-0");
        infoDlg.querySelector("[data-slot]").appendChild(res);
        infoDlg.showModal();
        q("[data-resnote]").textContent = "Working it out…";
        showResult(++seq); // worked out from the file as it is now
    }
    const dirty = (sc) => texts[sc][engine] !== saved[sc][engine];

    function tabs() {
        const tab = (sc) => `<button type="button" role="tab" aria-selected="${scope === sc}" data-scope="${sc}" class="-mb-px flex items-center gap-2 rounded-t-md border-x border-t-2 px-3 py-2 ${scope === sc ? "border-x-neutral-200 border-t-neutral-900 bg-white text-neutral-900 shadow-[0_1px_0_#fff]" : "border-x-transparent border-t-transparent bg-neutral-50 text-neutral-400 hover:text-neutral-900"}"><span class="font-mono text-[12px] ${scope === sc ? "font-semibold" : ""}">${name(sc, engine)}</span><span class="rounded px-1.5 py-0.5 text-[10px] ${scope === sc ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}">${sc === "page" ? "this page" : "whole project"}</span>${dirty(sc) ? `<i class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Not applied yet"></i>` : ""}</button>`;
        const eng = scope === "project"
            ? `<div class="mb-1 ml-auto inline-flex overflow-hidden rounded-md border border-neutral-300">${["3", "4"].map((e) => `<button type="button" aria-pressed="${engine === e}" data-engine="${e}" class="px-2.5 py-1 ${engine === e ? "bg-black font-medium text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}">Tailwind ${e}</button>`).join("")}</div>`
            : `<span class="mb-1 ml-auto text-neutral-500">Tailwind ${engine}, set in the project's file</span>`;
        q("[data-tabs]").innerHTML = scopes.map(tab).join("") + eng;
    }
    function gutter() {
        const n = Math.max(30, ta.value.split("\n").length), m = {};
        diag[scope].forEach((d) => { const c = m[d.line]; if (!c || d.level === "error" || (d.level === "warn" && c !== "error")) m[d.line] = d.level; });
        q("[data-gutter]").innerHTML = Array.from({ length: n }, (_, i) => `<div>${m[i + 1] ? `<i style="background:${DOT[m[i + 1]]}" title="${esc(diag[scope].filter((d) => d.line === i + 1).map((d) => d.message).join("\n"))}"></i>` : ""}${i + 1}</div>`).join("");
        q("[data-gutter]").scrollTop = ta.scrollTop;
    }
    function draw() {
        tabs();
        q("[data-status]").textContent = status[scope] || (compact ? COMPACT_HINT : "");
        q("[data-apply]").textContent = busy ? "Checking…" : scope === "page" ? "Apply to this page" : "Apply to the project";
        const rows = diag[scope].map((d) => `<div class="flex gap-2 py-0.5"><span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style="background:${DOT[d.level]}"></span><span class="w-12 shrink-0 font-mono text-neutral-500">${d.line ? `line ${d.line}` : "file"}</span><span class="${d.level === "error" ? "text-red-800" : d.level === "warn" ? "text-amber-800" : "text-neutral-600"}">${esc(d.message)}</span></div>`).join("");
        q("[data-diag]").innerHTML = rows || `<p class="text-neutral-500">${scope === "page" ? "Only this page uses this file, on top of the project's. " : compact ? "Every page in this project uses this file. " : ""}${engine === "3" ? "Add a plugin the usual way, like <code>require(\"@tailwindcss/typography\")</code> in <code>plugins</code>; " + (compact ? "it is applied as you type, and each package is checked." : "Apply checks each package.") : "Paste what a plugin's docs say: <code>@import</code> lines of CSS work. <code>@plugin</code> needs a build, which a page doesn't have."}</p>`;
        if (compact) q("[data-diag]").classList.toggle("hidden", !rows); // one footer line: the checks only take room when there is something to say
        gutter();
    }
    function load() { ta.value = texts[scope][engine]; draw(); live(); }

    // ── the result: what Tailwind ends up with, for the open file's scope, worked out by running the files ────────────────────────
    const candidate = () => {
        const proj = { ...theme, engine, configJs: texts.project["3"], configCss: texts.project["4"], lock: locks.project };
        return normalizeTheme(scope === "page" ? { ...proj, page: { js: texts.page["3"], css: texts.page["4"], lock: locks.page } } : proj);
    };
    function live(delay = 700) { if (compact) return; clearTimeout(timer); const mine = ++seq; q("[data-resnote]").textContent = "Working it out…"; timer = setTimeout(() => showResult(mine), delay); }
    async function showResult(mine) {
        const t = candidate();
        if (engine === "4") {
            const css = ((/<style[^>]*data-wc-theme>([\s\S]*?)<\/style>/.exec(themeHead(t)) || [])[1] || "").trim();
            if (mine !== seq) return;
            q("[data-res]").innerHTML = `<pre>${esc(css)}</pre>`;
            q("[data-resnote]").textContent = "The CSS the Tailwind 4 browser build receives: your theme choices and the files, with imports written in.";
            return;
        }
        const r = await checkTheme(t);
        if (mine !== seq) return; // a newer edit is already being worked out
        if (!r.config) { q("[data-res]").innerHTML = `<p class="px-4 py-3 text-red-800">${esc((r.messages || ["It couldn't be worked out."]).join(" "))}</p>`; q("[data-resnote]").textContent = "Fix the file to see the result."; return; }
        const eff = effectiveConfig(r.config).theme, keys = Object.keys(eff);
        const changed = (k) => JSON.stringify(eff[k]) !== JSON.stringify(TAILWIND_DEFAULTS[k]);
        const ordered = [...keys.filter(changed), ...keys.filter((k) => !changed(k))];
        q("[data-res]").innerHTML = ordered.map((k) => `<details ${changed(k) ? "open" : ""} class="border-b border-neutral-200"><summary class="flex items-center gap-2 px-4 py-2 hover:bg-white"><span class="font-medium text-neutral-900">${esc(k)}</span>${changed(k) ? `<span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">customised</span>` : `<span class="text-[10px] text-neutral-400">Tailwind default</span>`}<span class="ml-auto text-neutral-400">▾</span></summary><pre>${esc(JSON.stringify(eff[k], null, 2))}</pre></details>`).join("");
        q("[data-resnote]").textContent = `Tailwind ${TAILWIND_VERSION}'s defaults with your theme choices and ${scope === "page" ? "the project's file and this page's" : "the project's file"}. Customised sections are open.`;
    }

    async function apply() {
        if (busy) { if (compact) { clearTimeout(autoTimer); autoTimer = setTimeout(apply, 600); } return; } // typing goes on: try again when this one is done
        const sc = scope;
        texts[sc][engine] = ta.value;
        tried = ta.value;
        busy = true; status[sc] = "Looking up packages…"; draw();
        try {
            const { lock, diagnostics } = await resolveFile({ engine, text: ta.value }, get);
            diag[sc] = diagnostics;
            locks[sc] = lock;
            status[sc] = "Running it once in a hidden page…"; draw();
            const verdict = await checkTheme(candidate());
            if (verdict.verdict === "fails") { diag[sc] = [...diag[sc], ...verdict.messages.map((m) => ({ line: 0, level: "error", message: m }))]; status[sc] = "Not applied: fix the file first."; }
            else {
                if (verdict.verdict !== "works") diag[sc] = [...diag[sc], ...verdict.messages.map((m) => ({ line: 0, level: "warn", message: m }))];
                const keep = (s, e) => (texts[s][e] === tmpl(s, e) ? "" : texts[s][e]); // the blank template is stored as nothing
                const result = await onApply(sc, sc === "page" ? { js: keep("page", "3"), css: keep("page", "4"), lock } : { engine, configJs: keep("project", "3"), configCss: keep("project", "4"), lock });
                if (result && result.ok) { saved[sc][engine] = texts[sc][engine]; if (sc === "project") theme = { ...theme, engine }; }
                status[sc] = result && result.ok ? (diag[sc].some((d) => d.level === "error") ? "Applied. Lines marked red were left out." : sc === "page" ? "Applied to this page." : "Applied to every page in this project.") : `Not saved: ${(result && result.message) || "something went wrong"}`;
            }
        } catch (e) { status[sc] = e.message || "Something went wrong."; }
        busy = false; draw(); live(0);
    }

    el.addEventListener("click", (e) => {
        const sc = e.target.closest("[data-scope]");
        if (sc) { texts[scope][engine] = ta.value; scope = sc.dataset.scope; load(); return; }
        const en = e.target.closest("[data-engine]");
        if (en) { texts[scope][engine] = ta.value; engine = en.dataset.engine; load(); return; }
        if (e.target.closest("[data-values]")) return showValues();
        if (e.target.closest("[data-help]")) return showHelp();
        if (e.target.closest("[data-note]")) return opts.onNote && opts.onNote();
        if (e.target.closest("[data-apply]")) return apply();
        if (e.target.closest("[data-reset]")) { if (!confirm(`Put ${name(scope, engine)} (${scope === "page" ? "this page" : "whole project"}) back to the blank template?`)) return; texts[scope][engine] = tmpl(scope, engine); diag[scope] = []; load(); }
    });
    ta.addEventListener("input", () => {
        texts[scope][engine] = ta.value; diag[scope] = []; tabs(); gutter(); live();
        if (compact) { status[scope] = "Applying…"; q("[data-status]").textContent = status[scope]; clearTimeout(autoTimer); autoTimer = setTimeout(apply, 900); }
    });
    ta.addEventListener("scroll", () => { q("[data-gutter]").scrollTop = ta.scrollTop; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Tab" && !e.shiftKey) { // Shift+Tab leaves the editor, so a keyboard user is never trapped in it
         e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); } if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); apply(); } });
    load();
    return {
        set(next) { theme = next.theme; tw = next.tw; if (next.scopes) scopes = next.scopes; engine = cleanEngine(theme.engine); texts = initial(); saved = initial(); locks = { project: theme.lock || {}, page: (tw && tw.lock) || {} }; diag = { project: [], page: [] }; status = { project: "", page: "" }; if (next.scope) scope = next.scope; if (!scopes.includes(scope)) scope = scopes[0]; load(); },
        /** The open file as it is in the editor now, as stored (the blank template is nothing): lets the Code panel tell its own save from a change made elsewhere. */
        current() { const keep = (e) => (texts[scope][e] === tmpl(scope, e) ? "" : texts[scope][e]); return { js: keep("3"), css: keep("4") }; },
        /** A link beside Reset (null hides it): the compact editor uses it to reach a file it does not show. */
        setNote(text) { const b = q("[data-note]"); b.textContent = text || ""; b.classList.toggle("hidden", !text); },
        show(sc) { if (scopes.includes(sc) && sc !== scope) { texts[scope][engine] = ta.value; scope = sc; load(); } },
    };
}
