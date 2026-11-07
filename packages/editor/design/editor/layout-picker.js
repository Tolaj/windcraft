import { host } from "../host.js";
import { config } from "../config.js";
import { buildPreviewDocument, parseComponentSource } from "../../playground/component-source.js";
import { $, S, esc, model } from "./base.js";
import { addToEmpty, draftPage } from "./add-menu.js";
import { docs } from "./designs.js";

// ── A new, empty page: start with a layout ───────────────────────────────────────────────────────────────────────
// Over an empty page the canvas offers ready layouts: a few built-in page skeletons, the frame of another page of the project
// ("Same as Home": its header, sidebar and footer, with an empty middle), and the AI box. A pick is plain Tailwind HTML put in the
// page like anything pasted, so it is edited, dragged and undone like the rest. Blank (or Esc) leaves the page empty.

const BAR = (label) => `<div class="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-400">${label}</div>`;
const CARD = (title, text) => `<div class="rounded-xl border border-gray-200 bg-white p-6"><h3 class="font-semibold text-gray-900">${title}</h3><p class="mt-2 text-sm text-gray-600">${text}</p></div>`;
const HEADER = `<header class="border-b border-gray-200 bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"><a href="#" class="text-lg font-semibold text-gray-900">Brand</a><nav class="hidden items-center gap-8 text-sm text-gray-600 md:flex"><a href="#">Product</a><a href="#">Pricing</a><a href="#">About</a></nav><a href="#" class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">Get started</a></div></header>`;
const FOOTER = `<footer class="border-t border-gray-200 bg-white"><div class="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-gray-500 md:flex-row md:items-center md:justify-between"><p>© Brand</p><nav class="flex gap-6"><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Contact</a></nav></div></footer>`;
const SIDEBAR = `<aside class="hidden w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-4 md:block"><a href="#" class="block px-3 py-2 text-lg font-semibold text-gray-900">Brand</a><nav class="mt-6 flex flex-col gap-1 text-sm"><a href="#" class="rounded-md bg-gray-200 px-3 py-2 font-medium text-gray-900">Overview</a><a href="#" class="rounded-md px-3 py-2 text-gray-600">Projects</a><a href="#" class="rounded-md px-3 py-2 text-gray-600">Team</a><a href="#" class="rounded-md px-3 py-2 text-gray-600">Settings</a></nav></aside>`;
const TOPBAR = (title) => `<header class="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6"><h1 class="text-lg font-semibold text-gray-900">${title}</h1><div class="flex items-center gap-3"><input type="text" placeholder="Search" class="hidden rounded-md border border-gray-300 px-3 py-1.5 text-sm md:block"><span class="h-8 w-8 rounded-full bg-gray-300"></span></div></header>`;
const STAT = (label, value) => `<div class="rounded-xl border border-gray-200 bg-white p-5"><p class="text-sm text-gray-500">${label}</p><p class="mt-2 text-2xl font-semibold text-gray-900">${value}</p></div>`;
const PLAN = (name, price, featured) => `<div class="flex flex-col rounded-2xl border ${featured ? "border-gray-900 shadow-lg" : "border-gray-200"} bg-white p-8"><h3 class="font-semibold text-gray-900">${name}</h3><p class="mt-4 text-4xl font-bold text-gray-900">${price}<span class="text-base font-normal text-gray-500">/mo</span></p><ul class="mt-6 flex flex-col gap-3 text-sm text-gray-600"><li>A feature of this plan</li><li>Another feature</li><li>One more feature</li></ul><a href="#" class="mt-8 rounded-md ${featured ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-900"} px-4 py-2.5 text-center text-sm font-medium">Choose ${name}</a></div>`;

