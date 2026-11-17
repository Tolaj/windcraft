import { config } from "../config.js";
import { host } from "../host.js";
import { $, S, esc, model } from "./base.js";
import { addToEmpty, addSource } from "./add-menu.js";
import { cmd } from "./frame-messages.js";
import { stillDocument } from "./docs.js";
import { curWidth } from "./plane.js";
import { screenHeightFor, parseComponentSource, buildPreviewDocument } from "../../playground/component-source.js";
import { fillClasses, isSlot } from "../../../core/slot-fill.js";
import { KIND_NAMES, LAYOUTS, SECTIONS, wireframe } from "../../../core/wireframes.js";
export { LAYOUTS, SECTIONS };

// ── Wireframes: blank page and section skeletons to start from ───────────────────────────────────────────────────
// The Properties panel's "Add a wireframe" opens one browser of them, the same for the page and for a selected box (blank regions in
// two greys, no placeholder words; they and their endless generator live in core/wireframes.js). A pick is plain Tailwind HTML put in
// like anything pasted, so it is edited, dragged and undone like the rest. An empty page gets a tip pointing at the button.

/** A page wireframe put inside a box: as tall as a good part of a screen, not the whole screen (min-h-screen in a section would be). */
const inBox = (html) => html.replace(/\bmin-h-screen\b/g, "min-h-[32rem]");

const dismissed = new Set(); // pages where the tip was dismissed: it stays away from them
let box = null, keyShown = null, sizer = null, onEsc = null, cleanup = null;
const chosenMode = { slot: null, box: null }; // where the person last chose to put a pick, for a slot and for a box

// ── Previews: what the pick will really be ────────────────────────────────────────────────────────────────────────────
// A tile is not the wireframe drawn with the editor's own styles (those follow the editor window's width, not the page's, and have
// neither the project's theme nor the page's CSS): it is measured in a hidden copy of the page, styled as the canvas styles it, at the
// page's width and on its screen, put exactly where the pick would go (inside the selected box, or at the end of the page), and then
// drawn from those measurements. What the tile shows is what lands on the canvas.
let probe = null; // { frame, ready } while the browser is open

function openProbe() {
    closeProbe();
    const w = curWidth(), f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    // the page's screen: a min-h-screen is as tall here as on the canvas (plane.js deviceHeight, component-source.js screenHeightFor)
    f.style.cssText = `position:fixed;left:-30000px;top:0;width:${w}px;height:${screenHeightFor(w)}px;border:0;visibility:hidden;pointer-events:none;`;
    f.srcdoc = stillDocument();
    const ready = new Promise((r) => { f.addEventListener("load", () => r(), { once: true }); setTimeout(r, 8000); });
    document.body.appendChild(f);
    probe = { frame: f, ready, w };
}
function closeProbe() { if (probe) { probe.frame.remove(); probe = null; } }

/** Until the page's Tailwind has written the styles for what was just added (its stylesheet stops changing), at most ~1s. */
async function stylesSettled(doc) {
    const size = () => [...doc.querySelectorAll("style")].reduce((n, st) => n + st.textContent.length, 0);
    let last = -1, same = 0;
    for (let i = 0; i < 50 && same < 2; i++) {
        await new Promise((r) => setTimeout(r, 20));
        const now = size();
        same = now === last ? same + 1 : 0;
        last = now;
    }
}

/** Each wireframe's boxes where it would land: [{ w, h, boxes: [[x, y, w, h, css]] }], in the order given. */
async function measure(list, into) {
    const p = probe;
    if (!p) return [];
    await p.ready;
    const doc = p.frame.contentDocument;
    if (!doc || !doc.body || probe !== p) return [];
    const target = into ? into.path.reduce((el, i) => el && el.children[i], doc.body) : doc.body;
    if (!target) return [];
    // all of them first, out of the page, so its Tailwind writes their styles in one go
    const stage = doc.createElement("div");
    stage.hidden = true;
    stage.innerHTML = list.join("");
    doc.documentElement.appendChild(stage);
    await stylesSettled(doc);
    if (probe !== p || !doc.defaultView) return []; // the browser closed meanwhile (a pick): its copy of the page is gone
    const out = [...stage.children].map((n) => {
        target.appendChild(n); // one at a time, exactly where the pick goes: alone, as it will be
        const o = n.getBoundingClientRect(), boxes = [];
        [n, ...n.querySelectorAll("*")].forEach((el) => {
            const r = el.getBoundingClientRect(), cs = doc.defaultView.getComputedStyle(el);
            if (!r.width || !r.height || cs.visibility === "hidden") return;
            const bg = cs.backgroundColor, bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
            const painted = (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) || bw.some((b) => parseFloat(b) > 0);
            if (!painted) return; // only what shows: a plain wrapper draws nothing
            boxes.push([r.left - o.left, r.top - o.top, r.width, r.height,
                `background:${bg};border-style:${cs.borderTopStyle} ${cs.borderRightStyle} ${cs.borderBottomStyle} ${cs.borderLeftStyle};border-width:${bw.join(" ")};border-color:${cs.borderTopColor} ${cs.borderRightColor} ${cs.borderBottomColor} ${cs.borderLeftColor};border-radius:${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius};`]);
        });
        n.remove();
        return { w: o.width, h: o.height, boxes };
    });
    stage.remove();
    return out;
}

