import { CATALOGUE, cleanRecipe, cleanRecipes, cleanPlugins, cleanEngine, MAX_RECIPES, MAX_STEPS } from "../../core/plugins.js";
import { parseDocs, guessFromPackage, fetchPackage, inlineImports } from "../../core/plugin-import.js";
import { checkRecipe } from "./plugin-check.js";

// The plugin manager: one component, used on the project page (the Config tab) and in the editor (a dialog). It edits a small state, { engine, plugins, recipes },
// and tells its owner whenever it changes; the owner decides when to save. Adding a plugin that is not in the catalogue goes through three steps: get a draft
// (from a package name, from the lines its documentation says to paste, or by hand), read it, test it in a sandbox. Nothing is added unless it ran.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const get = async (url, kind) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return kind === "text" ? r.text() : r.json(); };
const STEP_TYPES = { script: "Script", stylesheet: "Stylesheet", plugin3: "Tailwind 3 plugin file", css4: "Tailwind 4 CSS", official3: "Official plugin" };
const stepValue = (s) => s.src || s.href || s.text || s.name;
const VERDICT = { works: ["Works", "bg-emerald-50 text-emerald-800 border-emerald-200"], notes: ["Works, with notes", "bg-amber-50 text-amber-800 border-amber-200"], fails: ["Didn't load", "bg-red-50 text-red-800 border-red-200"], build: ["Needs a build", "bg-red-50 text-red-800 border-red-200"] };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "plugin";