export const LAYOUTS = [
    ["landing", "Landing", `${HEADER}<main><section class="mx-auto max-w-3xl px-6 py-24 text-center"><h1 class="text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">Your headline goes here</h1><p class="mt-6 text-lg text-gray-600">One sentence that says what this is and who it is for.</p><div class="mt-10 flex justify-center gap-3"><a href="#" class="rounded-md bg-gray-900 px-5 py-3 text-sm font-medium text-white">Primary action</a><a href="#" class="rounded-md border border-gray-300 px-5 py-3 text-sm font-medium text-gray-900">Learn more</a></div></section><section class="mx-auto grid max-w-6xl gap-6 px-6 pb-24 md:grid-cols-3">${CARD("Feature one", "Describe it in a line.")}${CARD("Feature two", "Describe it in a line.")}${CARD("Feature three", "Describe it in a line.")}</section></main>${FOOTER}`],
    ["app", "App shell", `<div class="flex min-h-screen bg-white">${SIDEBAR}<div class="flex min-w-0 flex-1 flex-col">${TOPBAR("Overview")}<main class="flex-1 p-6">${BAR("Page content")}</main></div></div>`],
    ["dashboard", "Dashboard", `<div class="flex min-h-screen bg-gray-50">${SIDEBAR}<div class="flex min-w-0 flex-1 flex-col">${TOPBAR("Dashboard")}<main class="flex flex-col gap-6 p-6"><div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">${STAT("Revenue", "$48,200")}${STAT("Users", "2,310")}${STAT("Orders", "1,204")}${STAT("Growth", "12%")}</div><div class="grid gap-6 xl:grid-cols-3"><div class="rounded-xl border border-gray-200 bg-white p-6 xl:col-span-2"><h2 class="font-semibold text-gray-900">Activity</h2><div class="mt-4 h-48 rounded-lg bg-gray-100"></div></div><div class="rounded-xl border border-gray-200 bg-white p-6"><h2 class="font-semibold text-gray-900">Recent</h2><ul class="mt-4 flex flex-col gap-3 text-sm text-gray-600"><li>An item</li><li>Another item</li><li>One more item</li></ul></div></div></main></div></div>`],
    ["docs", "Docs", `${HEADER}<div class="mx-auto flex max-w-7xl gap-10 px-6 py-10"><nav class="hidden w-56 shrink-0 flex-col gap-1 text-sm md:flex"><p class="mb-2 font-semibold text-gray-900">Getting started</p><a href="#" class="rounded-md bg-gray-100 px-3 py-1.5 font-medium text-gray-900">Introduction</a><a href="#" class="rounded-md px-3 py-1.5 text-gray-600">Installation</a><a href="#" class="rounded-md px-3 py-1.5 text-gray-600">Usage</a></nav><main class="min-w-0 flex-1"><h1 class="text-3xl font-bold text-gray-900">Page title</h1><p class="mt-4 text-gray-600">Start the page with a short introduction.</p><h2 class="mt-10 text-xl font-semibold text-gray-900">A section</h2><p class="mt-3 text-gray-600">Write the section here.</p></main><aside class="hidden w-48 shrink-0 text-sm xl:block"><p class="font-semibold text-gray-900">On this page</p><a href="#" class="mt-3 block text-gray-600">A section</a></aside></div>`],
    ["auth", "Sign in", `<main class="flex min-h-screen items-center justify-center bg-gray-50 px-6"><div class="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8"><h1 class="text-2xl font-semibold text-gray-900">Sign in</h1><p class="mt-2 text-sm text-gray-600">Welcome back.</p><form class="mt-8 flex flex-col gap-4"><label class="flex flex-col gap-1.5 text-sm font-medium text-gray-700">Email<input type="email" placeholder="name@company.com" class="rounded-md border border-gray-300 px-3 py-2 font-normal"></label><label class="flex flex-col gap-1.5 text-sm font-medium text-gray-700">Password<input type="password" class="rounded-md border border-gray-300 px-3 py-2"></label><button type="submit" class="mt-2 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white">Sign in</button></form><p class="mt-6 text-center text-sm text-gray-600">No account? <a href="#" class="font-medium text-gray-900">Sign up</a></p></div></main>`],
    ["pricing", "Pricing", `${HEADER}<main class="mx-auto max-w-6xl px-6 py-20"><div class="mx-auto max-w-2xl text-center"><h1 class="text-4xl font-bold tracking-tight text-gray-900">Simple pricing</h1><p class="mt-4 text-lg text-gray-600">Pick the plan that fits.</p></div><div class="mt-14 grid gap-6 md:grid-cols-3">${PLAN("Starter", "$9")}${PLAN("Pro", "$29", true)}${PLAN("Team", "$79")}</div></main>${FOOTER}`],
    ["blog", "Blog post", `${HEADER}<main class="px-6 py-16"><article class="mx-auto max-w-2xl"><p class="text-sm text-gray-500">March 4 · 5 min read</p><h1 class="mt-3 text-4xl font-bold tracking-tight text-gray-900">Title of the post</h1><p class="mt-6 text-lg text-gray-600">The opening paragraph sets up what the post is about.</p><div class="mt-10 h-64 rounded-xl bg-gray-100"></div><p class="mt-10 text-gray-700">The body of the post goes here.</p></article></main>${FOOTER}`],
];