/** A tile: an empty preview the measurements fill in (paint), and its name. Its shape is the page's screen. */
function tile(id, name) {
    const w = probe ? probe.w : 1280;
    return `<button type="button" data-layout="${esc(id)}" class="group text-left">
        <div class="relative overflow-hidden rounded-lg border border-neutral-200 bg-white transition group-hover:border-neutral-900" style="aspect-ratio:${w} / ${screenHeightFor(w)}"><div data-shrink class="pointer-events-none absolute left-0 top-0 origin-top-left"></div></div>
        <div class="mt-1.5 truncate text-xs text-neutral-600 group-hover:text-neutral-900" title="${esc(name)}">${esc(name)}</div>
    </button>`;
}
/** The full-preview icon in a tile's corner (it shows on hover or focus): it opens the design or layout large, over the dialog. */
const EXPAND = `<span role="button" tabindex="0" data-expand aria-label="Full preview" title="Full preview" class="absolute right-1.5 top-1.5 z-[1] flex h-6 w-6 items-center justify-center rounded-md border border-neutral-200 bg-white/90 text-neutral-600 opacity-0 transition hover:text-neutral-900 group-hover:opacity-100 focus-visible:opacity-100"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>`;
/** Draws a measured wireframe into its tile. */
function paint(t, m) {
    const f = t && t.querySelector("[data-shrink]");
    if (!f || !m) return;
    if (!f.parentElement.querySelector("[data-expand]")) f.parentElement.insertAdjacentHTML("beforeend", EXPAND); // a layout can be seen large once it is drawn
    f.dataset.w = String(m.w);
    f.style.width = `${m.w}px`;
    f.style.height = `${m.h}px`;
    f.innerHTML = m.boxes.map(([x, y, w, h, css]) => `<div style="position:absolute;box-sizing:border-box;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}"></div>`).join("");
}
/** Shrinks each preview to its tile, whole width in view; a short one (a section) sits in the middle of its tile rather than at the top. */
function fitTiles(node) {
    node.querySelectorAll("[data-shrink][data-w]").forEach((f) => {
        const w = f.parentElement.clientWidth, h = f.parentElement.clientHeight;
        if (!w) return;
        const k = w / Math.max(1, parseFloat(f.dataset.w)), tall = f.offsetHeight;
        f.style.transform = `translateY(${Math.max(0, (h - tall * k) / 2)}px) scale(${k})`;
    });
}

let watcher = null; // the endless list's "more as you scroll" observer
function hide() { if (cleanup) { cleanup(); cleanup = null; } if (watcher) { watcher.disconnect(); watcher = null; } if (sizer) { sizer.disconnect(); sizer = null; } if (box) { box.remove(); box = null; } closeProbe(); keyShown = null; onEsc = null; }
function skip() { dismissed.add(S.curKey); hide(); }

/**
 * The wireframe browser: every wireframe, endless. The hand-picked ones lead, then the generator's (core/wireframes.js), twelve more
 * each time the end of the list comes into view, repeats skipped, filtered by kind with the chips.
 *   o.into    the selected element ({ path, tag }) a pick goes inside, or null for the page
 *   o.modal   a dialog over a dimmed canvas (the Properties panel's), or a card that leaves the canvas usable
 *   o.onPick(html), o.onClose()
 */
