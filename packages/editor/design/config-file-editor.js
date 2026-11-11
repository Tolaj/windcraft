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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const get = async (url, kind) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return kind === "text" ? r.text() : r.json(); };
const DOT = { ok: "#16a34a", warn: "#d97706", error: "#dc2626" };
const STYLE = `.cfe-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:20px}.cfe-gutter div{height:20px;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding-right:10px}.cfe-gutter i{width:7px;height:7px;border-radius:50%;display:inline-block}.cfe-ta{tab-size:2}.cfe-res pre{margin:0;padding:6px 12px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.5;color:#404040;overflow:auto;max-height:340px;white-space:pre}.cfe-res details>summary{cursor:pointer;list-style:none}.cfe-res details>summary::-webkit-details-marker{display:none}`;

/** Mounts the workspace into `el` (which should have a height). `opts`: { theme (the project's, as stored), tw (this page's { js, css, lock }), scopes: ["project"] or ["page", "project"], scope (the one open first) }. Returns { set(opts), show(scope) }. */
export function mountConfigFileEditor(el, opts, onApply) {
    if (!document.getElementById("cfe-style")) { const st = document.createElement("style"); st.id = "cfe-style"; st.textContent = STYLE; document.head.appendChild(st); }
    let { theme, tw, scopes = ["project"] } = opts;
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
        <div class="flex items-center gap-1 border-b border-neutral-200 px-3 pt-2" data-tabs></div>
        <div class="flex min-h-0 flex-1">
            <div class="flex min-w-0 flex-[3] flex-col"><div class="flex min-h-0 flex-1"><div class="cfe-mono cfe-gutter w-14 shrink-0 select-none overflow-hidden border-r border-neutral-100 bg-neutral-50 py-4 text-neutral-400" data-gutter></div>
                <textarea data-ta wrap="off" spellcheck="false" class="cfe-mono cfe-ta min-w-0 flex-1 resize-none border-0 bg-white p-4 text-neutral-900 outline-none"></textarea></div>
                <div class="max-h-40 shrink-0 overflow-auto border-t border-neutral-200 bg-neutral-50 px-4 py-2" data-diag></div></div>
            <div class="cfe-res flex min-w-0 flex-[2] flex-col border-l border-neutral-200 bg-neutral-50"><div class="border-b border-neutral-200 px-4 py-2.5"><p class="font-semibold text-neutral-900">Result</p><p class="mt-0.5 text-neutral-500" data-resnote></p></div><div class="min-h-0 flex-1 overflow-auto" data-res></div></div></div>
        <div class="flex items-center gap-3 border-t border-neutral-200 px-4 py-2.5"><span class="min-w-0 flex-1 truncate text-neutral-500" data-status></span><button type="button" data-reset class="text-neutral-500 underline hover:text-neutral-900">Reset this file</button><button type="button" data-apply class="h-8 rounded-md bg-black px-5 font-semibold text-white hover:bg-neutral-800">Apply</button></div></div>`;
    const q = (s) => el.querySelector(s), ta = q("[data-ta]");
    const dirty = (sc) => texts[sc][engine] !== saved[sc][engine];

    function tabs() {
        const tab = (sc) => `<button type="button" data-scope="${sc}" class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 ${scope === sc ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}"><span class="font-mono text-[12px]">${name(sc, engine)}</span><span class="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">${sc === "page" ? "this page" : "whole project"}</span>${dirty(sc) ? `<i class="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Not applied yet"></i>` : ""}</button>`;
        const eng = scope === "project"
            ? `<div class="mb-1 ml-auto inline-flex overflow-hidden rounded-md border border-neutral-300">${["3", "4"].map((e) => `<button type="button" data-engine="${e}" class="px-2.5 py-1 ${engine === e ? "bg-black font-medium text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}">Tailwind ${e}</button>`).join("")}</div>`
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
        q("[data-status]").textContent = status[scope];
        q("[data-apply]").textContent = busy ? "Checking…" : scope === "page" ? "Apply to this page" : "Apply to the project";
        const rows = diag[scope].map((d) => `<div class="flex gap-2 py-0.5"><span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style="background:${DOT[d.level]}"></span><span class="w-12 shrink-0 font-mono text-neutral-500">${d.line ? `line ${d.line}` : "file"}</span><span class="${d.level === "error" ? "text-red-800" : d.level === "warn" ? "text-amber-800" : "text-neutral-600"}">${esc(d.message)}</span></div>`).join("");
        q("[data-diag]").innerHTML = rows || `<p class="text-neutral-500">${scope === "page" ? "Only this page uses this file, on top of the project's. " : ""}${engine === "3" ? "Add a plugin the usual way, like <code>require(\"@tailwindcss/typography\")</code> in <code>plugins</code>; Apply checks each package." : "Paste what a plugin's docs say: <code>@import</code> lines of CSS work. <code>@plugin</code> needs a build, which a page doesn't have."}</p>`;
        gutter();
    }
    function load() { ta.value = texts[scope][engine]; draw(); live(); }

    // ── the result: what Tailwind ends up with, for the open file's scope, worked out by running the files ────────────────────────
    const candidate = () => {
        const proj = { ...theme, engine, configJs: texts.project["3"], configCss: texts.project["4"], lock: locks.project };
        return normalizeTheme(scope === "page" ? { ...proj, page: { js: texts.page["3"], css: texts.page["4"], lock: locks.page } } : proj);
    };
    function live(delay = 700) { clearTimeout(timer); const mine = ++seq; q("[data-resnote]").textContent = "Working it out…"; timer = setTimeout(() => showResult(mine), delay); }
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
        if (busy) return;
        const sc = scope;
        texts[sc][engine] = ta.value;
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
        if (e.target.closest("[data-apply]")) return apply();
        if (e.target.closest("[data-reset]")) { if (!confirm(`Put ${name(scope, engine)} (${scope === "page" ? "this page" : "whole project"}) back to the blank template?`)) return; texts[scope][engine] = tmpl(scope, engine); diag[scope] = []; load(); }
    });
    ta.addEventListener("input", () => { texts[scope][engine] = ta.value; diag[scope] = []; tabs(); gutter(); live(); });
    ta.addEventListener("scroll", () => { q("[data-gutter]").scrollTop = ta.scrollTop; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); } if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); apply(); } });
    load();
    return {
        set(next) { theme = next.theme; tw = next.tw; if (next.scopes) scopes = next.scopes; engine = cleanEngine(theme.engine); texts = initial(); saved = initial(); locks = { project: theme.lock || {}, page: (tw && tw.lock) || {} }; diag = { project: [], page: [] }; status = { project: "", page: "" }; if (next.scope) scope = next.scope; if (!scopes.includes(scope)) scope = scopes[0]; load(); },
        show(sc) { if (scopes.includes(sc) && sc !== scope) { texts[scope][engine] = ta.value; scope = sc; load(); } },
    };
}