/**
 * The frame of a page, for a new page that should look like it: its header, nav, sidebar and footer stay, what they frame becomes one
 * empty placeholder. Null when the page has no such frame (nothing to share).
 */
export function shellOf(markup) {
    const doc = new DOMParser().parseFromString(`<body>${markup || ""}`, "text/html");
    const body = doc.body;
    const hole = () => { const t = doc.createElement("template"); t.innerHTML = BAR("Page content").replace("p-6", "p-10"); return t.content.firstChild; };
    const main = body.querySelector("main");
    if (main) { main.replaceChildren(hole()); return body.innerHTML.trim(); }
    const frame = [...body.querySelectorAll("header, nav, aside, footer")].filter((n) => !n.parentElement.closest("header, nav, aside, footer"));
    if (!frame.length) return null;
    const keep = new Set();
    frame.forEach((n) => { for (let a = n; a && a !== body; a = a.parentElement) keep.add(a); });
    const prune = (box) => {
        let placed = false;
        [...box.children].forEach((k) => {
            if (frame.includes(k)) return; // a header or sidebar: kept as it is
            if (keep.has(k)) return prune(k); // holds part of the frame: go in
            if (!placed) { k.replaceWith(hole()); placed = true; } else k.remove(); // the page's own content: one placeholder for all of it
        });
    };
    prune(body);
    return body.innerHTML.trim();
}

/** Pages of this project that have a frame to share: [{ title, html }]. */
function framesHere() {
    const out = [];
    docs.forEach((d, key) => {
        if (key === S.curKey) return;
        const markup = d.loaded ? d.markup : parseComponentSource(d.source || "").markup;
        const html = markup && markup.trim() && shellOf(markup);
        if (html) out.push({ title: (d.meta && d.meta.title) || "Untitled page", html });
    });
    return out.slice(0, 4);
}

const dismissed = new Set(); // pages where Blank was chosen: the picker stays away from them
let box = null, keyShown = null, sizer = null;

/** A tile: a live, themed preview of the layout (a real page, shrunk), and its name. */
function tile(id, name, html) {
    const doc = html ? buildPreviewDocument(parseComponentSource(html), { width: 1280 }) : "";
    return `<button type="button" data-layout="${id}" class="group text-left">
        <div class="relative aspect-[16/10] overflow-hidden rounded-lg border border-neutral-200 bg-white transition group-hover:border-neutral-900">
            ${html ? `<iframe tabindex="-1" sandbox="allow-scripts" class="pointer-events-none absolute left-0 top-0 origin-top-left" style="width:1280px;height:800px;border:0" srcdoc="${esc(doc)}"></iframe>` : `<div class="flex h-full items-center justify-center text-2xl text-neutral-300">+</div>`}
        </div>
        <div class="mt-1.5 truncate text-xs text-neutral-600 group-hover:text-neutral-900">${esc(name)}</div>
    </button>`;
}