/** Mounts the manager into `el`. `initial`: { engine, plugins, recipes }. `onChange(state)` runs after every change. Returns { get(), set(state) }. */
const STYLE = `.pm-in{box-sizing:border-box;width:100%;border:1px solid #e5e5e5;border-radius:6px;background:#f5f5f5;padding:6px 8px;font-size:12px;outline:none}.pm-in:focus{border-color:#111;background:#fff}textarea.pm-in{resize:vertical}.pm-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}select.pm-in{width:auto}`;
export function mountPluginManager(el, initial, onChange = () => {}) {
    if (!document.getElementById("pm-style")) { const st = document.createElement("style"); st.id = "pm-style"; st.textContent = STYLE; document.head.appendChild(st); }
    let state = { engine: cleanEngine(initial.engine), plugins: cleanPlugins(initial.plugins), recipes: cleanRecipes(initial.recipes) };
    let mode = "package", draft = null, busy = "", input = { package: "", docs: "" }, checks = {};
    const change = () => { onChange({ ...state }); draw(); };

    function chip(v) { const [label, cls] = VERDICT[v.verdict]; return `<span class="inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}">${label}</span>`; }
    function verdictBlock(v) { return v ? `<div class="mt-2">${chip(v)}<ul class="mt-1 space-y-0.5 text-[11px] ${v.verdict === "works" ? "text-neutral-500" : "text-neutral-700"}">${v.messages.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""; }

    function row(r, kind) {
        const isCat = kind === "catalogue", on = isCat ? state.plugins.includes(r.id) : r.on, other = r.engine !== state.engine, v = checks[r.id];
        return `<div class="border-b border-neutral-100 px-3 py-2.5 last:border-0 ${other ? "opacity-60" : ""}">
            <div class="flex items-center gap-3"><div class="min-w-0 flex-1"><span class="block text-[13px] font-medium text-neutral-900">${esc(r.name)} <span class="ml-1 rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] font-normal text-neutral-500">v${r.engine}</span></span><span class="block text-neutral-500">${esc(r.about || `${r.steps.length} step${r.steps.length === 1 ? "" : "s"}${other ? ` · runs when the engine is ${r.engine}` : ""}`)}</span></div>
            <button type="button" data-test="${r.id}" class="text-neutral-500 underline hover:text-neutral-900">${busy === `test:${r.id}` ? "Testing…" : "Test"}</button>
            ${isCat ? "" : `<button type="button" data-remove="${r.id}" class="text-neutral-500 hover:text-red-700">Remove</button>`}
            <input type="checkbox" data-on="${r.id}" data-kind="${kind}" ${on ? "checked" : ""} class="h-4 w-4 shrink-0 accent-black"></div>${v ? verdictBlock(v) : ""}</div>`;
    }
    const group = (title, rows) => (rows.length ? `<p class="mb-1.5 mt-5 font-semibold text-neutral-700">${title}</p><div class="overflow-hidden rounded-lg border border-neutral-200 bg-white">${rows.join("")}</div>` : "");

    function draftView() {
        if (!draft) return "";
        const d = draft, steps = d.steps.map((s, i) => `<div class="flex items-start gap-2 border-b border-neutral-100 px-3 py-2 last:border-0"><span class="w-28 shrink-0 pt-1.5 text-[11px] text-neutral-500">${STEP_TYPES[s.type]}</span>${s.type === "css4" ? `<textarea data-stepval="${i}" rows="2" class="pm-in pm-mono flex-1" spellcheck="false">${esc(stepValue(s))}</textarea>` : `<input data-stepval="${i}" class="pm-in pm-mono flex-1" value="${esc(stepValue(s))}" spellcheck="false">`}<button type="button" data-stepdel="${i}" class="pt-1.5 text-neutral-500 hover:text-red-700">Remove</button></div>`).join("");
        return `<div class="mt-4 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
            <div class="flex items-center gap-2"><input data-dname class="pm-in flex-1 font-medium" value="${esc(d.name)}" placeholder="Name"><label class="text-neutral-500">Tailwind</label><select data-dengine class="pm-in" style="width:64px"><option value="3" ${d.engine === "3" ? "selected" : ""}>3</option><option value="4" ${d.engine === "4" ? "selected" : ""}>4</option></select></div>
            ${d.blocked.length ? `<div class="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-red-800"><b class="font-medium">Can't run in a page</b><ul class="mt-0.5 list-disc pl-4">${d.blocked.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : ""}
            ${d.notes.length ? `<ul class="mt-2 list-disc pl-4 text-neutral-500">${d.notes.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
            <p class="mb-1 mt-3 font-semibold text-neutral-700">Steps, in order</p>
            <div class="overflow-hidden rounded-lg border border-neutral-200 bg-white">${steps || `<p class="px-3 py-2 text-neutral-500">No steps yet. Add one below.</p>`}</div>
            <div class="mt-2 flex items-center gap-2"><select data-addtype class="pm-in" style="width:190px">${Object.entries(STEP_TYPES).filter(([k]) => k !== "official3").map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><button type="button" data-addstep class="h-7 rounded-md border border-neutral-200 px-2.5 hover:bg-white">Add step</button></div>
            ${d.engine !== state.engine ? `<p class="mt-2 text-amber-800">This is for Tailwind ${d.engine}; the project uses ${state.engine}. It is saved with the project and runs once the engine matches.</p>` : ""}
            ${verdictBlock(d.verdict)}
            <div class="mt-3 flex gap-2"><button type="button" data-dtest class="h-8 rounded-md border border-neutral-300 px-3 font-medium hover:bg-white">${busy === "dtest" ? "Testing…" : "Test it"}</button><button type="button" data-dadd class="h-8 rounded-md bg-black px-4 font-semibold text-white hover:bg-neutral-800">Add plugin</button><button type="button" data-ddiscard class="ml-auto h-8 px-2 text-neutral-500 hover:text-neutral-900">Discard</button></div>
            <p data-dmsg class="mt-1 min-h-[1rem] text-red-700"></p></div>`;
    }

    function addPanel() {
        const tabs = [["package", "Find a package"], ["docs", "Paste from its docs"], ["hand", "Build by hand"]].map(([k, t]) => `<button type="button" data-mode="${k}" class="border-b-2 px-3 py-1.5 ${mode === k ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}">${t}</button>`).join("");
        const body = mode === "package"
            ? `<p class="text-neutral-500">The name on npm, like <code>preline</code> or <code>@tailwindcss/typography</code>. We look at what the package contains and guess the steps.</p><div class="mt-2 flex gap-2"><input data-pkg class="pm-in pm-mono flex-1" value="${esc(input.package)}" placeholder="package name" spellcheck="false"><button type="button" data-find class="h-8 rounded-md border border-neutral-200 px-3 hover:bg-neutral-50">${busy === "find" ? "Looking…" : "Find"}</button></div>`
            : mode === "docs"
                ? `<p class="text-neutral-500">Paste what the plugin's installation page tells you to add: CSS lines (<code>@import</code>, <code>@source</code>…), a script or link tag, or an install command. Lines a page can't use are skipped, and we say which.</p><textarea data-docs rows="6" class="pm-in pm-mono mt-2" spellcheck="false" placeholder='@import "tailwindcss";\n@source "./node_modules/preline/dist/*.js";\n@import "./node_modules/preline/variants.css";'>${esc(input.docs)}</textarea><button type="button" data-read class="mt-2 h-8 rounded-md border border-neutral-200 px-3 hover:bg-neutral-50">${busy === "read" ? "Reading…" : "Read these lines"}</button>`
                : `<p class="text-neutral-500">Start with an empty recipe and add the steps yourself.</p><button type="button" data-blank class="mt-2 h-8 rounded-md border border-neutral-200 px-3 hover:bg-neutral-50">Start a recipe</button>`;
        return `<p class="mb-1.5 mt-6 font-semibold text-neutral-700">Add a plugin that isn't listed</p><div class="rounded-lg border border-neutral-200 bg-white p-3"><div class="mb-3 flex border-b border-neutral-200">${tabs}</div>${body}<p data-addmsg class="mt-1 min-h-[1rem] text-red-700"></p></div>${draftView()}`;
    }

    function draw() {
        const keep = { top: el.scrollTop };
        const cat = CATALOGUE.filter((r) => r.engine === state.engine);
        el.innerHTML = `<div class="mx-auto max-w-xl text-xs">
            <p class="mb-1.5 font-semibold text-neutral-700">Tailwind engine</p>
            <div class="flex items-center gap-3"><div class="inline-flex overflow-hidden rounded-md border border-neutral-300">${["3", "4"].map((e) => `<button type="button" data-engine="${e}" class="px-3 py-1.5 ${state.engine === e ? "bg-black font-medium text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}">Tailwind ${e}</button>`).join("")}</div>
            <p class="min-w-0 flex-1 text-neutral-500">${state.engine === "3" ? "Version 3.4. Plugins are JavaScript, so the most plugins work here." : "Version 4. Plugins are CSS only; a page written for 3 can look different."}</p></div>
            ${group("Official", cat.filter((r) => !r.group).map((r) => row(r, "catalogue")))}${group("Third party", cat.filter((r) => r.group).map((r) => row(r, "catalogue")))}
            ${group("Your plugins", state.recipes.map((r) => row(r, "own")))}
            ${addPanel()}</div>`;
        el.scrollTop = keep.top;
    }

    const msg = (sel, text) => { const n = el.querySelector(sel); if (n) n.textContent = text; };
    const draftFrom = (d, name) => { draft = { name: name || d.name || "", engine: d.engine || state.engine, steps: d.steps, notes: d.notes || [], blocked: d.blocked || [], verdict: null }; draw(); };
    const asRecipe = () => ({ id: "draft", name: draft.name || "Plugin", engine: draft.engine, steps: draft.steps, on: true });

    async function find() {
        const name = input.package.trim();
        if (!name) return msg("[data-addmsg]", "Type a package name.");
        busy = "find"; draw();
        try { let g = guessFromPackage(await fetchPackage(name, get), { prefer: state.engine }); const inl = await inlineImports(g.steps, get); g = { ...g, steps: inl.steps, notes: [...g.notes, ...inl.notes], blocked: [...g.blocked, ...inl.failed] }; draftFrom(g); }
        catch (e) { busy = ""; draw(); msg("[data-addmsg]", e.message); return; }
        busy = ""; draw();
    }
    async function read() {
        const text = input.docs.trim();
        if (!text) return msg("[data-addmsg]", "Paste the lines first.");
        busy = "read"; draw();
        let r = parseDocs(text);
        const versions = {};
        await Promise.all(r.packages.map(async (p) => { try { versions[p] = (await get(`https://data.jsdelivr.com/v1/packages/npm/${p}/resolved`, "json")).version; } catch { /* unpinned */ } }));
        if (Object.keys(versions).length) r = parseDocs(text, { versionOf: (p) => versions[p] || "latest" });
        const inl = await inlineImports(r.steps, get);
        r = { ...r, steps: inl.steps, notes: [...r.notes, ...inl.notes], blocked: [...r.blocked, ...inl.failed] };
        busy = ""; draftFrom({ ...r, engine: r.engine || state.engine }, r.name);
        if (!r.steps.length && !r.blocked.length) msg("[data-addmsg]", "Nothing in those lines can run in a page.");
    }
    async function runTest(recipe, key) {
        busy = key; draw();
        const v = await checkRecipe(recipe);
        busy = "";
        return v;
    }
    const nameFor = () => { let base = slug(draft.name || "plugin"), id = base, n = 2; const taken = () => CATALOGUE.some((c) => c.id === id) || state.recipes.some((r) => r.id === id); while (taken()) id = `${base}-${n++}`; return id; };

    el.addEventListener("click", async (e) => {
        const t = e.target;
        const q = (a) => t.closest(`[${a}]`);
        if (q("data-engine")) { const en = q("data-engine").dataset.engine; if (en !== state.engine) { state.engine = en; if (draft) draft.verdict = null; change(); } return; }
        if (q("data-mode")) { mode = q("data-mode").dataset.mode; draw(); return; }
        if (q("data-test")) { const id = q("data-test").dataset.test, r = CATALOGUE.find((c) => c.id === id) || state.recipes.find((x) => x.id === id); checks[id] = await runTest({ ...r, engine: r.engine }, `test:${id}`); draw(); return; }
        if (q("data-remove")) { state.recipes = state.recipes.filter((r) => r.id !== q("data-remove").dataset.remove); change(); return; }
        if (q("data-find")) return find();
        if (q("data-read")) return read();
        if (q("data-blank")) return draftFrom({ steps: [], notes: [], blocked: [], engine: state.engine }, "");
        if (q("data-addstep") && draft) { if (draft.steps.length >= MAX_STEPS) return msg("[data-dmsg]", `At most ${MAX_STEPS} steps.`); const type = el.querySelector("[data-addtype]").value; draft.steps.push(type === "css4" ? { type, text: "" } : type === "stylesheet" ? { type, href: "" } : { type, src: "" }); draft.verdict = null; draw(); return; }
        if (q("data-stepdel") && draft) { draft.steps.splice(Number(q("data-stepdel").dataset.stepdel), 1); draft.verdict = null; draw(); return; }
        if (q("data-ddiscard")) { draft = null; draw(); return; }
        if (q("data-dtest") && draft) {
            const rec = cleanRecipe(asRecipe());
            if (!rec) return msg("[data-dmsg]", "Each step needs a valid https link (or CSS). Fix or remove the empty ones.");
            draft.verdict = await runTest(rec, "dtest"); draw(); return;
        }
        if (q("data-dadd") && draft) {
            if (state.recipes.length >= MAX_RECIPES) return msg("[data-dmsg]", `At most ${MAX_RECIPES} plugins of your own.`);
            const rec = cleanRecipe({ ...asRecipe(), id: "draft" });
            if (!rec) return msg("[data-dmsg]", "Each step needs a valid https link (or CSS). Fix or remove the empty ones.");
            if (!draft.verdict) draft.verdict = await runTest(rec, "dtest");
            if (draft.verdict.verdict === "fails" || draft.verdict.verdict === "build") { draw(); return msg("[data-dmsg]", "It didn't run, so it wasn't added. Change the steps and test again."); }
            state.recipes = cleanRecipes([...state.recipes, { ...rec, id: nameFor() }]);
            draft = null; input = { package: "", docs: "" }; change();
        }
    });
    el.addEventListener("change", (e) => {
        const t = e.target;
        if (t.dataset.on) { const id = t.dataset.on; if (t.dataset.kind === "catalogue") { const s = new Set(state.plugins); t.checked ? s.add(id) : s.delete(id); state.plugins = cleanPlugins([...s]); } else state.recipes = state.recipes.map((r) => (r.id === id ? { ...r, on: t.checked } : r)); change(); return; }
        if (t.dataset.dengine !== undefined && draft) { draft.engine = t.value; draft.verdict = null; draw(); }
    });
    el.addEventListener("input", (e) => {
        const t = e.target;
        if (t.dataset.pkg !== undefined) input.package = t.value;
        if (t.dataset.docs !== undefined) input.docs = t.value;
        if (t.dataset.dname !== undefined && draft) draft.name = t.value;
        if (t.dataset.stepval !== undefined && draft) { const s = draft.steps[Number(t.dataset.stepval)]; const k = s.type === "css4" ? "text" : s.type === "stylesheet" ? "href" : "src"; s[k] = t.value; draft.verdict = null; }
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.pkg !== undefined) { e.preventDefault(); find(); } });
    draw();
    return { get: () => ({ ...state }), set: (s) => { state = { engine: cleanEngine(s.engine), plugins: cleanPlugins(s.plugins), recipes: cleanRecipes(s.recipes) }; draw(); } };
}
