import { resolveFile } from "../../core/config-resolve.js";
import { checkTheme } from "./config-check.js";
import { TEMPLATES, PAGE_TEMPLATES, cleanEngine } from "../../core/config-file.js";
import { TAILWIND_DEFAULTS, TAILWIND_VERSION } from "../../core/tailwind-defaults.js";

// Tailwind config as the real file (tailwind.config.js for Tailwind 3, global.css for Tailwind 4), in two scopes with the same editor and the same rules:
//   scope "project"  the project's file, for every page: used on the project page (the Config tab) and in the editor (a dialog).
//                    onApply({ engine, configJs, configCss, lock })
//   scope "page"     one page's own file, laid over the project's (the editor's Tailwind config tab). The engine is the project's.
//                    onApply({ js, css, lock })
// Apply reads the file, looks up every package it names, runs it once in a hidden page and then hands the result to the owner to save: Promise<{ ok, message? }>
// Each line that names a package gets a dot in the gutter (green: loaded or built in, amber: warning, red: a page can't do this without a build) and a line below.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const get = async (url, kind) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return kind === "text" ? r.text() : r.json(); };
const DOT = { ok: "#16a34a", warn: "#d97706", error: "#dc2626" };
const STYLE = `.cfe-gutter{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:20px}.cfe-gutter div{height:20px;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding-right:10px}.cfe-gutter i{width:7px;height:7px;border-radius:50%;display:inline-block}.cfe-ta{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:20px;tab-size:2}`;