function build() {
    const frames = framesHere();
    const canAI = typeof host.generate === "function";
    box = document.createElement("div");
    box.id = "layoutPicker";
    box.className = "pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-6";
    box.innerHTML = `<div data-card class="pointer-events-auto max-h-full w-full max-w-[780px] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_48px_rgba(0,0,0,.18)]">
        <div class="flex items-center justify-between"><h2 class="text-[15px] font-semibold text-neutral-900">Start with a layout</h2>
            <button type="button" data-skip class="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">Start blank</button></div>
        <p class="mt-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Built in</p>
        <div class="mt-2 grid grid-cols-4 gap-3">${tile("blank", "Blank", "")}${LAYOUTS.map(([id, name, html]) => tile(id, name, html)).join("")}</div>
        ${frames.length ? `<p class="mt-5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Same as a page in this project</p>
        <div class="mt-2 grid grid-cols-4 gap-3">${frames.map((f, i) => tile(`frame-${i}`, `Like “${f.title}”`, f.html)).join("")}</div>` : ""}
        ${canAI ? `<p class="mt-5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Or describe it</p>
        <form data-ai class="mt-2 flex gap-2"><input name="prompt" type="text" placeholder="A pricing page with three plans and an FAQ" class="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900">
            <button type="submit" class="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Generate</button></form>
        <p data-ai-msg class="mt-2 hidden text-xs"></p>` : ""}
    </div>`;
    $("canvas").appendChild(box);
    // the previews are pages 1280 wide, shrunk to their tile
    const node = box;
    const fit = () => node.querySelectorAll("[data-layout] iframe").forEach((f) => { const w = f.parentElement.clientWidth; if (w) f.style.transform = `scale(${w / 1280})`; });
    sizer = new ResizeObserver(fit);
    sizer.observe(node);
    fit();
    const card = box.querySelector("[data-card]");
    // the canvas pans and zooms with the wheel and the pointer: not under the picker
    ["wheel", "pointerdown"].forEach((t) => card.addEventListener(t, (e) => e.stopPropagation()));
    card.addEventListener("click", (e) => {
        const t = e.target.closest("[data-layout]");
        if (e.target.closest("[data-skip]") || (t && t.dataset.layout === "blank")) return skip();
        if (!t) return;
        const id = t.dataset.layout;
        const html = id.startsWith("frame-") ? frames[Number(id.slice(6))].html : (LAYOUTS.find((l) => l[0] === id) || [])[2];
        if (html && model.markup.trim() === "") { hide(); addToEmpty(html); }
    });
    const form = card.querySelector("[data-ai]");
    if (form) form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const prompt = form.prompt.value.trim(), msg = card.querySelector("[data-ai-msg]");
        msg.classList.remove("hidden");
        if (!prompt) { msg.className = "mt-2 text-xs text-red-600"; msg.textContent = "Describe the page first."; return; }
        msg.className = "mt-2 text-xs text-neutral-500"; msg.textContent = "Drafting the page…";
        const res = await draftPage(prompt);
        if (!res.ok) { msg.className = "mt-2 text-xs text-red-600"; msg.textContent = res.message || "Couldn't draft the page. Try again."; }
    });
}

function hide() { if (sizer) { sizer.disconnect(); sizer = null; } if (box) { box.remove(); box = null; } keyShown = null; }
function skip() { dismissed.add(S.curKey); hide(); }

/** Shows the picker over an empty page (and only then); called whenever the page or its content changes. */
export function syncLayoutPicker() {
    const want = S.mode === "edit" && config.ui.panels !== false && model.markup.trim() === "" && !dismissed.has(S.curKey);
    if (!want) return hide();
    if (box && keyShown === S.curKey) return;
    hide();
    keyShown = S.curKey;
    build();
}

/** Registers this part's listeners (called once by editor.js). */
export function init() {
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box) { e.preventDefault(); skip(); } });
}