function browse(o) {
    hide();
    const into = o.into && o.into.path && o.into.path.length ? o.into : null;
    const fitIn = (html) => (into ? inBox(html) : html);
    box = document.createElement("div");
    box.id = "layoutPicker";
    box.dataset.modal = o.modal ? "1" : "";
    // a dialog sits over the canvas toolbars too; the empty page's card under them, so they stay usable
    box.className = o.modal ? "absolute inset-0 z-[60] flex items-center justify-center bg-black/10 p-6" : "pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-6 pb-6 pt-20";
    const chips = [["all", "All"], ...Object.entries(KIND_NAMES)];
    box.innerHTML = `<style>@keyframes wcShow{to{opacity:1}}</style><div data-card style="min-height:min(34rem,100%)" class="pointer-events-auto relative flex max-h-full w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_12px_48px_rgba(0,0,0,.18)]">
        <div class="flex items-center justify-between gap-4 px-5 pt-5"><h2 class="truncate text-[15px] font-semibold text-neutral-900">${esc(o.title)}</h2>
            <button type="button" data-skip class="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">${esc(o.closeLabel || "Close")}</button></div>
        ${o.gallery || into ? `<div class="flex flex-wrap items-center justify-between gap-2 px-5 pt-3">
            ${o.gallery ? `<div data-sources role="tablist" class="inline-flex rounded-lg border border-neutral-200 p-0.5 text-xs">
                <button type="button" role="tab" data-source="wire" class="rounded-md px-3 py-1 font-medium">Layouts</button>
                <button type="button" role="tab" data-source="gallery" class="rounded-md px-3 py-1 font-medium">Designs</button></div>` : "<span></span>"}
            ${into ? `<div data-puts role="radiogroup" aria-label="Where it goes" class="inline-flex items-center gap-1.5 text-xs text-neutral-500"><span>Put it</span>
                <span class="inline-flex rounded-lg border border-neutral-200 p-0.5">${[["replace", "Replace selected"], ["inside", "Add inside"], ["after", "Add after"]].map(([m, l]) => `<button type="button" role="radio" data-put="${m}" class="rounded-md px-2.5 py-1 font-medium">${l}</button>`).join("")}</span></div>` : ""}
        </div>` : ""}
        <div data-chips class="flex flex-wrap gap-1.5 px-5 pb-3 pt-3">${chips.map(([k, l]) => `<button type="button" data-kind="${k}" class="rounded-full border px-3 py-1 text-xs">${esc(l)}</button>`).join("")}</div>
        <div data-scroll class="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100 px-5 pb-5 pt-4"><div data-grid class="grid grid-cols-4 gap-3"></div>
            <p data-more class="py-6 text-center text-xs text-neutral-400">Loading more…</p></div>
        <div data-gctl class="hidden flex-wrap items-center gap-2 px-5 pb-3 pt-3">
            <input data-gq type="search" placeholder="Search designs" aria-label="Search designs" class="h-8 w-48 rounded-md border border-neutral-200 px-2.5 text-xs focus:border-neutral-900 focus:outline-none">
            <span data-gkinds class="inline-flex gap-1.5">${[["component", "Components"], ["page", "Pages"], ["all", "All"]].map(([k, l]) => `<button type="button" data-gkind="${k}" class="rounded-full border px-3 py-1 text-xs">${l}</button>`).join("")}</span>
            <select data-gcat aria-label="Category" class="h-8 rounded-md border border-neutral-200 px-2 text-xs"><option value="">All categories</option>${(config.data.categories || []).map((g) => `<optgroup label="${esc(g.group)}">${g.items.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join("")}</optgroup>`).join("")}</select>
            <select data-gsort aria-label="Sort" class="h-8 rounded-md border border-neutral-200 px-2 text-xs"><option value="new">Newest</option><option value="liked">Most liked</option></select>
        </div>
        <div data-gscroll class="hidden min-h-0 flex-1 overflow-y-auto border-t border-neutral-100 px-5 pb-5 pt-4"><div data-ggrid class="grid grid-cols-3 gap-3"></div>
            <p data-gmore class="py-6 text-center text-xs text-neutral-400">Loading…</p></div>
    </div>`;
    $("canvas").appendChild(box);
    const card = box.querySelector("[data-card]"), grid = box.querySelector("[data-grid]"), more = box.querySelector("[data-more]"), scroller = box.querySelector("[data-scroll]");
    const items = new Map(), meas = new Map(); // meas: each drawn layout's measured boxes (for its full preview)
    let xview = null, xro = null; // the full preview open over the dialog, and what watches its size
    let kind = "all", n = 0, seen = new Set(), done = false;
    // where a pick goes: a slot of a wireframe is replaced, a box is added to (the choice is remembered, per kind of target, in this editor session)
    const slot = Boolean(into && isSlot(into)), puts = box.querySelectorAll("[data-put]");
    let mode = into ? (chosenMode[slot ? "slot" : "box"] || (slot ? "replace" : "inside")) : "inside";
    const paintPuts = () => puts.forEach((b) => { const on = b.dataset.put === mode; b.setAttribute("aria-checked", String(on)); b.className = `rounded-md px-2.5 py-1 font-medium ${on ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`; });
    paintPuts();
    // the Gallery tab: published designs from the app, a dozen at a time, drawn only while in view
    const gctl = box.querySelector("[data-gctl]"), gscroll = box.querySelector("[data-gscroll]"), ggrid = box.querySelector("[data-ggrid]"), gmore = box.querySelector("[data-gmore]");
    const gitems = new Map(), drawn = [], inView = new Set();
    let clock = 0;
    let source = "wire", gq = "", gkind = "component", gcat = "", gsort = "new", gpage = 0, gdone = false, gbusy = false, gseq = 0, gtimer = 0;
    const GW = curWidth(), GH = screenHeightFor(GW), MAX_DRAWN = 150;
    /** What a tile shows while its design has not drawn yet: a sketch of a page, pulsing. It appears only if the wait is longer than a blink (0.3 s): a design that draws at once shows no sketch at all. */
    const sketch = () => `<div class="h-full animate-pulse bg-neutral-50 p-3"><div class="h-1.5 w-1/3 rounded bg-neutral-200"></div><div class="mt-3 h-3 w-3/4 rounded bg-neutral-200"></div><div class="mt-2 h-2 w-2/3 rounded bg-neutral-200"></div><div class="mt-4 flex gap-2"><div class="h-5 w-16 rounded bg-neutral-200"></div><div class="h-5 w-16 rounded bg-neutral-100"></div></div><div class="mt-4 h-10 rounded bg-neutral-100"></div></div>`;
    const LATE = "opacity:0;animation:wcShow 0s linear .3s forwards";
    const skel = () => `<div data-skel class="absolute inset-0" style="${LATE}" aria-hidden="true">${sketch()}</div>`;
    /** Placeholder tiles while a dozen designs are on their way (also only if they take longer than a blink). */
    const placeholders = (n) => Array.from({ length: n }, () => `<div data-gph aria-hidden="true" style="${LATE}"><div class="relative overflow-hidden rounded-lg border border-neutral-200 bg-white" style="aspect-ratio:${GW} / ${GH}"><div class="absolute inset-0">${sketch()}</div></div><div class="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-neutral-100"></div></div>`).join("");
    const gtile = (it) => `<button type="button" data-gid="${esc(it.id)}" class="group text-left"><div data-gprev class="relative overflow-hidden rounded-lg border border-neutral-200 bg-white transition group-hover:border-neutral-900" style="aspect-ratio:${GW} / ${GH}">${skel()}${EXPAND}</div>
        <div class="mt-1.5 flex items-center justify-between gap-2 text-xs"><span class="truncate font-medium text-neutral-800" title="${esc(it.title)}">${esc(it.title)}</span><span class="shrink-0 text-neutral-400" title="Author">${esc(it.author)}</span></div></button>`;
    /** A design's iframe is shown, and its sketch goes, only when the design has been styled (it says so itself: see centered()). */
    const reveal = (f) => { f.style.opacity = "1"; const sk = f.parentElement && f.parentElement.querySelector("[data-skel]"); if (sk) sk.remove(); };
    /**
     * The design as it looks once styled, as plain HTML with no scripts: Tailwind runs once per design (that is the slow, heavy part), and
     * from then on the tile shows this static copy. It costs next to nothing, and drawing it again (a tile that came back into view) is instant:
     * nothing is blank, nothing unstyled, nothing to wait for.
     */
    const staticFrame = (html, title, k, w = GW, h = GH) => {
        const f = document.createElement("iframe");
        f.setAttribute("sandbox", ""); // no scripts at all
        f.tabIndex = -1;
        f.title = title;
        f.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;border:0;transform-origin:0 0;transform:scale(${k});pointer-events:none;background:#fff;opacity:0;transition:opacity .25s`;
        f.srcdoc = html;
        f.addEventListener("load", () => reveal(f), { once: true });
        return f;
    };
    const onReady = (e) => {
        if (!e.data || e.data.type !== "wc-tile-ready") return;
        const f = [...box.querySelectorAll("iframe")].find((x) => x.contentWindow === e.source);
        if (!f) return;
        f.dataset.styled = e.data.styled ? "1" : "0";
        reveal(f);
        if (f.release) f.release(); // the next design in the queue may start
        const prev = f.parentElement, tileBtn = prev && prev.parentElement, it = tileBtn && tileBtn.dataset && gitems.get(tileBtn.dataset.gid);
        if (it && e.data.styled && e.data.html && !it.frozen) it.frozen = e.data.html; // only a page that has really been styled is kept
        if (it && it.frozen && prev.hasAttribute("data-gprev")) { // the live one gives way to the static copy
            const sf = staticFrame(it.frozen, it.title, (prev.clientWidth || 200) / GW);
            sf.addEventListener("load", () => f.remove(), { once: true });
            prev.insertBefore(sf, f);
        }
    };
    window.addEventListener("message", onReady);
    // Tailwind styles a design in its own page, and that takes the processor: a dozen at once would starve one another and none would finish for
    // a long time. So at most LIVE_AT_ONCE are styled together, in the order they came into view (a tile that left the view meanwhile is skipped).
    const LIVE_AT_ONCE = 4, queue = [];
    let running = 0;
    const pump = () => {
        while (running < LIVE_AT_ONCE && queue.length) {
            const prev = queue.shift();
            delete prev.dataset.queued;
            if (!prev.isConnected || prev.dataset.drawn || !inView.has(prev)) continue; // gone, drawn already, or out of view: not now
            startLive(prev);
        }
    };
    const startLive = (prev) => {
        const it = gitems.get(prev.parentElement.dataset.gid);
        if (!it) return;
        const f = document.createElement("iframe");
        f.setAttribute("sandbox", "allow-scripts");
        f.tabIndex = -1;
        f.title = it.title;
        f.style.cssText = `position:absolute;left:0;top:0;width:${GW}px;height:${GH}px;border:0;transform-origin:0 0;transform:scale(${(prev.clientWidth || 200) / GW});pointer-events:none;background:#fff;opacity:0;transition:opacity .25s`;
        const parsed = parseComponentSource(it.html);
        parsed.markup = centered(parsed.markup);
        f.srcdoc = buildPreviewDocument(parsed, { width: GW, fixedScreen: true, still: true });
        running++;
        let released = false;
        f.release = () => { if (released) return; released = true; running = Math.max(0, running - 1); pump(); };
        setTimeout(() => { if (f.isConnected) { reveal(f); f.release(); } }, 30000); // the page never answered: show what there is, and free the place
        prev.appendChild(f);
        prev.dataset.drawn = "1";
        track(prev);
    };
    /** Keeps count of the drawn tiles; past MAX_DRAWN, the one seen longest ago that is not in view goes (and comes back as its static copy, or in the queue). */
    const track = (prev) => {
        drawn.push(prev);
        if (drawn.length > MAX_DRAWN) {
            const gone = drawn.filter((x) => !inView.has(x)).sort((x, y) => Number(x.dataset.seen || 0) - Number(y.dataset.seen || 0))[0];
            if (gone) { const f = gone.querySelector("iframe"); if (f && f.release) f.release(); drawn.splice(drawn.indexOf(gone), 1); gone.innerHTML = skel() + EXPAND; delete gone.dataset.drawn; }
        }
    };
    /** Draws a design into its tile (once). A static copy is instant; a design not styled yet waits its turn in the queue. */
    const draw = (prev) => {
        if (prev.dataset.drawn || prev.dataset.queued || !box) return;
        const it = gitems.get(prev.parentElement.dataset.gid);
        if (!it) return;
        if (it.frozen) {
            const f = staticFrame(it.frozen, it.title, (prev.clientWidth || 200) / GW);
            setTimeout(() => { if (f.isConnected) reveal(f); }, 12000);
            prev.appendChild(f);
            prev.dataset.drawn = "1";
            track(prev);
        } else {
            prev.dataset.queued = "1";
            queue.push(prev);
            pump();
        }
    };
    const gseen = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { inView.add(e.target); e.target.dataset.seen = String(++clock); draw(e.target); } else inView.delete(e.target);
    }), { root: gscroll, rootMargin: "300px" });
    const refit = () => ggrid.querySelectorAll("[data-gprev] iframe").forEach((f) => { f.style.transform = `scale(${(f.parentElement.clientWidth || 200) / GW})`; });
    /** The next dozen for the search as it is now; a new search starts over (an answer that arrives for an old one is dropped). */
    async function gload(reset) {
        if (reset) { gseq++; gpage = 0; gdone = false; gbusy = false; gitems.clear(); drawn.length = 0; queue.length = 0; running = 0; inView.clear(); ggrid.innerHTML = ""; gscroll.scrollTop = 0; gmore.textContent = "Loading…"; }
        if (gdone || gbusy || !box) return;
        gbusy = true;
        const mine = gseq;
        ggrid.insertAdjacentHTML("beforeend", placeholders(gpage ? 3 : 6)); // sketches of the designs on their way
        try {
            const r = await host.listGallery({ q: gq, category: gcat, kind: gkind === "all" ? "" : gkind, sort: gsort, page: gpage + 1 });
            if (mine !== gseq || !box) return;
            ggrid.querySelectorAll("[data-gph]").forEach((x) => x.remove());
            gpage = r.page;
            r.items.forEach((it) => { gitems.set(it.id, it); ggrid.insertAdjacentHTML("beforeend", gtile(it)); gseen.observe(ggrid.lastElementChild.querySelector("[data-gprev]")); });
            gdone = !r.hasMore;
            gmore.textContent = !gitems.size ? "No design matches." : gdone ? "That's all." : "Loading more…";
        } catch (err) {
            if (mine !== gseq) return;
            ggrid.querySelectorAll("[data-gph]").forEach((x) => x.remove());
            gdone = true;
            gmore.textContent = `${err.message || "Could not load the gallery"}. Close this and open it again to retry.`;
        } finally { if (mine === gseq) gbusy = false; }
        // still room below (a short list, a tall window): fill it
        requestAnimationFrame(() => { if (!gdone && box && source === "gallery" && gmore.getBoundingClientRect().top < gscroll.getBoundingClientRect().bottom + 300) gload(false); });
    }
    const paintG = () => {
        box.querySelectorAll("[data-gkind]").forEach((c) => { const on = c.dataset.gkind === gkind; c.className = `rounded-full border px-3 py-1 text-xs ${on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`; });
    };
    function setSource(next) {
        source = next;
        box.querySelectorAll("[data-source]").forEach((b) => { const on = b.dataset.source === source; b.setAttribute("aria-selected", String(on)); b.className = `rounded-md px-3 py-1 font-medium ${on ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`; });
        const g = source === "gallery";
        box.querySelector("[data-chips]").classList.toggle("hidden", g);
        scroller.classList.toggle("hidden", g);
        gctl.classList.toggle("hidden", !g); gctl.classList.toggle("flex", g);
        gscroll.classList.toggle("hidden", !g);
        if (g) { paintG(); if (!gitems.size && !gbusy && !gdone) gload(true); requestAnimationFrame(refit); }
    }
    openProbe();
    let pending = [], painting = false, gen = 0;
    /** Measures the tiles added since the last time, in the copy of the page, and draws them. */
    async function paintPending() {
        if (painting) return;
        painting = true;
        while (pending.length && box) {
            const batch = pending.splice(0, 12), g = gen;
            const ms = await measure(batch.map((id) => items.get(id)), into);
            if (g !== gen || !box) continue; // the list was refiltered meanwhile
            batch.forEach((id, i) => { if (ms[i]) meas.set(id, ms[i]); paint(grid.querySelector(`[data-layout="${CSS.escape(id)}"]`), ms[i]); });
            fitTiles(grid);
        }
        painting = false;
    }
    const add = (id, name, html) => { items.set(id, html); grid.insertAdjacentHTML("beforeend", tile(id, name)); pending.push(id); };
    /** The next dozen of this kind; repeats are skipped, and a kind with no new ones left says so. */
    function loadMore() {
        if (done || !box) return;
        let added = 0, tries = 0;
        while (added < 12 && tries < 240) {
            const w = wireframe(kind, n++);
            tries++;
            if (seen.has(w.html)) continue;
            seen.add(w.html);
            add(w.id, w.name, fitIn(w.html));
            added++;
        }
        if (added < 12) { done = true; more.textContent = kind === "all" ? "That's all for now." : `That's every ${KIND_NAMES[kind]} wireframe.`; }
        paintPending();
        // still room below (a short list, a tall window): fill it, the end of the list must be out of view to wait for a scroll
        requestAnimationFrame(() => { if (!done && box && more.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom + 400) loadMore(); });
    }
    function show(k) {
        kind = k; n = 0; seen = new Set(); done = false; items.clear(); grid.innerHTML = ""; pending = []; gen++; more.textContent = "Loading more…";
        box.querySelectorAll("[data-kind]").forEach((c) => { c.className = `rounded-full border px-3 py-1 text-xs ${c.dataset.kind === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`; });
        const picked = (list) => list.forEach(([id, name, html]) => { seen.add(html); add(`pick-${id}`, name, fitIn(html)); });
        // the hand-picked ones lead the list, the same for a box and for the page
        if (k === "all") picked([...SECTIONS, ...LAYOUTS]);
        if (k === "pages") picked(LAYOUTS);
        scroller.scrollTop = 0;
        loadMore();
    }
    watcher = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) loadMore(); }, { root: scroller, rootMargin: "400px" });
    watcher.observe(more);
    sizer = new ResizeObserver(() => { fitTiles(grid); refit(); });
    sizer.observe(grid);
    sizer.observe(ggrid);
    const gwatch = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) gload(false); }, { root: gscroll, rootMargin: "400px" });
    gwatch.observe(gmore);
    cleanup = () => { gwatch.disconnect(); gseen.disconnect(); clearTimeout(gtimer); window.removeEventListener("message", onReady); queue.length = 0; if (xro) xro.disconnect(); };
    onEsc = o.onClose;
    // the canvas pans and zooms with the wheel and the pointer: not under the browser
    ["wheel", "pointerdown"].forEach((t) => (o.modal ? box : card).addEventListener(t, (e) => e.stopPropagation()));
    if (o.modal) box.addEventListener("click", (e) => { if (!card.contains(e.target)) o.onClose(); });
    /** Puts a layout or a design in the page, where the choice says (also from the full preview). */
    function choose(id, isDesign) {
        if (isDesign) {
            const it = gitems.get(id);
            if (!it) return;
            hide();
            return o.onPick(designMarkup(it.html), { mode, from: { id: it.id, title: it.title, author: it.author }, ownConfig: Boolean(it.twConfig) || /tailwind\.config\s*=/.test(it.html) });
        }
        const html = items.get(id);
        if (!html) return;
        hide();
        o.onPick(html, { mode });
    }
    const MODE_LABEL = { replace: "Replace selected", inside: "Add inside", after: "Add after" };
    function closeX() {
        if (xro) { xro.disconnect(); xro = null; }
        if (xview) { xview.remove(); xview = null; }
        onEsc = o.onClose;
    }
    /** A design or a layout large, over the whole dialog: its real preview, with a button to use it. Escape or Back returns to the list. */
    function openX(tileEl) {
        if (!tileEl) return;
        const isDesign = Boolean(tileEl.dataset.gid), id = isDesign ? tileEl.dataset.gid : tileEl.dataset.layout;
        const it = isDesign ? gitems.get(id) : null, m = isDesign ? null : meas.get(id);
        if (!it && !m) return;
        closeX();
        const title = isDesign ? it.title : (tileEl.querySelector(".truncate") || {}).textContent || "Layout";
        xview = document.createElement("div");
        xview.className = "absolute inset-0 z-10 flex flex-col bg-white";
        xview.innerHTML = `<div class="flex items-center gap-3 border-b border-neutral-100 px-5 py-3">
            <button type="button" data-xback class="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">← Back</button>
            <div class="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900" title="${esc(title)}">${esc(title)}${isDesign ? ` <span class="font-normal text-neutral-400">by ${esc(it.author)}</span>` : ""}</div>
            <button type="button" data-xuse class="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700">${into ? MODE_LABEL[mode] : "Add to the frame"}</button></div>
            <div class="min-h-0 flex-1 bg-neutral-50 p-4"><div data-xstage class="relative h-full w-full overflow-hidden rounded-lg border border-neutral-200 bg-white"></div></div>`;
        card.appendChild(xview);
        const stage = xview.querySelector("[data-xstage]");
        let fit;
        if (isDesign) {
            let f;
            if (it.frozen) f = staticFrame(it.frozen, it.title, 1);
            else {
                f = document.createElement("iframe");
                const parsed = parseComponentSource(it.html);
                parsed.markup = centered(parsed.markup);
                f.setAttribute("sandbox", "allow-scripts");
                f.title = it.title;
                f.srcdoc = buildPreviewDocument(parsed, { width: GW, fixedScreen: true, still: true });
            }
            f.style.cssText = `position:absolute;left:0;top:0;width:${GW}px;border:0;transform-origin:0 0;background:#fff;opacity:0;transition:opacity .25s`;
            stage.insertAdjacentHTML("beforeend", skel());
            stage.appendChild(f);
            setTimeout(() => { if (f.isConnected) reveal(f); }, 30000);
            fit = () => { const W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return; const k = W / GW; f.style.transform = `scale(${k})`; f.style.height = `${H / k}px`; };
        } else {
            const holder = document.createElement("div");
            holder.setAttribute("data-shrink", "");
            holder.className = "absolute left-0 top-0 origin-top-left";
            holder.style.width = `${m.w}px`; holder.style.height = `${m.h}px`;
            holder.innerHTML = m.boxes.map(([x, y, w, h, css]) => `<div style="position:absolute;box-sizing:border-box;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${css}"></div>`).join("");
            stage.appendChild(holder);
            fit = () => { const W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return; const k = Math.min(W / m.w, H / m.h); holder.style.transform = `translate(${(W - m.w * k) / 2}px, ${(H - m.h * k) / 2}px) scale(${k})`; };
        }
        fit();
        xro = new ResizeObserver(fit);
        xro.observe(stage);
        xview.addEventListener("click", (e) => {
            e.stopPropagation(); // the button is gone from the page by the time this reaches the dialog's backdrop, which would read it as a click outside
            if (e.target.closest("[data-xback]")) return closeX();
            if (e.target.closest("[data-xuse]")) return choose(id, isDesign);
        });
        onEsc = closeX; // Escape closes the preview first, then the dialog
        xview.querySelector("[data-xuse]").focus();
    }
    card.addEventListener("click", (e) => {
        if (e.target.closest("[data-skip]")) return o.onClose();
        const ex = e.target.closest("[data-expand]");
        if (ex) { e.preventDefault(); e.stopPropagation(); return openX(ex.closest("[data-gid], [data-layout]")); }
        const src = e.target.closest("[data-source]");
        if (src) return setSource(src.dataset.source);
        const put = e.target.closest("[data-put]");
        if (put) { mode = put.dataset.put; chosenMode[slot ? "slot" : "box"] = mode; return paintPuts(); }
        const gk = e.target.closest("[data-gkind]");
        if (gk) { gkind = gk.dataset.gkind; paintG(); return gload(true); }
        const chip = e.target.closest("[data-kind]");
        if (chip) return show(chip.dataset.kind);
        const g = e.target.closest("[data-gid]");
        if (g) return choose(g.dataset.gid, true);
        const t = e.target.closest("[data-layout]");
        if (t) return choose(t.dataset.layout, false);
    });
    card.addEventListener("keydown", (e) => { // the icon is a button inside the tile's button: Enter or Space on it opens the full preview, not the pick
        const ex = e.target.closest && e.target.closest("[data-expand]");
        if (ex && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); openX(ex.closest("[data-gid], [data-layout]")); }
    });
    box.querySelector("[data-gq]").addEventListener("input", (e) => { clearTimeout(gtimer); gtimer = setTimeout(() => { gq = e.target.value.trim(); gload(true); }, 300); });
    box.querySelector("[data-gcat]").addEventListener("change", (e) => { gcat = e.target.value; gload(true); });
    box.querySelector("[data-gsort]").addEventListener("change", (e) => { gsort = e.target.value; gload(true); });
    show("all");
    setSource("wire");
}