/** Mounts the editor into `el` (which should have a height). `opts`: { scope, theme (the project's, as stored), tw (the page's { js, css, lock }, for scope "page") }. Returns { set(opts) }. */
export function mountConfigFileEditor(el, opts, onApply) {
    let { scope = "project", theme, tw } = opts;
    const page = () => scope === "page", tmpl = (e) => (page() ? PAGE_TEMPLATES[e] : TEMPLATES[e]);
    const initial = () => (page() ? { "3": (tw && tw.js) || PAGE_TEMPLATES["3"].text, "4": (tw && tw.css) || PAGE_TEMPLATES["4"].text } : { "3": theme.configJs || TEMPLATES["3"].text, "4": theme.configCss || TEMPLATES["4"].text });
    if (!document.getElementById("cfe-style")) { const st = document.createElement("style"); st.id = "cfe-style"; st.textContent = STYLE; document.head.appendChild(st); }
    let engine = cleanEngine(theme.engine);
    let texts = initial();
    let diag = [], verdict = null, busy = false, status = "", dirty = false;

    el.innerHTML = `<div class="flex h-full min-h-0 flex-col bg-white text-xs">
        <div class="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 ${page() ? "text-[11px]" : ""}" data-bar>
            <div class="inline-flex overflow-hidden rounded-md border border-neutral-300" data-seg></div>
            <span class="font-mono text-[12px] text-neutral-700" data-name></span>
            <span class="min-w-0 flex-1 truncate text-neutral-500" data-status></span>
            <select data-insert class="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700"><option value="">Insert default values…</option>${Object.keys(TAILWIND_DEFAULTS).map((k) => `<option value="${k}">${k}</option>`).join("")}</select>
            <button type="button" data-reset class="h-8 rounded-md border border-neutral-200 px-3 hover:bg-neutral-50">Reset</button>
            <button type="button" data-apply class="h-8 rounded-md bg-black px-4 font-semibold text-white hover:bg-neutral-800">Apply</button></div>
        <div class="flex min-h-0 flex-1"><div class="cfe-gutter ${page() ? "w-10" : "w-16"} shrink-0 select-none overflow-hidden border-r border-neutral-100 bg-neutral-50 py-4 text-neutral-400" data-gutter></div>
            <textarea data-ta wrap="off" spellcheck="false" class="cfe-ta min-w-0 flex-1 resize-none border-0 bg-white ${page() ? "p-2" : "p-4"} text-neutral-900 outline-none"></textarea></div>
        <div class="max-h-44 shrink-0 overflow-auto border-t border-neutral-200 bg-neutral-50 px-3 py-2" data-diag></div></div>`;
    const q = (s) => el.querySelector(s), ta = q("[data-ta]");

    const marks = () => { const m = {}; diag.forEach((d) => { const cur = m[d.line]; if (!cur || (d.level === "error") || (d.level === "warn" && cur !== "error")) m[d.line] = d.level; }); return m; };
    function gutter() {
        const n = Math.max(30, ta.value.split("\n").length), m = marks();
        q("[data-gutter]").innerHTML = Array.from({ length: n }, (_, i) => `<div>${m[i + 1] ? `<i style="background:${DOT[m[i + 1]]}" title="${esc(diag.filter((d) => d.line === i + 1).map((d) => d.message).join("\n"))}"></i>` : ""}${i + 1}</div>`).join("");
        q("[data-gutter]").scrollTop = ta.scrollTop;
    }
    function draw() {
        q("[data-seg]").classList.toggle("hidden", page());
        q("[data-seg]").innerHTML = ["3", "4"].map((e) => `<button type="button" data-engine="${e}" class="px-3 py-1.5 ${engine === e ? "bg-black font-medium text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}">Tailwind ${e}</button>`).join("");
        q("[data-name]").textContent = page() ? `This page · ${engine === "4" ? "global.css" : "tailwind.config.js"}` : tmpl(engine).name;
        q("[data-insert]").classList.toggle("hidden", engine !== "3" || page());
        q("[data-status]").textContent = status;
        q("[data-apply]").textContent = busy ? "Checking…" : "Apply";
        const rows = diag.map((d) => `<div class="flex gap-2 py-0.5"><span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style="background:${DOT[d.level]}"></span><span class="w-14 shrink-0 font-mono text-neutral-500">${d.line ? `line ${d.line}` : "file"}</span><span class="${d.level === "error" ? "text-red-800" : d.level === "warn" ? "text-amber-800" : "text-neutral-600"}">${esc(d.message)}</span></div>`).join("");
        q("[data-diag]").innerHTML = rows || `<p class="text-neutral-500">${page() ? "Extends the project's config for this page only. " : ""}${engine === "3" ? "Add a plugin the usual way, like <code>require(\"@tailwindcss/typography\")</code> in <code>plugins</code>. Apply checks each package." : "Add what the plugin's docs say: <code>@import</code> lines of CSS work. <code>@plugin</code> needs a build, which a page doesn't have."}</p>`;
        gutter();
    }
    function load() { ta.value = texts[engine]; diag = []; verdict = null; status = ""; draw(); }

    async function apply() {
        if (busy) return;
        texts[engine] = ta.value;
        busy = true; status = "Looking up packages…"; draw();
        let result;
        try {
            const { lock, diagnostics } = await resolveFile({ engine, text: ta.value }, get);
            diag = diagnostics;
            const candidate = page() ? { ...theme, page: { js: texts["3"], css: texts["4"], lock } } : { ...theme, engine, configJs: texts["3"], configCss: texts["4"], lock };
            status = "Running it once in a hidden page…"; draw();
            verdict = await checkTheme(candidate);
            if (verdict.verdict === "fails") { diag = [...diag, ...verdict.messages.map((m) => ({ line: 0, level: "error", message: m }))]; status = "Not applied: fix the file first."; }
            else {
                if (verdict.verdict !== "works") diag = [...diag, ...verdict.messages.map((m) => ({ line: 0, level: "warn", message: m }))];
                const keep = (e) => (texts[e] === tmpl(e).text ? "" : texts[e]); // the blank template is stored as nothing
                result = await onApply(page() ? { js: keep("3"), css: keep("4"), lock } : { engine, configJs: keep("3"), configCss: keep("4"), lock });
                status = result && result.ok ? (diag.some((d) => d.level === "error") ? "Applied. Lines marked red were left out." : page() ? "Applied to this page." : "Applied to every page in this project.") : `Not saved: ${(result && result.message) || "something went wrong"}`;
                if (result && result.ok) dirty = false;
            }
        } catch (e) { status = e.message || "Something went wrong."; }
        busy = false; draw();
    }

    el.addEventListener("click", (e) => {
        const t = e.target.closest("[data-engine]");
        if (t) { texts[engine] = ta.value; engine = t.dataset.engine; load(); return; }
        if (e.target.closest("[data-apply]")) return apply();
        if (e.target.closest("[data-reset]")) { if (!confirm(`Put ${tmpl(engine).name} back to the blank template?`)) return; texts[engine] = tmpl(engine).text; load(); }
    });
    el.addEventListener("change", (e) => {
        const sel = e.target.closest("[data-insert]");
        if (!sel || !sel.value) return;
        const key = sel.value, snippet = `${key}: ${JSON.stringify(TAILWIND_DEFAULTS[key], null, 2).replace(/\n/g, "\n    ")},\n`;
        const at = ta.selectionStart; ta.setRangeText(snippet, at, at, "end"); sel.value = ""; ta.focus(); diag = []; status = `Inserted Tailwind ${TAILWIND_VERSION}'s default ${key}. Put it inside theme.extend to change it.`; draw();
    });
    ta.addEventListener("input", () => { dirty = true; diag = []; verdict = null; gutter(); });
    ta.addEventListener("scroll", () => { q("[data-gutter]").scrollTop = ta.scrollTop; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Tab") { e.preventDefault(); ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end"); gutter(); } if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); apply(); } });
    load();
    return { set(next) { theme = next.theme; tw = next.tw; engine = cleanEngine(theme.engine); texts = initial(); load(); } };
}