/**
 * A design for a tile: in the middle of its preview, as the gallery shows a component. The page is a column that centres its content from top
 * to bottom; a block that turns out narrower than the screen (a card, a button) is centred across too once Tailwind has styled it, and one that
 * fills the screen (a hero, a navbar) is left as it is.
 */
const centered = (markup) => `<div data-wc-center style="box-sizing:border-box;min-height:100vh;display:flex;flex-direction:column;justify-content:center">${markup}</div><script>(function(){function f(){var w=document.querySelector("[data-wc-center]");if(!w)return;var vw=document.documentElement.clientWidth;[].forEach.call(w.children,function(e){if(/^(SCRIPT|STYLE|LINK)$/.test(e.tagName))return;var c=String(e.getAttribute("class")||"");var inl=(/^(A|BUTTON|SPAN|IMG|INPUT|LABEL|SELECT|B|I|EM|STRONG|SMALL|CODE|SVG)$/.test(e.tagName)&&!/(^|\\s)(block|flex|grid)(\\s|$)/.test(c))||/(^|\\s)inline(-block|-flex|-grid)?(\\s|$)/.test(c);if(inl){e.style.alignSelf="center";return}var r=e.getBoundingClientRect();if(r.width&&r.width<vw*0.92){e.style.marginLeft="auto";e.style.marginRight="auto"}})}var sent=false;function snap(){try{var c=document.documentElement.cloneNode(true);[].forEach.call(c.querySelectorAll("script"),function(x){x.remove()});return "<!doctype html>"+c.outerHTML}catch(e){return ""}}function done(ok){if(sent)return;sent=true;parent.postMessage({type:"wc-tile-ready",styled:!!ok,html:ok?snap():""},"*")}function styled(){var n=0,last=-1,same=0,tw=!!document.querySelector('script[src*="tailwindcss"]'),t=setInterval(function(){var len=0;[].forEach.call(document.querySelectorAll("style"),function(s){len+=s.textContent.length});same=len===last?same+1:0;last=len;n++;var made=!tw||[].some.call(document.querySelectorAll("style"),function(s){return /tailwindcss v\\d/.test(s.textContent)});var loaded=!tw||(typeof window.tailwind!=="undefined"&&made);if(loaded&&len>0&&same>=3){clearInterval(t);f();done(true)}else if(n>400){clearInterval(t);f();done(false)}},50)}addEventListener("load",function(){setTimeout(f,300);setTimeout(f,900);setTimeout(f,2000);styled()})})()<\/script>`;

/** A gallery design as what goes into a page: its body markup, with its own CSS after it (a design may carry some; its scripts are not taken). */
function designMarkup(html) {
    const p = parseComponentSource(html);
    const css = p.styles.map((st) => `<style${st.type ? ` type="${esc(st.type)}"` : ""}>${st.text.replace(/<\/style/gi, "<\\/style")}</style>`).join("\n");
    return [p.markup.trim(), css].filter(Boolean).join("\n");
}

/** A design (or a wireframe) made to take the place of a slot: its root keeps the slot's size and place in the layout; several roots are wrapped in one. */
function fitToSlot(markup, info) {
    const tpl = document.createElement("template");
    tpl.innerHTML = markup;
    const roots = [...tpl.content.children].filter((el) => !/^(STYLE|SCRIPT|LINK)$/.test(el.tagName));
    const apply = (el) => { const c = fillClasses(info.classes, el.getAttribute("class") || ""); if (c) el.setAttribute("class", c); else el.removeAttribute("class"); };
    if (roots.length === 1) apply(roots[0]);
    else if (roots.length > 1) {
        const wrap = document.createElement(/^[a-z][a-z0-9-]*$/.test(info.tag) ? info.tag : "div");
        apply(wrap);
        tpl.content.insertBefore(wrap, roots[0]);
        roots.forEach((el) => wrap.appendChild(el));
    }
    return tpl.innerHTML;
}

// ── An empty page: a tip pointing at the wireframes ─────────────────────────────────────────────────────────────────
// Instead of covering the page, an empty page gets a small tip beside the Properties panel's "Add a wireframe" button (which pulses), or
// under the panel's toolbar button while the panel is closed. It opens the wireframes itself too, and can be dismissed for the page.
let tip = null, tipTimer = 0;
/** "Don't show this again": the tip stays off on every frame, in this browser (the panel's "Add a wireframe" button still works). */
const NEVER = "wc:wireframeTip:never";
const neverTip = () => { try { return localStorage.getItem(NEVER) === "1"; } catch { return false; } };
function hideTip() {
    clearInterval(tipTimer); tipTimer = 0;
    if (tip) { tip.remove(); tip = null; }
    delete document.body.dataset.wfHint;
}
function placeTip() {
    if (!tip) return;
    const btn = document.querySelector("#inspector .wfbtn"), r = btn && btn.offsetParent ? btn.getBoundingClientRect() : null;
    const arrow = tip.querySelector("[data-arrow]");
    if (r && r.width) { // beside the button, pointing at it; below it when beside would cover the toolbar
        const w = tip.offsetWidth, h = tip.offsetHeight, side = { left: r.left - w - 14, top: Math.max(8, r.top + r.height / 2 - h / 2) };
        const bar = document.getElementById("pillR"), b = bar && bar.getBoundingClientRect();
        const covers = b && b.width && side.left < b.right && side.left + w > b.left && side.top < b.bottom && side.top + h > b.top;
        if (!covers) {
            Object.assign(tip.style, { left: `${Math.max(8, side.left)}px`, top: `${side.top}px` });
            Object.assign(arrow.style, { left: "", right: "-6px", top: "50%", transform: "translateY(-50%) rotate(45deg)" });
        } else {
            const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
            Object.assign(tip.style, { left: `${left}px`, top: `${r.bottom + 12}px` });
            Object.assign(arrow.style, { right: "", left: `${Math.min(w - 20, Math.max(8, r.left + r.width / 2 - left - 6))}px`, top: "-6px", transform: "rotate(45deg)" });
        }
        tip.querySelector("[data-say]").textContent = "Pick a layout for this empty frame.";
    } else { // the panel is closed: under its toolbar button
        const pb = document.getElementById("panelBtn"), q = pb.getBoundingClientRect();
        Object.assign(tip.style, { left: `${Math.max(8, q.right - tip.offsetWidth + 6)}px`, top: `${q.bottom + 12}px` });
        Object.assign(arrow.style, { left: "", right: "14px", top: "-6px", transform: "rotate(45deg)" });
        tip.querySelector("[data-say]").textContent = "Open the panel and select from wireframes.";
    }
}
function showTip() {
    if (tip) return placeTip();
    tip = document.createElement("div");
    tip.id = "wireframeTip";
    tip.className = "fixed z-[70] w-60 rounded-xl bg-neutral-900 p-3 text-white shadow-[0_8px_30px_rgba(0,0,0,.25)]";
    tip.innerHTML = `<span data-arrow class="absolute h-3 w-3 bg-neutral-900"></span>
        <div class="flex items-start justify-between gap-2"><p class="text-[12px] font-semibold">Start from a wireframe</p>
            <button type="button" data-x title="Dismiss" class="-mr-1 -mt-1 rounded px-1 text-neutral-400 hover:text-white">×</button></div>
        <p data-say class="mt-1 text-[11px] leading-snug text-neutral-300"></p>
        <button type="button" data-go class="mt-3 w-full rounded-md bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-900 hover:bg-neutral-100">Select from wireframes</button>
        <button type="button" data-never class="wftip-never">Don't show this again</button>`;
    document.body.appendChild(tip);
    document.body.dataset.wfHint = "1"; // the panel's button pulses (styles.css)
    tip.querySelector("[data-x]").addEventListener("click", () => { dismissed.add(S.curKey); hideTip(); });
    tip.querySelector("[data-go]").addEventListener("click", () => openWireframes(null));
    tip.querySelector("[data-never]").addEventListener("click", () => { try { localStorage.setItem(NEVER, "1"); } catch {} hideTip(); });
    placeTip();
    tipTimer = setInterval(placeTip, 250); // the panel opens, closes and scrolls: the tip follows its button
}

/** On an empty page, the tip; anywhere else, none. Called whenever the page or its content changes. */
export function syncLayoutPicker() {
    const want = S.mode === "edit" && config.ui.panels !== false && !S.canvasOnly && model.markup.trim() === "" && !dismissed.has(S.curKey) && !neverTip();
    if (want) showTip(); else hideTip();
}

// ── Putting a pick in the page ─────────────────────────────────────────────────────────────────────────────────────────────
let noteEl = null, noteTimer = 0;
/** A small note over the canvas, with buttons: what was done and the other way to do it. */
function note(text, actions = []) {
    clearTimeout(noteTimer);
    if (noteEl) noteEl.remove();
    noteEl = document.createElement("div");
    noteEl.id = "pickNote";
    noteEl.className = "pointer-events-auto absolute bottom-6 left-1/2 z-[60] flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs text-white shadow-[0_8px_30px_rgba(0,0,0,.25)]";
    noteEl.innerHTML = `<span>${esc(text)}</span>${actions.map(([label], i) => `<button type="button" data-act="${i}" class="rounded-md bg-white px-2.5 py-1 font-medium text-neutral-900 hover:bg-neutral-100">${esc(label)}</button>`).join("")}<button type="button" data-x aria-label="Dismiss" class="text-neutral-400 hover:text-white">×</button>`;
    noteEl.addEventListener("click", (e) => {
        if (e.target.closest("[data-x]")) { noteEl.remove(); noteEl = null; return; }
        const b = e.target.closest("[data-act]");
        if (b) { const f = actions[Number(b.dataset.act)][1]; noteEl.remove(); noteEl = null; f(); }
    });
    ["wheel", "pointerdown"].forEach((t) => noteEl.addEventListener(t, (e) => e.stopPropagation()));
    $("canvas").appendChild(noteEl);
    noteTimer = setTimeout(() => { if (noteEl) { noteEl.remove(); noteEl = null; } }, 10000);
}

const OTHER = { replace: ["inside", "Add inside instead"], inside: ["replace", "Replace instead"] };
/** The slot as it was (its tag, its classes and attributes), with `html` inside it: what "Add inside instead" turns a replaced slot into. */
const slotWith = (into, html) => {
    const attrs = Object.entries(into.attrs || {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    return `<${into.tag} class="${esc(into.classes || "")}"${attrs}>${html}</${into.tag}>`;
};
/**
 * Puts a pick where `how.mode` says: replace the selected element (a wireframe's slot keeps its size and place in the layout), add inside it,
 * or add after it; with nothing selected, at the end of the page (or in an empty page). One undo step. A note offers the other way.
 */
function place(html, how, into, again = false) {
    const mode = into ? how.mode || "inside" : "inside";
    if (!into) {
        if (model.markup.trim() === "") addToEmpty(html);
        else cmd({ cmd: "insert", path: [], html, position: "inside" });
    } else if (mode === "replace") {
        cmd({ cmd: "fill", path: into.path, html: isSlot(into) ? fitToSlot(html, into) : html });
    } else {
        cmd({ cmd: "insert", path: into.path, html, position: mode === "after" ? "after" : "inside" });
    }
    if (how.from) addSource(how.from);
    const actions = [];
    if (into && OTHER[mode] && !again) {
        const [next, label] = OTHER[mode];
        // the other way, straight from here (a second step: undo twice to get back to before the pick)
        actions.push([label, () => {
            const html2 = next === "inside" ? slotWith(into, html) : isSlot(into) ? fitToSlot(html, into) : html;
            cmd({ cmd: "fill", path: into.path, html: html2 });
            if (how.from) addSource(how.from);
            note(next === "inside" ? "Added inside it." : "Replaced it.");
        }]);
    }
    if (how.from || actions.length) {
        const parts = [mode === "replace" ? "Replaced it" : mode === "after" ? "Added after it" : into ? "Added inside it" : "Added"];
        if (how.ownConfig) parts.push("this design brings its own Tailwind config, so colours may differ from your theme");
        note(parts.join(". ") + ".", actions);
    }
}

/**
 * The wireframe browser as a popup, from the Properties panel: `target` is the selected element ({ path, tag, classes, kids, ownText }) or
 * null for the page. A pick goes where the choice in the popup says (replace the selected element, inside it, or after it) or at the end of
 * the page (or fills it when it is empty). One undo step.
 */
export function openWireframes(target) {
    hideTip();
    const into = target && target.path && target.path.length ? target : null;
    browse({
        title: into ? `Add to this ${into.tag}` : "Add to the frame", modal: true, into, gallery: typeof host.listGallery === "function", onClose: hide,
        onPick: (html, how = {}) => place(html, how, into),
    });
}

/** Registers this part's listeners (called once by editor.js). */
export function init() {
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box && onEsc) { e.preventDefault(); onEsc(); } });
}
