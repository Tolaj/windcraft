// Runs INSIDE the sandboxed preview iframe (stringified via Function.toString).
// Everything it needs must be defined within agentMain. The sandbox has no same-origin access,
// so all communication with the editor is postMessage.
export function agentMain() {
    const root = document.documentElement;
    const post = (m) => parent.postMessage({ ...m, load: window.__wcLoad }, "*");
    const BLUE = "#111";
    const RED = "#f24822";

    // ── Overlay (selection boxes, handles, guides). Lives outside <body>, never saved. ──────────
    const mk = (css) => { const d = document.createElement("div"); d.style.cssText = css; return d; };
    const overlay = mk("position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;");
    const hoverBox = mk(`position:absolute;border:1px solid ${BLUE};box-shadow:0 0 0 1px rgba(255,255,255,.7);background:rgba(0,0,0,.04);pointer-events:none;display:none;box-sizing:border-box;`);
    const guideLayer = mk("position:absolute;left:0;top:0;");
    const draftBox = mk(`position:absolute;border:1px solid ${BLUE};box-shadow:0 0 0 1px rgba(255,255,255,.7);background:rgba(0,0,0,.05);display:none;box-sizing:border-box;`);
    const marqueeBox = mk(`position:absolute;border:1px solid ${BLUE};box-shadow:0 0 0 1px rgba(255,255,255,.7);background:rgba(0,0,0,.06);display:none;box-sizing:border-box;`);
    const insertLine = mk(`position:absolute;background:${BLUE};box-shadow:0 0 0 1px rgba(255,255,255,.8);display:none;pointer-events:none;`);
    // while an element is dragged through the page flow: the box that follows the pointer, the container it would land in, and a short note
    const RIM = "box-shadow:0 0 0 1px rgba(255,255,255,.75);";
    const ghostBox = mk(`position:absolute;border:1px dashed ${BLUE};${RIM}background:rgba(0,0,0,.05);display:none;pointer-events:none;box-sizing:border-box;`);
    const dropBox = mk(`position:absolute;border:1.5px solid ${BLUE};${RIM}background:rgba(0,0,0,.035);display:none;pointer-events:none;box-sizing:border-box;`);
    const dropHint = mk(`position:absolute;display:none;pointer-events:none;background:${BLUE};color:#fff;font:500 11px/1 system-ui,sans-serif;white-space:nowrap;border-radius:4px;`);
    // the dashed boxes of what the selection holds are drawn in the inverse of whatever is under them (white, difference), so they show on dark
    // pictures and light pages alike. A blend only reaches the page from outside the overlay, which is a layer of its own: this one sits beside it.
    // The blend is on the layer itself: it is a stacking context of its own (its z-index), so a dash inside it blending on its own would only
    // see the empty layer and stay white everywhere. The layer as a whole is inverted against the page: black dashes on light, white on dark.
    const kidLayer = mk("position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none;mix-blend-mode:difference;");
    const gapLayer = mk("position:absolute;left:0;top:0;"); // gap and padding handles of the selected box
    overlay.append(hoverBox, gapLayer, guideLayer, draftBox, marqueeBox, ghostBox, dropBox, insertLine, dropHint);
    const isOverlay = (n) => overlay.contains(n) || kidLayer.contains(n);
    /**
     * The frame is scaled with the canvas, so a 1px line here is 8px thick at 800%: the boxes the frame draws itself keep one screen pixel.
     * Not with borders: the browser never draws a border thinner than one device pixel, so a 0.125px border comes back as 1px and is
     * magnified again. Solid lines are an inset shadow and dashes a gradient along each edge, which keep any fractional size.
     */
    const dashes = (color, one) => {
        const d = `${4 * one}px`, g = (dir) => `repeating-linear-gradient(${dir}, ${color} 0 ${d}, transparent ${d} calc(${d} * 2))`;
        return { backgroundImage: [g("90deg"), g("90deg"), g("180deg"), g("180deg")].join(","), backgroundSize: `100% ${one}px, 100% ${one}px, ${one}px 100%, ${one}px 100%`, backgroundPosition: "0 0, 0 100%, 0 0, 100% 0", backgroundRepeat: "no-repeat" };
    };
    function lineWidths() {
        const one = 1 / (zoom || 1), rim = `0 0 0 ${one}px rgba(255,255,255,.75)`;
        [hoverBox, draftBox, marqueeBox].forEach((b) => { b.style.border = "none"; b.style.boxShadow = `inset 0 0 0 ${one}px ${BLUE}, ${rim}`; });
        dropBox.style.border = "none"; dropBox.style.boxShadow = `inset 0 0 0 ${1.5 * one}px ${BLUE}, ${rim}`;
        ghostBox.style.border = "none"; Object.assign(ghostBox.style, dashes(BLUE, one), { boxShadow: rim, backgroundColor: "rgba(0,0,0,.05)" });
        insertLine.style.boxShadow = `0 0 0 ${one}px rgba(255,255,255,.8)`;
    }
    root.appendChild(kidLayer);
    root.appendChild(overlay);

    // In the editor the cursor belongs to the active tool, never to the design: a button's own cursor:pointer would show a
    // pointing hand over it. Everything inherits the cursor set on <html> (arrow, grab, crosshair...); text being typed keeps its I-beam.
    const cursorStyle = document.createElement("style");
    cursorStyle.setAttribute("data-wc-agent-style", "");
    cursorStyle.textContent = "html, body { overscroll-behavior: none; } html * { cursor: inherit !important; } [contenteditable=true], [contenteditable=true] * { cursor: text !important; }";
    document.head.appendChild(cursorStyle);
    root.style.cursor = "default"; // the Move tool is active from the start
    // While editing, nothing animates. Reading where a value comes from switches stylesheets off and on for an instant, and every
    // element with a transition (transition-all is common) would animate from its unstyled look back to its own: the page grows and
    // shrinks, the frame follows, the selection box drifts, and on a slow machine it never settles. The Interact tool is a separate,
    // live frame with its transitions. The frame never shows a scrollbar either: it follows its content's height, and a scrollbar that
    // appears for a moment takes width, which can cross a breakpoint (xl at exactly 1280) and change the layout under it.
    let previewTimer = null, previewRestore = null;
    const stillStyle = document.createElement("style");
    stillStyle.setAttribute("data-wc-agent-style", "");
    // Animations (animate-spin, animate-pulse...) are off too: editing shows the design at rest, the Interact tool shows it moving.
    // The page gets a white backdrop (what the editor shows behind it anyway; any background the design sets wins): the dashed outlines of
    // what the selection holds are drawn by inverting what is under them, and over a transparent page there is nothing to invert, so they
    // stayed white on white. Now they are black on light pages and white on dark ones.
    stillStyle.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; } html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; } :where(html) { background-color: #fff; }";
    document.head.appendChild(stillStyle);
    // Screen-sized content (min-h-screen, h-screen, 100vh) is the device's screen tall, not the frame's: the frame follows its content,
    // so two screen-tall blocks would grow it, and themselves, without end (playground/component-source.js says more; same rules).
    const screenStyle = document.createElement("style");
    screenStyle.setAttribute("data-wc-agent-style", "");
    const SCREEN_SIZED = ["h-screen", "min-h-screen", "max-h-screen", "h-dvh", "min-h-dvh", "max-h-dvh", "h-svh", "min-h-svh", "max-h-svh", "h-lvh", "min-h-lvh", "max-h-lvh", "h-[100vh]", "min-h-[100vh]", "h-[100dvh]", "min-h-[100dvh]"];
    const fitScreen = () => {
        const w = innerWidth, px = w >= 1024 ? 800 : w >= 768 ? 1024 : 844;
        screenStyle.textContent = SCREEN_SIZED.map((c) => `.${c.replace(/[[\]]/g, "\\$&")}{${c.startsWith("min-") ? "min-height" : c.startsWith("max-") ? "max-height" : "height"}:${px}px !important}`).join("");
    };
    fitScreen();
    window.addEventListener("resize", fitScreen);
    document.head.appendChild(screenStyle);
    /** Values of `props` on `el`; a transition or animation is read as the design has it, not as the still frame shows it. */
    const readStyle = (el, props) => {
        const cs = getComputedStyle(el), o = {};
        props.forEach((p) => { o[p] = cs.getPropertyValue(p); });
        const motion = props.filter((p) => p.startsWith("transition") || p.startsWith("animation"));
        if (motion.length) {
            const was = stillStyle.disabled; // a running animation preview has it off already: put it back as it was, not on
            stillStyle.disabled = true; // only the motion properties change while it is off, and nothing paints before it is back on
            const live = getComputedStyle(el);
            motion.forEach((p) => { o[p] = live.getPropertyValue(p); });
            stillStyle.disabled = was;
        }
        return o;
    };

    // ── State ───────────────────────────────────────────────────────────────────────────────
    let tool = "move";
    let zoom = 1;
    let sels = [];
    let inside = null; // the group gone into with a double-click (see pickable)
    let shownState = ""; // the state picked in the panel, shown on the selection (see showState)
    let hov = null;
    let editing = null;
    let gesture = null;
    let cssProps = [];
    // elements made in this editor session (drawn, inserted from the + menu, dropped, duplicated from one of those): they are always styled with Tailwind
    const made = new WeakSet();
    const markMade = (el) => { made.add(el); el.querySelectorAll("*").forEach((n) => made.add(n)); };
    const primary = () => sels[sels.length - 1] || null;
    const px = (n) => n / zoom;
    lineWidths(); // the frame's own lines, at the starting zoom

    const DRAW = new Set(["frame", "rect", "ellipse", "line", "arrow", "text", "image", "button"]);
    // the arrow tool's pointer: a bold dark arrow with a white edge (so it shows on any page), tip at the hot spot
    const ARROW = 'url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M21%2011%202%202l9%2019%202-8z%22%20fill%3D%22%23111%22%20stroke%3D%22%23fff%22%20stroke-width%3D%221.6%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 2 2, default';
    const CURSOR = { move: ARROW, hand: "grab", frame: "crosshair", rect: "crosshair", ellipse: "crosshair", line: "crosshair", arrow: "crosshair", text: "text", image: "crosshair", button: "crosshair" };
    const CONTAINERS = new Set(["div", "section", "main", "header", "footer", "aside", "nav", "article", "form", "ul", "ol", "li", "figure", "body"]);
    const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="240" height="160" fill="#e5e5e5"/><circle cx="92" cy="58" r="12" fill="#bdbdbd"/><path d="M60 128l36-44 26 30 20-22 38 36z" fill="#bdbdbd"/></svg>');
    const TEMPLATES = {
        frame: { tag: "div", cls: "absolute bg-white border border-neutral-300", w: 320, h: 240 },
        rect: { tag: "div", cls: "absolute bg-neutral-300 rounded-md", w: 160, h: 100 },
        ellipse: { tag: "div", cls: "absolute bg-neutral-300 rounded-full", w: 120, h: 120 },
        line: { tag: "div", cls: "absolute bg-neutral-900 text-neutral-900", w: 160, h: 2 },
        arrow: { tag: "div", cls: "absolute bg-neutral-900 text-neutral-900", w: 160, h: 2, html: '<i class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 border-y-[5px] border-y-transparent border-l-[9px] border-l-current"></i>' },
        text: { tag: "p", cls: "absolute text-base text-neutral-900 whitespace-nowrap", text: "Text", auto: true },
        image: { tag: "img", cls: "absolute object-cover rounded-md bg-neutral-200", w: 240, h: 160, attrs: { src: PLACEHOLDER, alt: "Image" } },
        button: { tag: "button", cls: "absolute rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white whitespace-nowrap", text: "Button", auto: true },
    };

    // ── Geometry helpers ────────────────────────────────────────────────────────────────────
    const isAbs = (el) => { const p = getComputedStyle(el).position; return p === "absolute" || p === "fixed"; };
    const pageRect = (el) => {
        const r = el.getBoundingClientRect();
        // a group in a grid has no box of its own (display: contents, so the grid's cells stay as they were): the box around its children
        if (!r.width && !r.height && el.children && el.children.length && getComputedStyle(el).display === "contents") {
            const rs = Array.prototype.map.call(el.children, pageRect).filter((q) => q.w || q.h);
            if (rs.length) { const x = Math.min(...rs.map((q) => q.x)), y = Math.min(...rs.map((q) => q.y)); return { x, y, w: Math.max(...rs.map((q) => q.x + q.w)) - x, h: Math.max(...rs.map((q) => q.y + q.h)) - y }; }
        }
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
    };
    const rotationOf = (el) => {
        const cs = getComputedStyle(el), t = cs.transform;
        const m = t && t.match(/^matrix\(([^)]+)\)/);
        if (!m) { const r = /^(-?[\d.]+)deg$/.exec(cs.rotate || ""); return r ? Math.round(Number(r[1]) * 10) / 10 : 0; } // Tailwind 4 turns with the rotate property
        const [a, b] = m[1].split(",").map(Number);
        return Math.round(Math.atan2(b, a) * 180 / Math.PI * 10) / 10;
    };
    const geomOf = (el) => {
        const cs = getComputedStyle(el);
        const abs = isAbs(el);
        return {
            abs,
            x: Math.round(abs ? parseFloat(cs.left) || 0 : el.offsetLeft),
            y: Math.round(abs ? parseFloat(cs.top) || 0 : el.offsetTop),
            w: Math.round(parseFloat(cs.width) || el.offsetWidth),
            h: Math.round(parseFloat(cs.height) || el.offsetHeight),
            rot: rotationOf(el),
        };
    };
    const setPx = (el, prop, v) => { el.style[prop] = `${Math.round(v)}px`; };

    /** Origin of an element's coordinate space in page coordinates (static body uses the page itself). */
    const originOf = (container) => {
        if (container === document.body && getComputedStyle(container).position === "static") return { x: 0, y: 0 };
        const r = pageRect(container);
        const cs = getComputedStyle(container);
        return { x: r.x + (parseFloat(cs.borderLeftWidth) || 0) - container.scrollLeft, y: r.y + (parseFloat(cs.borderTopWidth) || 0) - container.scrollTop };
    };
    const ensurePositioned = (c) => { if (c !== document.body && getComputedStyle(c).position === "static") c.classList.add("relative"); };

    const pathOf = (el) => {
        const p = [];
        while (el && el !== document.body) {
            const par = el.parentElement;
            if (!par) return null;
            p.unshift(Array.prototype.indexOf.call(par.children, el));
            el = par;
        }
        return p;
    };
    const elAt = (path) => {
        let el = document.body;
        for (const i of path || []) { el = el && el.children[i]; if (!el) return null; }
        return el;
    };
    const alive = (el) => el && document.body.contains(el);

    // ── Overlay drawing ─────────────────────────────────────────────────────────────────────
    function place(box, el) {
        if (!el || !alive(el)) { box.style.display = "none"; return; }
        const r = pageRect(el);
        Object.assign(box.style, { display: "block", left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    }

    // The selection box, handles and size label are drawn by the editor, above the frame, so nothing clips them at the
    // frame's edge and the outline of an element hanging outside the frame stays visible. The agent only describes it.
    let lastOverlay = "";
    const boxOf = (el) => {
        const br = pageRect(el);
        const w = el.offsetWidth || br.w, h = el.offsetHeight || br.h;
        const cs = getComputedStyle(el);
        // each corner's horizontal and vertical radius in pixels (a percentage is of the width / height)
        const corners = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((c) => {
            const t = String(cs[`border${c}Radius`] || "0").split(/\s+/);
            const px = (v, ref) => (String(v).endsWith("%") ? (parseFloat(v) * ref) / 100 : parseFloat(v) || 0);
            return [px(t[0], w), px(t[1] === undefined ? t[0] : t[1], h)];
        });
        return {
            x: br.x + br.w / 2 - w / 2, y: br.y + br.h / 2 - h / 2, w, h, rot: rotationOf(el),
            rh: corners.map((c) => c[0]), rv: corners.map((c) => c[1]), r0: corners[0][0],
        };
    };
    let picking = false;
    function redraw() {
        sels = sels.filter(alive);
        const el = primary();
        const dragging = Boolean(gesture && gesture.type === "reorder" && gesture.leave && gesture.igh); // the landing outline and label say it all while dragging
        const items = dragging ? [] : sels.filter((e) => e !== document.body).map(boxOf);
        const handles = Boolean(!dragging && el && sels.length === 1 && el !== document.body && tool === "move" && !editing && !isLocked(el));
        let label = "", at = null;
        if (el && el !== document.body && gesture && gesture.moved) {
            const g = geomOf(el);
            if (gesture.type === "radius") { label = `Radius ${gesture.r}`; at = gesture.at; }
            else if (gesture.type === "rotate") { label = `${gesture.deg === undefined ? "" : gesture.deg + "°"}`; at = gesture.at; }
            else if (gesture.type !== "gap" && gesture.type !== "reorder") label = sels.length > 1 ? `${sels.length} selected` : `${g.w} × ${g.h}`; // a gap or padding drag has its own label
        }
        const bbox = el && el !== document.body && alive(el) ? pageRect(el) : null;
        // an element with interaction rules shows what they act on: the boxes of the elements they name, joined to it by an arrow (drawn in the editor)
        const links = [];
        if (el && el !== document.body && sels.length === 1 && el.getAttribute("data-wc-do")) {
            el.getAttribute("data-wc-do").split(";").forEach((r) => { const p = r.trim().split(/\s+/); const t = p.length === 3 && document.getElementById(p[2]); if (t && t !== el && !links.some((l) => l.id === p[2])) links.push({ id: p[2], ...pageRect(t) }); });
        }
        const data = JSON.stringify({ items, handles, label, bbox, at, links });
        if (data !== lastOverlay) { lastOverlay = data; post({ type: "overlay", items, handles, label, bbox, at, links }); }
        place(hoverBox, tool === "move" && hov && hov !== document.body && !sels.includes(hov) ? hov : null); // not the page itself
        drawKids();
        drawGapHandles();
    }

    // the box selected shows what it holds: its children, dashed (the one under the pointer is outlined solid by the hover box)
    let kidsKey = "";
    function drawKids() {
        const el = sels.length === 1 ? sels[0] : null;
        const list = !el || el === document.body || tool !== "move" || editing || gesture ? [] : realKids(el).slice(0, 60).filter((k) => k !== hov).map(pageRect).filter((r) => r.w >= 2 && r.h >= 2);
        const key = zoom + ":" + list.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join("|"); // redrawn on every pointer move: only rebuilt when something changed (or the zoom)
        if (key === kidsKey) return;
        kidsKey = key;
        kidLayer.textContent = "";
        list.forEach((r) => { const d = mk(`position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:none;`); Object.assign(d.style, dashes("#fff", px(1))); kidLayer.appendChild(d); });
    }

    const clearGuides = () => { guideLayer.innerHTML = ""; insertLine.style.display = "none"; ghostBox.style.display = "none"; dropBox.style.display = "none"; dropHint.style.display = "none"; dropHint.style.transform = ""; };

    // ── Describing and serializing ──────────────────────────────────────────────────────────
    const computedOf = (el) => readStyle(el, cssProps);
    // ── Where each property's value comes from ──────────────────────────────────────────────
    // A Tailwind class on this element, its inline style, the design's own CSS (<style>/<link> marked data-wc-design by the editor),
    // inherited, or nothing. The winner is found by switching each kind of stylesheet off for an instant and seeing whether the
    // value changes (synchronous: nothing repaints); which rule it is comes from walking the stylesheets.
    const LOGICAL = {
        "padding-left": ["padding-inline-start"], "padding-right": ["padding-inline-end"], "padding-top": ["padding-block-start"], "padding-bottom": ["padding-block-end"],
        "margin-left": ["margin-inline-start"], "margin-right": ["margin-inline-end"], "margin-top": ["margin-block-start"], "margin-bottom": ["margin-block-end"],
        width: ["inline-size"], height: ["block-size"], "min-width": ["min-inline-size"], "max-width": ["max-inline-size"], "min-height": ["min-block-size"], "max-height": ["max-block-size"],
        left: ["inset-inline-start"], right: ["inset-inline-end"], top: ["inset-block-start"], bottom: ["inset-block-end"],
    };
    // Tailwind v4 writes shorthands with var() (padding-inline: calc(var(--spacing) * 4)), which leave the longhands empty in the rule
    const shorthandsOf = (p) => {
        const m = p.match(/^(padding|margin)-(left|right|top|bottom)$/);
        if (m) return [`${m[1]}-${/left|right/.test(m[2]) ? "inline" : "block"}`, m[1]];
        if (/^(left|right|top|bottom)$/.test(p)) return [/left|right/.test(p) ? "inset-inline" : "inset-block", "inset"];
        if (/^border-(top|bottom)-(left|right)-radius$/.test(p)) return ["border-radius"];
        const b = p.match(/^border-(top|right|bottom|left)-(width|style|color)$/);
        if (b) return [`border-${b[2]}`, `border-${b[1]}`, `border-${/left|right/.test(b[1]) ? "inline" : "block"}-${b[2]}`, "border"];
        return { "background-color": ["background"], "row-gap": ["gap"], "column-gap": ["gap"], "font-size": ["font"], "font-weight": ["font"], "line-height": ["font"], "flex-direction": ["flex-flow"], "flex-wrap": ["flex-flow"], "text-decoration-line": ["text-decoration"] }[p] || [];
    };
    const unesc = (s) => s.replace(/\\(.)/g, "$1");
    const classNamesIn = (sel) => [...sel.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => unesc(m[1]));
    function sheetsByKind() {
        const owners = [...document.querySelectorAll("style, link[rel=stylesheet]")].filter((n) => !n.hasAttribute("data-wc-agent-style") && !n.hasAttribute("data-wc-editor"));
        const design = owners.filter((n) => n.hasAttribute("data-wc-design"));
        const tw = owners.filter((n) => !n.hasAttribute("data-wc-design") && n.tagName === "STYLE" && n.type !== "text/tailwindcss");
        // classes the design defines itself in <style type="text/tailwindcss"> (.btn { @apply ... }): compiled into Tailwind's sheet, but the design's
        const custom = new Set(design.filter((n) => n.type === "text/tailwindcss").flatMap((n) => [...n.textContent.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1])));
        return { design: design.map((n) => n.sheet).filter(Boolean), tw: tw.map((n) => n.sheet).filter(Boolean), custom };
    }
    function sourcesOf(el, props) {
        if (!el || el === document.body || !props.length) return {};
        const { design, tw, custom } = sheetsByKind();
        const rulesOf = (sheet) => {
            const out = [];
            const walk = (list) => {
                for (const r of list) {
                    if (r.media && r.cssRules && !(r instanceof CSSStyleRule)) { if (matchMedia(r.media.mediaText).matches) walk(r.cssRules); continue; }
                    if (r instanceof CSSStyleRule) {
                        let hit = false;
                        try { hit = el.matches(r.selectorText); } catch (err) { /* a selector this browser can't match */ }
                        if (hit) out.push(r);
                        if (r.cssRules && r.cssRules.length) walk(r.cssRules);
                        continue;
                    }
                    if (r.cssRules) walk(r.cssRules); // @layer, @supports
                }
            };
            try { walk(sheet.cssRules); } catch (err) { out.cross = true; } // a linked sheet from another site can't be read
            return out;
        };
        const twRules = tw.flatMap(rulesOf);
        const designLists = design.map(rulesOf);
        const designRules = designLists.flat();
        const designUnreadable = designLists.some((l) => l.cross);
        const toks = [...el.classList].filter((t) => !custom.has(t)).map((t) => ({ t, sel: "." + CSS.escape(t) }));
        const tokenOf = (r) => { const s = r.selectorText; const hit = toks.find(({ sel }) => s === sel || (s.startsWith(sel) && /^[:[]/.test(s.slice(sel.length)))); return hit ? hit.t : null; };
        const declares = (r, p) => [p, ...(LOGICAL[p] || []), ...shorthandsOf(p)].some((q) => r.style.getPropertyValue(q) !== "");
        // of the rules that set a property, the likely winner: one naming a class of this element beats a reset like `*` or `h1`; then the later one
        const best = (rules) => { const own = rules.filter((r) => classNamesIn(r.selectorText).some((n) => el.classList.contains(n))); const l = own.length ? own : rules; return l[l.length - 1]; };

        const read = () => readStyle(el, props);
        const base = read();
        const without = (sheets) => { sheets.forEach((s) => { s.disabled = true; }); const v = read(); sheets.forEach((s) => { s.disabled = false; }); return v; };
        const noTw = tw.length ? without(tw) : base, noDesign = design.length ? without(design) : base;

        const res = {};
        props.forEach((p) => {
            const inline = el.style.getPropertyValue(p);
            const ownTw = twRules.filter((r) => declares(r, p));
            const twTok = ownTw.map(tokenOf).filter(Boolean);
            const ownDesign = designRules.filter((r) => declares(r, p));
            const twWins = base[p] !== noTw[p], designWins = base[p] !== noDesign[p];
            let s;
            if (/^(initial|inherit|unset|revert)$/.test(inline)) s = { source: "off" }; // switched off over a rule of the design's CSS (the panel's −): reads as not set
            else if (twWins && twTok.length) s = { source: "tailwind", token: twTok[twTok.length - 1] };
            else if (twWins && ownTw.length) {
                const sel = best(ownTw).selectorText;
                const names = classNamesIn(sel);
                const mine = names.find((n) => custom.has(n) && el.classList.contains(n));
                const parent = names.find((n) => !el.classList.contains(n) && el.parentElement && el.parentElement.closest("." + CSS.escape(n)));
                s = mine ? { source: "design", selector: sel } : parent ? { source: "parent", token: parent } : { source: "default" }; // the last: Tailwind's reset
            } else if (designWins && ownDesign.length) s = { source: "design", selector: best(ownDesign).selectorText };
            else if (designWins && designUnreadable) s = { source: "design", selector: "a linked stylesheet" };
            else if (inline) s = { source: "inline" };
            else if (twTok.length || ownDesign.length) s = { source: "tie", token: twTok[twTok.length - 1] || null }; // two sources set the same value
            else if (twWins || designWins) s = { source: "inherited" };
            else s = { source: "default" };
            res[p] = s;
        });
        return res;
    }

    // A brand-new class takes Tailwind a moment to build. Wait until its rule is in Tailwind's stylesheet (checked every few ms),
    // at most 150 ms, so the time a released drag spends converting stays short.
    const hasRule = (token) => {
        const sel = "." + CSS.escape(token);
        const walk = (list) => { for (const r of list) { if (r.selectorText && (r.selectorText === sel || r.selectorText.startsWith(sel + ":") || r.selectorText.startsWith(sel + " ") || r.selectorText.startsWith(sel + ","))) return true; if (r.cssRules && walk(r.cssRules)) return true; } return false; };
        return sheetsByKind().tw.some((sh) => { try { return walk(sh.cssRules); } catch (err) { return false; } });
    };
    async function settle(tokens) {
        const t0 = performance.now();
        const list = (tokens || []).filter(Boolean);
        do {
            await new Promise((r) => setTimeout(r, 8));
            if (list.length && list.every(hasRule)) return;
        } while (performance.now() - t0 < 150);
    }
    /** The CSS value a Tailwind class gives a property, measured on a hidden twin next to the element (used when the class itself can't win). */
    async function valueOfClass(el, token, prop) {
        if (!token || !el.parentElement) return null;
        const twin = document.createElement(el.tagName);
        twin.className = token;
        twin.style.cssText = "visibility:hidden;pointer-events:none;position:absolute;";
        el.after(twin);
        await settle([token]);
        const v = getComputedStyle(twin).getPropertyValue(prop);
        twin.remove();
        return v || null;
    }
    const tidyStyle = (el) => { if (!el.getAttribute("style")) el.removeAttribute("style"); };
    /**
     * A property edit from the panel, written where it belongs and checked: "tw" sets the new class string and keeps it only if that
     * class is now what gives the property its value (something stronger, like the design's CSS or a md: class, makes it fall back);
     * "css" writes the inline style, made !important when the design's own CSS would still win.
     */
    // ── After a drag, resize or draw: pixels become Tailwind classes (the editor builds them, this frame checks them) ──
    const GESTURE_PROPS = ["width", "height", "left", "top", "margin-left", "margin-top", "margin-right", "margin-bottom", "align-self"];
    const inlineOf = (el, props) => { const o = {}; props.forEach((p) => { o[p] = el.style.getPropertyValue(p); }); return o; };
    /** What the editor needs to turn an element's new inline pixels into classes: the values, its classes, and where each value came from before. */
    function gestureItem(el, pre, props, clear) {
        const values = {};
        props.forEach((p) => { const v = el.style.getPropertyValue(p); if (v && !el.style.getPropertyPriority(p)) values[p] = v; });
        // `clear`: class groups (mt, mx, self...) to take off the element, for the margins and alignment its old place gave it
        return { path: pathOf(el), classes: el.getAttribute("class") || "", made: made.has(el), pre: pre || {}, values, ...(clear && clear.length ? { clear } : {}) };
    }
    /**
     * The editor's answer: per element, the class string and the class meant to give each property its value. The classes go on
     * first, and only once Tailwind has built them is the inline pixel removed, all in one go, so nothing flickers. If any of an
     * element's properties then takes its value from something else, that element gets its classes and pixels back.
     */
    // From release until the editor's classes are in, new presses wait: a second drag in that moment would work on pixels that
    // are about to become classes. If the editor never answers, the pixels are saved as they are.
    let converting = false, convertTimer = 0;
    function askConvert(items) {
        converting = true;
        clearTimeout(convertTimer);
        convertTimer = setTimeout(() => { converting = false; changed(); }, 2000);
        post({ type: "convert", items });
    }
    async function applyGesture(m) {
        const work = (m.items || []).map((it) => ({ it, el: elAt(it.path), props: Object.keys(it.tokens || {}) })).filter((w) => w.el && (w.props.length || w.it.cleared));
        work.forEach((w) => { w.prevClass = w.el.getAttribute("class"); w.prevStyle = w.el.getAttribute("style"); w.el.setAttribute("class", w.it.classes); });
        if (!converting) return; // too late: the pixels were already saved
        clearTimeout(convertTimer);
        if (work.length) await settle(work.flatMap((w) => Object.values(w.it.tokens)));
        work.forEach((w) => {
            const { el, it, props } = w;
            props.forEach((p) => el.style.removeProperty(p));
            tidyStyle(el);
            const now = sourcesOf(el, props);
            const lost = props.some((p) => { const s = now[p] || {}; return s.source === "design" || s.source === "inline" || (s.source === "tailwind" && s.token !== it.tokens[p]); });
            if (!lost) return;
            if (w.prevClass === null) el.removeAttribute("class"); else el.setAttribute("class", w.prevClass);
            if (w.prevStyle === null) el.removeAttribute("style"); else el.setAttribute("style", w.prevStyle);
        });
        converting = false;
        redraw();
        changed();
    }

    // Tailwind's spacing scale in pixels: a handle dragged near a step lands on it (Cmd: to the pixel)
    const SCALE_PX = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384];
    const onScale = (v) => { const a = Math.abs(v), t = SCALE_PX.reduce((b, x) => (Math.abs(x - a) < Math.abs(b - a) ? x : b), 0); return (Math.abs(t - a) <= 2 ? t : Math.round(a)) * (v < 0 ? -1 : 1); };
    // ── Gap handles: the spacing between a box's children, dragged as one value ─────────────────────────────────────
    // With a flex row or column, or a grid, selected, each gap between its children is a handle (as in Figma). Dragging one changes the
    // box's gap (gap-4 -> gap-6, column-gap / row-gap in a grid), live, on the Tailwind scale (Cmd: to the pixel). Only where the spacing
    // really is the gap: a row spaced by margins or justify-between has no handles, since a gap would be added on top.
    let gapList = [], gapHot = -1;
    function gapHandlesOf(el) {
        const cs = getComputedStyle(el), out = [];
        if (!/flex|grid/.test(cs.display)) return out;
        const kids = kidsOf(el, null).filter(inFlow);
        if (kids.length < 2 || kids.length > 24) return out;
        const rects = kids.map(pageRect), f = (v) => parseFloat(v) || 0, near = (a, b) => Math.abs(a - b) <= 1;
        if (cs.display.includes("flex")) {
            if (cs.flexWrap !== "nowrap" || cs.flexDirection.includes("reverse")) return out;
            const row = cs.flexDirection.startsWith("row"), A = row ? "x" : "y", Z = row ? "w" : "h", C = row ? "y" : "x", CZ = row ? "h" : "w", gap = f(row ? cs.columnGap : cs.rowGap);
            if (gap < 1) return out;
            for (let i = 0; i + 1 < rects.length; i++) if (!near(rects[i + 1][A] - (rects[i][A] + rects[i][Z]), gap)) return [];
            const c0 = Math.min(...rects.map((r) => r[C])), c1 = Math.max(...rects.map((r) => r[C] + r[CZ]));
            rects.slice(0, -1).forEach((a, i) => out.push({ i, axis: A, prop: "gap", gap, r: row ? { x: a.x + a.w, y: c0, w: gap, h: c1 - c0 } : { x: c0, y: a.y + a.h, w: c1 - c0, h: gap } }));
            return out;
        }
        // a grid: the columns are the distinct left edges, the rows the distinct top edges
        const uniq = (v) => { const o = []; v.slice().sort((p, q) => p - q).forEach((x) => { if (!o.length || x - o[o.length - 1] > 1) o.push(x); }); return o; };
        const xs = uniq(rects.map((r) => r.x)), ys = uniq(rects.map((r) => r.y));
        const x0 = Math.min(...rects.map((r) => r.x)), x1 = Math.max(...rects.map((r) => r.x + r.w)), y0 = Math.min(...rects.map((r) => r.y)), y1 = Math.max(...rects.map((r) => r.y + r.h));
        const cg = f(cs.columnGap), rg = f(cs.rowGap);
        xs.slice(0, -1).forEach((x, i) => { const end = Math.max(...rects.filter((r) => near(r.x, x)).map((r) => r.x + r.w)), gp = xs[i + 1] - end; if (cg >= 1 && near(gp, cg)) out.push({ i: out.length, axis: "x", prop: "column-gap", gap: cg, r: { x: end, y: y0, w: gp, h: y1 - y0 } }); });
        ys.slice(0, -1).forEach((y, i) => { const end = Math.max(...rects.filter((r) => near(r.y, y)).map((r) => r.y + r.h)), gp = ys[i + 1] - end; if (rg >= 1 && near(gp, rg)) out.push({ i: out.length, axis: "y", prop: "row-gap", gap: rg, r: { x: x0, y: end, w: x1 - x0, h: gp } }); });
        return out;
    }
    /** The padding of a box as four handles: dragging one changes that side (Alt: the opposite side too). Only sides that have padding. */
    function padHandlesOf(el) {
        const cs = getComputedStyle(el), r = pageRect(el), f = (v) => parseFloat(v) || 0, out = [];
        const b = { t: f(cs.borderTopWidth), r: f(cs.borderRightWidth), b: f(cs.borderBottomWidth), l: f(cs.borderLeftWidth) };
        const p = { t: f(cs.paddingTop), r: f(cs.paddingRight), b: f(cs.paddingBottom), l: f(cs.paddingLeft) };
        const ix0 = r.x + b.l + p.l, ix1 = r.x + r.w - b.r - p.r, iy0 = r.y + b.t + p.t, iy1 = r.y + r.h - b.b - p.b;
        if (ix1 - ix0 < 4 || iy1 - iy0 < 4) return out;
        // each side is a grip in the middle of its padding (40% of the side, at least 24px), not the whole strip: the rest of the padding
        // is still where the box is grabbed to move it
        const grip = (rect, axis) => {
            if (axis === "x") { const len = Math.min(rect.h, Math.max(px(24), rect.h * 0.4)); return { ...rect, y: rect.y + (rect.h - len) / 2, h: len }; }
            const len = Math.min(rect.w, Math.max(px(24), rect.w * 0.4)); return { ...rect, x: rect.x + (rect.w - len) / 2, w: len };
        };
        const add = (k, prop, side, sign, val, rect, axis) => { if (val >= 1) out.push({ i: 100 + out.length, kind: "pad", axis, prop, opp: { l: "padding-right", r: "padding-left", t: "padding-bottom", b: "padding-top" }[side], sign, gap: val, r: grip(rect, axis) }); };
        add("l", "padding-left", "l", 1, p.l, { x: r.x + b.l, y: iy0, w: p.l, h: iy1 - iy0 }, "x");
        add("r", "padding-right", "r", -1, p.r, { x: r.x + r.w - b.r - p.r, y: iy0, w: p.r, h: iy1 - iy0 }, "x");
        add("t", "padding-top", "t", 1, p.t, { x: ix0, y: r.y + b.t, w: ix1 - ix0, h: p.t }, "y");
        add("b", "padding-bottom", "b", -1, p.b, { x: ix0, y: r.y + r.h - b.b - p.b, w: ix1 - ix0, h: p.b }, "y");
        return out;
    }
    /** The zone of a handle: its gap, and at least 8px across so a narrow gap can be grabbed. */
    function gapZone(h) {
        const r = h.r, min = px(8);
        return h.axis === "x" ? { x: r.x + r.w / 2 - Math.max(r.w, min) / 2, y: r.y, w: Math.max(r.w, min), h: r.h } : { x: r.x, y: r.y + r.h / 2 - Math.max(r.h, min) / 2, w: r.w, h: Math.max(r.h, min) };
    }
    function gapAt(e) {
        const x = e.clientX + window.scrollX, y = e.clientY + window.scrollY;
        return gapList.find((h) => { const z = gapZone(h); return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h; }) || null;
    }
    function drawGapHandles() {
        gapLayer.innerHTML = "";
        gapList = [];
        const el = primary();
        if (!el || sels.length !== 1 || el === document.body || tool !== "move" || editing || isLocked(el)) return;
        if (gesture && gesture.type !== "gap") return;
        gapList = [...gapHandlesOf(el), ...(el.parentElement ? padHandlesOf(el) : [])];
        gapList.forEach((h) => {
            const z = gapZone(h), hot = gapHot === h.i || (gesture && gesture.type === "gap" && gesture.h.i === h.i);
            gapLayer.appendChild(mk(`position:absolute;left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;background:${hot ? "rgba(242,72,34,.32)" : h.kind === "pad" ? "rgba(242,72,34,.07)" : "rgba(242,72,34,.13)"};border-radius:${px(2)}px;box-sizing:border-box;`));
            if (h.kind === "pad" && !hot) return;
            // a grip line down the middle of the gap
            gapLayer.appendChild(mk(h.axis === "x"
                ? `position:absolute;left:${z.x + z.w / 2 - px(0.5)}px;top:${z.y + z.h / 2 - px(10)}px;width:${px(1)}px;height:${px(20)}px;background:${RED};`
                : `position:absolute;left:${z.x + z.w / 2 - px(10)}px;top:${z.y + z.h / 2 - px(0.5)}px;width:${px(20)}px;height:${px(1)}px;background:${RED};`));
        });
    }
    function gapGesture(g, e) {
        const d = (g.h.axis === "x" ? e.clientX - g.sx : e.clientY - g.sy) * (g.h.sign || 1);
        const raw = Math.max(0, g.start + d), v = e.metaKey ? Math.round(raw) : onScale(raw);
        const pad = g.h.kind === "pad";
        g.el.style.setProperty(g.h.prop, `${v}px`);
        // Alt: the opposite side too; otherwise it keeps what it had
        if (pad) { if (e.altKey) g.el.style.setProperty(g.h.opp, `${v}px`); else if (g.inl0[g.h.opp]) g.el.style.setProperty(g.h.opp, g.inl0[g.h.opp]); else g.el.style.removeProperty(g.h.opp); }
        g.v = v;
        g.pair = pad && e.altKey;
        guideLayer.innerHTML = "";
        const now = pad ? padHandlesOf(g.el) : gapHandlesOf(g.el);
        const z = gapZone(now.find((h) => h.prop === g.h.prop && h.axis === g.h.axis) || g.h);
        const word = pad ? (g.pair ? `${g.h.axis === "x" ? "Horizontal" : "Vertical"} padding` : { "padding-left": "Padding left", "padding-right": "Padding right", "padding-top": "Padding top", "padding-bottom": "Padding bottom" }[g.h.prop]) : g.h.prop === "gap" ? "Gap" : g.h.prop === "column-gap" ? "Column gap" : "Row gap";
        dropHint.textContent = `${word} ${v}`;
        // on the handle itself, centred: above it the label would sit on the selection's edge, which draws over it
        Object.assign(dropHint.style, { display: "block", left: `${z.x + z.w / 2}px`, top: `${z.y + z.h / 2}px`, transform: "translate(-50%, -50%)", fontSize: `${px(11)}px`, padding: `${px(4)}px ${px(7)}px` });
        redraw();
    }

    // ── Absolute children that line up: offer a clean layout (the host fits one: packages/core/layout-infer.js) ──────
    // After an absolutely placed box is moved among others, the frame sends where they all are. If a row, column or grid explains them,
    // the editor offers it ("These line up: Row · gap 16 · Make it a layout"); nothing changes unless that is clicked.
    function contentBox(c) {
        const cs = getComputedStyle(c), pr = pageRect(c), f = (v) => parseFloat(v) || 0;
        const bx = f(cs.borderLeftWidth) + f(cs.paddingLeft), bt = f(cs.borderTopWidth) + f(cs.paddingTop);
        return { x: pr.x + bx, y: pr.y + bt, w: pr.w - bx - f(cs.borderRightWidth) - f(cs.paddingRight), h: pr.h - bt - f(cs.borderBottomWidth) - f(cs.paddingBottom) };
    }
    function layoutHint(c) {
        if (!c || c === document.body) return;
        const all = kidsOf(c, null).filter((k) => getComputedStyle(k).display !== "none");
        const kids = all.filter(isAbs);
        if (kids.length < 3 || kids.length > 14 || kids.length !== all.length) return; // three or more, and nothing in the flow beside them
        post({ type: "layoutHint", container: pathOf(c), box: contentBox(c), kids: kids.map((k) => ({ path: pathOf(k), ...pageRect(k) })) });
    }
    /** Turn a box of absolutely placed children into the row, column or grid the host fitted: pixels in, classes out, for every size. */
    function applyLayout(m) {
        const box = elAt(m.container), kids = (m.kids || []).map(elAt), L = m.layout;
        if (flowPending) { // a child dropped elsewhere in its row, column or grid: the offset the drop wrote gives way to the structure
            const f = flowPending; clearTimeout(f.timer); flowPending = null;
            if (box && L) { ["position", "left", "top"].forEach((p) => f.el.style.removeProperty(p)); tidyStyle(f.el); } else askConvert(f.items);
        }
        if (!box || !L || kids.some((k) => !k)) return;
        const JUSTIFY = { end: "flex-end", center: "center", between: "space-between", around: "space-around", evenly: "space-evenly" }, ITEMS = { start: "flex-start", center: "center", end: "flex-end" };
        const set = (el, p, v) => el.style.setProperty(p, v);
        const boxProps = L.kind === "grid" ? ["display", "grid-template-columns", "column-gap", "row-gap", "justify-content", "align-content"] : ["display", "flex-direction", "gap", "justify-content", "align-items"];
        const pre = sourcesOf(box, boxProps);
        if (L.kind === "grid") { set(box, "display", "grid"); set(box, "grid-template-columns", L.fit ? `repeat(${L.cols}, auto)` : `repeat(${L.cols}, minmax(0, 1fr))`); if (L.fit) { set(box, "justify-content", "start"); set(box, "align-content", "start"); } if (L.gapX) set(box, "column-gap", `${L.gapX}px`); if (L.gapY) set(box, "row-gap", `${L.gapY}px`); }
        else {
            set(box, "display", "flex");
            if (L.kind === "col") set(box, "flex-direction", "column");
            else if (getComputedStyle(box).flexDirection.startsWith("column")) set(box, "flex-direction", "row");
            if (L.gap) set(box, "gap", `${L.gap}px`);
            if (JUSTIFY[L.justify]) set(box, "justify-content", JUSTIFY[L.justify]);
            if (ITEMS[L.items]) set(box, "align-items", ITEMS[L.items]);
        }
        const boxItem = gestureItem(box, pre, boxProps.filter((p) => box.style.getPropertyValue(p)), L.kind === "grid" ? (L.fit ? ["flexDir", "flexWrap", "items"] : ["flexDir", "flexWrap", "justify", "items"]) : ["gridCols"]);
        boxItem.structural = true;
        const items = [boxItem];
        kids.forEach((k, i) => {
            const push = L.push === i ? [L.kind === "col" ? "margin-top" : "margin-left"] : [];
            const kpre = sourcesOf(k, push);
            push.forEach((p) => set(k, p, "auto"));
            ["position", "left", "top", "right", "bottom"].forEach((p) => k.style.removeProperty(p)); // into the flow: the classes for these come off too (below)
            tidyStyle(k);
            const it = gestureItem(k, kpre, push, ["position", "left", "top", "right", "bottom"]);
            it.structural = true;
            items.push(it);
        });
        setSelection([box]);
        askConvert(items);
    }

    let propSeq = 0;
    async function setProp(el, m) {
        const seq = ++propSeq; // a colour picker being dragged sends edit after edit: only the latest one gets checked (and maybe undone)
        const props = m.props || [m.prop]; // several at once for an all-sides edit (padding, border width, radius)
        let css = m.css;
        let perProp = null; // the fallback CSS measured for each property
        if (m.route === "tw") {
            const prevClass = el.getAttribute("class"), prevStyle = el.getAttribute("style");
            if (m.classes) el.setAttribute("class", m.classes); else el.removeAttribute("class");
            props.forEach((p) => el.style.removeProperty(p));
            tidyStyle(el);
            if (!m.token) return; // a class was removed: nothing to check
            await settle([m.token]);
            if (seq !== propSeq) return;
            const now = sourcesOf(el, props);
            const lost = props.some((p) => { const s = now[p] || {}; return s.source === "design" || s.source === "inline" || (s.source === "tailwind" && s.token !== m.token); });
            if (!lost) {
                // a size typed in px that the class does not give (the design's theme has another scale: rounded-lg is 24px here): the same value as an arbitrary one
                if (m.alt && /^-?[\d.]+px$/.test(m.css || "") && /^(?:border-.*-radius|padding-|margin-|font-size|line-height|letter-spacing|(?:row-|column-)?gap|border-.*-width)/.test(props[0])) {
                    const want = parseFloat(m.css), got = parseFloat(getComputedStyle(el).getPropertyValue(props[0]));
                    if (Number.isFinite(got) && Math.abs(got - want) > 0.6) { el.setAttribute("class", m.alt.classes); await settle([m.alt.token]); }
                }
                return;
            }
            if (prevClass === null) el.removeAttribute("class"); else el.setAttribute("class", prevClass);
            if (prevStyle === null) el.removeAttribute("style"); else el.setAttribute("style", prevStyle);
            if (!css) {
                const base = m.token.replace(/^(?:[^[\]:]*(?:\[[^\]]*\])?[^[\]:]*:)+/, ""); // without its md: / hover: prefix
                perProp = {};
                for (const p of props) perProp[p] = await valueOfClass(el, base, p);
            }
        } else if (!css && m.token) { // a Tailwind value typed on a CSS row (red-500): measure what it means
            perProp = {};
            for (const p of props) perProp[p] = await valueOfClass(el, m.token, p);
        }
        props.forEach((p) => {
            const v = perProp ? perProp[p] : css;
            if (v === null || v === undefined || v === "") { el.style.removeProperty(p); return; }
            el.style.setProperty(p, v);
        });
        // the design's own CSS still wins (an !important rule): only an important inline value beats it
        const after = sourcesOf(el, props);
        props.forEach((p) => { const v = el.style.getPropertyValue(p); if (v && (after[p] || {}).source === "design") el.style.setProperty(p, v, "important"); });
        tidyStyle(el);
    }

    /** For a child of a flex box: its direction and whether flex sizes it along that axis (flex-1, grow, a basis), which a width or height can't override. */
    const flexItemOf = (el) => {
        const p = el.parentElement;
        if (!p || el === document.body || !/flex/.test(getComputedStyle(p).display)) return null;
        const cs = getComputedStyle(el), dir = getComputedStyle(p).flexDirection.startsWith("row") ? "row" : "column";
        return { dir, sized: (parseFloat(cs.flexGrow) || 0) > 0 || cs.flexBasis !== "auto" };
    };
    /**
     * A box with two or more children stacked in the normal flow can be made a row, column or grid. The gap that keeps today's
     * spacing: in the flow, touching margins collapse into the larger one; in flex they add up, so the margins come off the gap.
     */
    const arrangeOf = (el) => {
        if (!el || el === document.body || !/^(block|flow-root|list-item)$/.test(getComputedStyle(el).display)) return null;
        const kids = Array.prototype.filter.call(el.children, (k) => !["SCRIPT", "STYLE"].includes(k.tagName) && !isAbs(k));
        if (kids.length < 2) return null;
        const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] || 0; };
        const rs = kids.map((k) => ({ r: k.getBoundingClientRect(), cs: getComputedStyle(k) }));
        const space = med(rs.slice(1).map((b, i) => b.r.top - rs[i].r.bottom));
        const margins = med(rs.slice(1).map((b, i) => (parseFloat(rs[i].cs.marginBottom) || 0) + (parseFloat(b.cs.marginTop) || 0)));
        return { count: kids.length, colGap: Math.max(0, Math.round(space - margins)), rowGap: Math.max(0, Math.round(space)) };
    };
    // ── Which tags an element can become ───────────────────────────────────────────────────
    // Only swaps that keep the HTML valid for where the element sits and what it holds: text tags (p, h1, span...) only around
    // text and inline content, no link or button inside another, list items only in a list, one <main>, no form in a form.
    // Images, inputs, media and table rows keep their own tag (another one would drop what they are).
    const FLOW_TAGS = ["div", "section", "article", "aside", "header", "footer", "nav", "main", "form", "figure", "blockquote"];
    const TEXT_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "label", "strong", "em", "small"];
    const ACTION_TAGS = ["a", "button"];
    const PHRASING = new Set(["a", "abbr", "b", "br", "button", "code", "em", "i", "img", "input", "kbd", "label", "mark", "q", "s", "select", "small", "span", "strong", "sub", "sup", "svg", "textarea", "time", "u", "wbr", "picture", "video", "audio", "canvas", "iframe", "object", "data", "var", "samp", "cite", "dfn", "bdi", "bdo", "ruby", "del", "ins", "map", "meter", "output", "progress", "slot", "template", "noscript", "script", "style"]);
    const TEXT_ONLY = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "label", "strong", "em", "small", "a", "button", "b", "i", "u", "s", "code", "q", "cite", "mark", "sub", "sup", "abbr", "time", "legend", "dt", "caption", "summary", "pre"]);
    const INTERACTIVE = "a, button, input, select, textarea, label, details, iframe, [tabindex]";
    const PAIRS = { td: ["td", "th"], th: ["td", "th"], dt: ["dt", "dd"], dd: ["dt", "dd"], thead: ["thead", "tbody", "tfoot"], tbody: ["thead", "tbody", "tfoot"], tfoot: ["thead", "tbody", "tfoot"] };
    const SWAPPABLE = new Set([...FLOW_TAGS, ...TEXT_TAGS, ...ACTION_TAGS, "ul", "ol", "li", "menu", "b", "i", "u", "s", "code", "mark", "pre"]);
    function tagOptions(el) {
        const tag = el.tagName.toLowerCase();
        if (el === document.body || isOverlay(el)) return [];
        if (PAIRS[tag]) return PAIRS[tag];
        if (!SWAPPABLE.has(tag)) return [];
        const parent = el.parentElement, ptag = parent ? parent.tagName.toLowerCase() : "body";
        if (["ul", "ol", "menu"].includes(ptag)) return ["li"]; // a list holds only list items
        const kids = Array.prototype.filter.call(el.children, (k) => !["SCRIPT", "STYLE", "TEMPLATE"].includes(k.tagName));
        const kidTags = kids.map((k) => k.tagName.toLowerCase());
        if (kids.length && kidTags.every((t) => t === "li")) return ["ul", "ol"]; // its items need a list around them
        const up = (sel) => Boolean(parent && parent.closest(sel));
        const down = (sel) => Boolean(el.querySelector(sel));
        const inlineOnly = kidTags.every((t) => PHRASING.has(t)); // holds only text and inline elements
        const inText = TEXT_ONLY.has(ptag) || up("p, h1, h2, h3, h4, h5, h6, span, a, button, label");
        const inAction = up("a, button");
        let out = [];
        if (!inText) {
            out.push(...FLOW_TAGS.filter((t) => {
                if (t === "main") return (tag === "main" || !document.querySelector("main")) && !up("article, aside, footer, header, nav"); // one per page
                if (t === "header" || t === "footer") return !up("header, footer") && !down("header, footer");
                if (t === "form") return !up("form") && !down("form");
                return true;
            }));
            if (!kids.length && !el.textContent.trim()) out.push("ul", "ol"); // an empty one can start a list (text can't sit in one)
        }
        if (inlineOnly) {
            out.push(...(inText ? TEXT_TAGS.filter((t) => !/^(p|h\d)$/.test(t)) : TEXT_TAGS).filter((t) => t !== "label" || (!inAction && !up("label") && !down("label"))));
            if (!inAction && !down(INTERACTIVE)) out.push(...ACTION_TAGS);
        }
        if (!out.includes(tag)) out.unshift(tag);
        return [...new Set(out)];
    }

    const describe = (el) => {
        if (!el) return null;
        // the editor's own cursor rule (everything follows the tool) is not the design's: off while the element is read, so its
        // cursor-pointer shows as pointer in the panel
        cursorStyle.disabled = true;
        try { return describeNow(el); } finally { cursorStyle.disabled = false; }
    };
    const describeNow = (el) => {
        const attrs = {};
        Array.prototype.forEach.call(el.attributes, (a) => { if (a.name !== "class" && a.name !== "style" && a.name !== "contenteditable") attrs[a.name] = a.value; });
        const crumbs = [];
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) crumbs.unshift({ tag: n.tagName.toLowerCase(), path: n === document.body ? [] : pathOf(n) });
        return {
            path: el === document.body ? [] : pathOf(el),
            tag: el.tagName.toLowerCase(),
            classes: el.getAttribute("class") || "",
            style: el.getAttribute("style") || "",
            leaf: el.children.length === 0,
            kids: Array.prototype.filter.call(el.children, (c) => !/^(SCRIPT|STYLE)$/.test(c.tagName)).length, // for "animate the children one after another"
            group: el.hasAttribute("data-wc-group"),
            ownText: Array.prototype.some.call(el.childNodes, (n) => n.nodeType === 3 && n.textContent.trim() !== ""), // text of its own: Typography shows
            text: el.children.length === 0 ? el.textContent : null,
            attrs, crumbs,
            geom: geomOf(el),
            rect: el === document.body ? null : pageRect(el),
            computed: computedOf(el),
            sources: sourcesOf(el, cssProps),
            flexItem: flexItemOf(el),
            parentLayout: el !== document.body && el.parentElement ? layoutOf(el.parentElement) : null,
            arrange: arrangeOf(el),
            tagOptions: tagOptions(el),
            added: made.has(el),
            count: sels.length,
            others: sels.length > 1 && el === primary() ? sels.filter((o) => o !== el).map(pathOf) : [], // the rest of a multiple selection: a class change goes to all of them
            outer: el.outerHTML.slice(0, 20000),
        };
    };

    let count = 0;
    const walk = (el, depth) => {
        if (count > 600 || depth > 14) return null;
        const tag = el.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "link") return null;
        count++;
        const own = Array.prototype.filter.call(el.childNodes, (n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
        const label = el.id ? "#" + el.id : own ? own.slice(0, 26) : (el.getAttribute("class") || "").split(/\s+/)[0] || "";
        const children = Array.prototype.map.call(el.children, (c) => walk(c, depth + 1)).filter(Boolean);
        return { tag, label, path: el === document.body ? [] : pathOf(el), children, locked: el.hasAttribute("data-wc-locked"), hidden: el.classList.contains("hidden"), start: el.getAttribute("data-wc-start") === "hidden" };
    };
    const tree = () => { count = 0; return walk(document.body, 0); };
    const serialize = () => {
        const c = document.body.cloneNode(true);
        c.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));
        c.querySelectorAll("[data-wc-state]").forEach((e) => e.removeAttribute("data-wc-state")); // a state shown while editing, not part of the design
        c.querySelectorAll("script[data-wc-agent]").forEach((e) => e.remove());
        c.querySelectorAll('[style=""]').forEach((e) => e.removeAttribute("style")); // an attribute emptied by an edit is not part of the design
        return c.innerHTML.trim();
    };

    function changed(silent, key) {
        redraw();
        const info = primary() && alive(primary()) ? describe(primary()) : null;
        // with nothing selected the editor shows the page, and the page's styling is the body's: it gets the body's fresh values
        post({ type: "changed", silent: Boolean(silent), key: key || "", html: serialize(), tree: tree(), info, body: info ? null : describe(document.body) });
    }
    function setSelection(list, quiet) {
        sels = list.filter(Boolean);
        showState(); // the picked state shows on whatever is selected now
        if (inside && !(sels.length && sels.every((el) => el !== inside && inside.contains(el)))) inside = null; // picked something outside: out of the group
        redraw();
        if (!quiet) post({ type: "selected", info: describe(primary()) });
    }
    const select = (el, quiet) => setSelection(el ? [el] : [], quiet);
    function setTool(t, quiet) {
        tool = t;
        root.style.cursor = CURSOR[t] || "default";
        redraw();
        if (!quiet) post({ type: "tool", tool: t });
    }

    // A locked element (and what is inside it) cannot be picked, moved or resized on the page: a press on it goes to what holds it. The
    // lock is an attribute on the element, so it is saved with the design. It can still be chosen in the Layers panel, to unlock it.
    const isLocked = (el) => Boolean(el && el.closest && el.closest("[data-wc-locked]"));
    const targetOf = (e) => {
        let t = e.target;
        if (t && t.nodeType !== 1) t = t.parentElement;
        if (!t || isOverlay(t) || t === root) return document.body;
        while (t && t !== document.body && isLocked(t)) t = t.parentElement;
        if (e.metaKey || e.ctrlKey) return (t && t.closest && t.closest("svg")) || t || document.body; // Cmd/Ctrl: the deepest, whatever the level (an icon is still one thing: never one of its paths)
        return pickable(t || document.body);
    };
    // ── Groups ── A group (Ctrl+G) is a box made around a few elements, marked data-wc-group so it is saved with the design. On the page
    // it acts as one thing, as in Figma: a click picks the whole group, a double-click goes inside it (then what is in it can be picked
    // and moved), and picking something outside it or Esc comes back out. The Layers panel can still pick anything.
    /** The group `el` is in, if any (not `el` itself). What is in a group stays in it until it is ungrouped. */
    const groupAround = (el) => (el && el.parentElement ? el.parentElement.closest("[data-wc-group]") : null);
    /** May `el` be put inside `parent`? Only within the group it is in, if it is in one. */
    const staysInGroup = (el, parent) => { const gp = groupAround(el); return !gp || (!!parent && gp.contains(parent)); };
    /** The elements of the design inside `el` that can be picked (not the editor's own overlay, scripts or styles). */
    const realKids = (el) => [...el.children].filter((c) => c !== overlay && !/^(script|style|link|meta)$/i.test(c.tagName));
    /**
     * Ctrl/Cmd+A, as in Figma: with nothing (or the page) selected, everything at the top of the page; with something selected,
     * everything beside it (its parent's children). Hidden ones are left out.
     */
    function selectAll() {
        const cur = sels.filter((el) => el !== document.body);
        const par = cur.length && cur[0].parentElement ? cur[0].parentElement : document.body;
        const all = realKids(par).filter((c) => getComputedStyle(c).display !== "none");
        if (!all.length) return;
        inside = par !== document.body ? par : null; // they are picked inside that box, so clicks stay at their level
        setSelection(all);
    }
    /** What a click on `t` picks, as in Figma: the top level of the design first, a double-click goes one level in, and from there a click
     *  picks at that level (the box selected, or the one gone into, and what sits beside it). Cmd/Ctrl-click picks the deepest. */
    function pickable(t) {
        if (!t || t === document.body) return t;
        const sv = t.closest && t.closest("svg"); // an icon or chart is one thing: its paths are never picked on their own
        if (sv && sv !== t) t = sv;
        const top = document.body; // the top level is what sits directly in the page, wrapper or not: the outermost box can always be picked
        // from the selection outwards, the first box that holds `t` is the level: what is picked is that box's child under the pointer
        // (so the cards beside a selected card, or the sections around it, can each be picked with one click)
        const cur = sels.length === 1 && alive(sels[0]) ? sels[0] : null;
        let from = top;
        if (inside && inside !== t && inside.contains(t) && top.contains(inside)) from = inside;
        else if (cur && cur !== document.body && top.contains(cur)) for (let a = cur.parentElement; a && top.contains(a); a = a.parentElement) if (a.contains(t) && a !== t) { from = a; break; }
        while (t.parentElement && t.parentElement !== from) t = t.parentElement;
        return t;
    }
    const containerAt = (x, y) => {
        let t = document.elementFromPoint(x, y);
        if (!t || isOverlay(t) || t === root) return document.body;
        while (t && t !== document.body && !CONTAINERS.has(t.tagName.toLowerCase())) t = t.parentElement;
        return t || document.body;
    };

    // ── Creating elements ───────────────────────────────────────────────────────────────────
    function createAt(kind, container, lx, ly, w, h) {
        const t = TEMPLATES[kind];
        const el = document.createElement(t.tag);
        el.className = t.cls;
        if (t.attrs) Object.keys(t.attrs).forEach((k) => el.setAttribute(k, t.attrs[k]));
        if (t.text) el.textContent = t.text;
        if (t.html) el.innerHTML = t.html;
        ensurePositioned(container);
        container.appendChild(el);
        markMade(el);
        el.style.position = "absolute";
        setPx(el, "left", lx);
        setPx(el, "top", ly);
        if (!t.auto || (w && h)) { setPx(el, "width", w || t.w); setPx(el, "height", h || t.h); }
        if (t.auto && !(w && h)) { /* keeps its natural size */ }
        return el;
    }

    function finishDraw(g, e) {
        draftBox.style.display = "none";
        const dragged = Math.abs(e.clientX - g.sx) > 4 || Math.abs(e.clientY - g.sy) > 4;
        const o = originOf(g.container);
        const x0 = Math.min(g.sx, e.clientX) + window.scrollX - o.x;
        const y0 = Math.min(g.sy, e.clientY) + window.scrollY - o.y;
        const w = Math.abs(e.clientX - g.sx), h = Math.abs(e.clientY - g.sy);
        const t = TEMPLATES[g.kind];
        if (g.kind === "line" || g.kind === "arrow") {
            // a line runs from where the drag began to where it ended: a box of that length, centred on the midpoint and turned to the angle
            const dx = dragged ? e.clientX - g.sx : t.w, dy = dragged ? e.clientY - g.sy : 0;
            const len = Math.max(8, Math.hypot(dx, dy));
            const mx = g.sx + dx / 2 + window.scrollX - o.x, my = g.sy + dy / 2 + window.scrollY - o.y;
            const line = createAt(g.kind, g.container, mx - len / 2, my - 1, len, 2);
            const deg = Math.round(Math.atan2(dy, dx) * 1800 / Math.PI) / 10;
            if (deg) { // the turn is a class like any other (rotate-45, rotate-[33.7deg]), not an inline style
                const step = [0, 1, 2, 3, 6, 12, 45, 90, 180].includes(Math.abs(deg));
                line.classList.add(step ? `${deg < 0 ? "-" : ""}rotate-${Math.abs(deg)}` : `rotate-[${deg}deg]`);
            }
            setSelection([line]);
            setTool("move");
            return askConvert([gestureItem(line, {}, ["position", "left", "top", "width", "height"])]);
        }
        const el = dragged && !(g.kind === "text" || g.kind === "button")
            ? createAt(g.kind, g.container, x0, y0, w, h)
            : createAt(g.kind, g.container, x0, y0);
        setSelection([el]);
        setTool("move");
        askConvert([gestureItem(el, {}, ["position", "left", "top", "width", "height"])]);
        if (t.text) startEdit(el, true);
    }

    // ── Inline editing ──────────────────────────────────────────────────────────────────────
    // what can hold typed words: never a picture, an icon or a control, which would take the words somewhere they don't show
    const NO_TEXT = /^(IMG|SVG|VIDEO|AUDIO|IFRAME|CANVAS|HR|BR|SELECT|PICTURE|OBJECT|EMBED)$/i;
    // a form field's words are its placeholder (or its value attribute when it has one and no placeholder): typed in the field itself
    const isField = (el) => /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|range|color|file|submit|button|image|reset|hidden)$/i.test(el.type || "");
    function startEdit(el, selectAll) {
        if (!el || el === document.body || NO_TEXT.test(el.tagName)) return;
        editing = el;
        if (isField(el)) {
            el.dataset.wcField = el.hasAttribute("placeholder") || !el.hasAttribute("value") ? "placeholder" : "value";
            el.value = el.getAttribute(el.dataset.wcField) || "";
            el.focus();
            el.select();
        } else {
            el.setAttribute("contenteditable", "true");
            el.focus();
            if (selectAll) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
        }
        redraw();
        postEditing();
    }
    /** No text left selected: a selection that outlives the edit shows as a grey band behind the words, as if they had a background. */
    const dropTextSelection = () => { const sel = getSelection(); if (sel && sel.rangeCount) sel.removeAllRanges(); };
    const fmtState = () => ({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline") });
    function postEditing() { post({ type: "editing", on: Boolean(editing), rect: editing ? pageRect(editing) : null, fmt: editing ? fmtState() : null }); }
    function finishEdit() {
        if (!editing) return;
        const el = editing;
        editing = null;
        if (el.dataset.wcField) { // the field's words go back into its attribute; what was typed in the live field is not part of the page
            const attr = el.dataset.wcField, v = el.value;
            delete el.dataset.wcField;
            if (v) el.setAttribute(attr, v); else el.removeAttribute(attr);
            if (attr === "placeholder") el.value = "";
        } else {
            el.removeAttribute("contenteditable");
            if (el.innerHTML === "<br>") el.innerHTML = ""; // all the words deleted: the browser leaves a line break behind
        }
        tidyStyle(el);
        dropTextSelection();
        if (el.blur) el.blur();
        postEditing();
        changed();
    }

    // ── Snapping ────────────────────────────────────────────────────────────────────────────
    // ── Smart guides ────────────────────────────────────────────────────────────────────────
    // Everything is in page coordinates. A moving box snaps to the edges and centres of EVERY box around it (not just its siblings),
    // the lines that lined up are drawn only as far as the boxes involved, and the gaps to the neighbours are measured.
    const GUIDE_SKIP = new Set(["SCRIPT", "STYLE", "BR", "TEMPLATE", "HEAD", "META", "LINK"]);
    function targetsFor(exclude) {
        const out = [];
        document.body.querySelectorAll("*").forEach((n) => {
            if (isOverlay(n) || GUIDE_SKIP.has(n.tagName) || exclude.some((x) => x === n || x.contains(n))) return;
            const r = pageRect(n);
            if (r.w >= 1 && r.h >= 1) out.push(r);
        });
        out.push({ x: 0, y: 0, w: Math.max(root.scrollWidth, innerWidth), h: Math.max(root.scrollHeight, innerHeight) });
        return out;
    }
    const three = (a, len) => [a, a + len / 2, a + len];
    /** The smallest move that puts one of `vals` on one of the targets' lines, or null when nothing is close enough. */
    function nearestLine(vals, lineSets, t) {
        let best = null;
        vals.forEach((v) => lineSets.forEach((set) => set.forEach((c) => { const d = c - v; if (Math.abs(d) <= t && (best === null || Math.abs(d) < Math.abs(best))) best = d; })));
        return best;
    }
    const cross = (x, y) => guideLayer.appendChild(mk(`position:absolute;left:${x}px;top:${y}px;width:${px(9)}px;height:${px(1)}px;background:${RED};transform:translate(-50%,-50%) rotate(45deg);`)) && guideLayer.appendChild(mk(`position:absolute;left:${x}px;top:${y}px;width:${px(9)}px;height:${px(1)}px;background:${RED};transform:translate(-50%,-50%) rotate(-45deg);`));
    function chip(x, y, text) {
        const c = mk(`position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);background:${RED};color:#fff;font:600 ${px(11)}px/1 system-ui,sans-serif;padding:${px(3)}px ${px(6)}px;border-radius:${px(4)}px;white-space:nowrap;`);
        c.textContent = text;
        guideLayer.appendChild(c);
    }
    /** A measured gap: a line between two edges with end ticks and the distance in a red chip. axis "x" runs left to right at height `at`. */
    function drawGap(axis, from, to, at) {
        const len = to - from;
        if (len < 1) return;
        const line = axis === "x" ? `left:${from}px;top:${at}px;width:${len}px;height:${px(1)}px;` : `left:${at}px;top:${from}px;width:${px(1)}px;height:${len}px;`;
        guideLayer.appendChild(mk(`position:absolute;${line}background:${RED};`));
        [from, to].forEach((v) => guideLayer.appendChild(mk(axis === "x"
            ? `position:absolute;left:${v}px;top:${at - px(4)}px;width:${px(1)}px;height:${px(9)}px;background:${RED};`
            : `position:absolute;left:${at - px(4)}px;top:${v}px;width:${px(9)}px;height:${px(1)}px;background:${RED};`)));
        axis === "x" ? chip(from + len / 2, at - px(11), String(Math.round(len))) : chip(at + px(14), from + len / 2, String(Math.round(len)));
    }
    /** The nearest box on each side that overlaps `box` in the other direction. */
    function neighbours(box, targets) {
        const n = { left: null, right: null, up: null, down: null };
        const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
        targets.forEach((r) => {
            if (ov(r.y, r.y + r.h, box.y, box.y + box.h) > 0) {
                if (r.x + r.w <= box.x + 0.5 && (!n.left || r.x + r.w > n.left.x + n.left.w)) n.left = r;
                if (r.x >= box.x + box.w - 0.5 && (!n.right || r.x < n.right.x)) n.right = r;
            }
            if (ov(r.x, r.x + r.w, box.x, box.x + box.w) > 0) {
                if (r.y + r.h <= box.y + 0.5 && (!n.up || r.y + r.h > n.up.y + n.up.h)) n.up = r;
                if (r.y >= box.y + box.h - 0.5 && (!n.down || r.y < n.down.y)) n.down = r;
            }
        });
        return n;
    }
    const mid = (a0, a1, b0, b1) => (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
    const gapBetween = (side, a, b) => (side === "left" ? a.x - (b.x + b.w) : side === "right" ? b.x - (a.x + a.w) : side === "up" ? a.y - (b.y + b.h) : b.y - (a.y + a.h));
    /** Beyond the first neighbour: the next boxes in the same direction that sit the same distance apart, so a whole evenly spaced row shows its gaps. */
    function chainGaps(side, first, d, targets) {
        const out = [];
        let cur = first;
        for (let i = 0; i < 12; i++) {
            const nb = neighbours(cur, targets)[side];
            if (!nb || Math.abs(gapBetween(side, cur, nb) - d) > 0.6) break;
            const horizontal = side === "left" || side === "right";
            const [a, b] = side === "left" || side === "up" ? [nb, cur] : [cur, nb];
            out.push(horizontal
                ? { axis: "x", from: a.x + a.w, to: b.x, at: mid(nb.y, nb.y + nb.h, cur.y, cur.y + cur.h) }
                : { axis: "y", from: a.y + a.h, to: b.y, at: mid(nb.x, nb.x + nb.w, cur.x, cur.x + cur.w) });
            cur = nb;
        }
        return out;
    }
    /** Draw what the box lined up with (only the lines in `keysX` / `keysY`, 0 = start, 1 = centre, 2 = end) and the gaps worth showing. */
    function showGuides(box, targets, keysX, keysY, measure, want = []) {
        guideLayer.innerHTML = "";
        const near = (a, b) => Math.abs(a - b) < 0.6;
        [["x", keysX], ["y", keysY]].forEach(([axis, keys]) => {
            const seen = [];
            keys.forEach((k) => {
                const v = axis === "x" ? three(box.x, box.w)[k] : three(box.y, box.h)[k];
                if (seen.some((p) => near(p, v))) return;
                const parts = targets.map((r) => { const ls = axis === "x" ? three(r.x, r.w) : three(r.y, r.h); const j = ls.findIndex((l) => near(l, v)); return j < 0 ? null : { r, j }; }).filter(Boolean);
                if (!parts.length) return;
                seen.push(v);
                const rs = [box, ...parts.map((p) => p.r)];
                const lo = Math.min(...rs.map((r) => (axis === "x" ? r.y : r.x))), hi = Math.max(...rs.map((r) => (axis === "x" ? r.y + r.h : r.x + r.w)));
                guideLayer.appendChild(mk(axis === "x"
                    ? `position:absolute;left:${v}px;top:${lo}px;width:${px(1)}px;height:${hi - lo}px;background:${RED};`
                    : `position:absolute;top:${v}px;left:${lo}px;height:${px(1)}px;width:${hi - lo}px;background:${RED};`));
                // an x on the box and on the two boxes at the far ends of the line (not on every box in between), at their corners or middles
                const far = [parts.reduce((m, p) => ((axis === "x" ? p.r.y : p.r.x) < (axis === "x" ? m.r.y : m.r.x) ? p : m), parts[0]), parts.reduce((m, p) => ((axis === "x" ? p.r.y + p.r.h : p.r.x + p.r.w) > (axis === "x" ? m.r.y + m.r.h : m.r.x + m.r.w) ? p : m), parts[0])];
                [{ r: box, j: k }, ...far.filter((p, i) => far.indexOf(p) === i)].forEach(({ r, j }) => {
                    const a0 = axis === "x" ? r.y : r.x, a1 = axis === "x" ? r.y + r.h : r.x + r.w;
                    (j === 1 ? [(a0 + a1) / 2] : [a0, a1]).forEach((a) => (axis === "x" ? cross(v, a) : cross(a, v)));
                });
            });
        });
        // gaps: equal spacing between two neighbours is always shown; with Alt, the distance to the nearest box on every side
        const n = neighbours(box, targets);
        const gx = n.left && n.right ? [box.x - (n.left.x + n.left.w), n.right.x - (box.x + box.w)] : null;
        const gy = n.up && n.down ? [box.y - (n.up.y + n.up.h), n.down.y - (box.y + box.h)] : null;
        const eqX = gx && near(gx[0], gx[1]), eqY = gy && near(gy[0], gy[1]);
        // Distances show: with Alt, whenever the box has lined up with something (so you see how far it is from its neighbours), and for equal spacing
        const lined = guideLayer.children.length > 0;
        // `want`: the sides along the direction being moved or resized always get their distance to the neighbouring box
        const sides = measure || lined ? ["left", "right", "up", "down"] : [...new Set([...want, ...(eqX ? ["left", "right"] : []), ...(eqY ? ["up", "down"] : [])])];
        sides.forEach((side) => {
            const r = n[side];
            if (!r) return;
            chainGaps(side, r, gapBetween(side, box, r), targets).forEach((c) => drawGap(c.axis, c.from, c.to, c.at));
            if (side === "left") drawGap("x", r.x + r.w, box.x, mid(r.y, r.y + r.h, box.y, box.y + box.h));
            if (side === "right") drawGap("x", box.x + box.w, r.x, mid(r.y, r.y + r.h, box.y, box.y + box.h));
            if (side === "up") drawGap("y", r.y + r.h, box.y, mid(r.x, r.x + r.w, box.x, box.x + box.w));
            if (side === "down") drawGap("y", box.y + box.h, r.y, mid(r.x, r.x + r.w, box.x, box.x + box.w));
        });
    }
    /** How far to nudge `box` along each axis so it lines up with the boxes around it, or sits an equal distance between two of them. */
    function snapDelta(box, targets, keysX, keysY) {
        const t = px(6);
        const aX = nearestLine(keysX.map((k) => three(box.x, box.w)[k]), targets.map((r) => three(r.x, r.w)), t);
        const aY = nearestLine(keysY.map((k) => three(box.y, box.h)[k]), targets.map((r) => three(r.y, r.h)), t);
        const n = neighbours(box, targets);
        // spacing candidates: an equal distance from the two neighbours either side, or the same distance from a neighbour as that neighbour
        // sits from the box beyond it (an evenly spaced row stays even)
        const likeBeyond = (first, side, boxStart, boxEnd) => {
            if (!first) return null;
            const beyond = neighbours(first, targets)[side];
            if (!beyond) return null;
            const g0 = gapBetween(side, first, beyond);
            if (g0 < 1) return null;
            return side === "left" ? first.x + first.w + g0 - boxStart : side === "right" ? first.x - g0 - boxEnd : side === "up" ? first.y + first.h + g0 - boxStart : first.y - g0 - boxEnd;
        };
        const between = (a, b, boxStart, boxEnd, aEnd, bStart) => (a && b ? ((bStart - boxEnd) - (boxStart - aEnd)) / 2 : null);
        const near = (list) => list.filter((d) => d !== null && Math.abs(d) <= t).sort((p, q) => Math.abs(p) - Math.abs(q))[0];
        const gX = near([between(n.left, n.right, box.x, box.x + box.w, n.left && n.left.x + n.left.w, n.right && n.right.x), likeBeyond(n.left, "left", box.x, box.x + box.w), likeBeyond(n.right, "right", box.x, box.x + box.w)]);
        const gY = near([between(n.up, n.down, box.y, box.y + box.h, n.up && n.up.y + n.up.h, n.down && n.down.y), likeBeyond(n.up, "up", box.y, box.y + box.h), likeBeyond(n.down, "down", box.y, box.y + box.h)]);
        // an exact gap wins over an edge that is about as close: the spacing is the thing that is hard to eyeball
        const choose = (align, gap) => (gap !== undefined && (align === null || Math.abs(gap) <= Math.abs(align) + px(4)) ? gap : align);
        return { dx: choose(aX, gX), dy: choose(aY, gY) }; // null on an axis where nothing was close enough
    }

    // ── Gestures ────────────────────────────────────────────────────────────────────────────
    function startMove(e, all) {
        const items = all.filter((el) => !isLocked(el)); // a locked element stays where it is
        if (!items.length) return;
        const abs = items.filter(isAbs);
        // Alt-drag on an element in the page flow places it freely: it turns absolute (where it is) on the first movement, so an
        // Alt-click alone changes nothing
        if (!abs.length && e.altKey && items[0] && items[0] !== document.body && items[0].parentElement) {
            gesture = { type: "move", freeOnMove: items[0], items: [], sx: e.clientX, sy: e.clientY, moved: false, container: items[0].parentElement };
            return;
        }
        if (abs.length) {
            gesture = { type: "move", items: abs.map((el) => ({ el, g: geomOf(el), pre: sourcesOf(el, ["left", "top"]) })), sx: e.clientX, sy: e.clientY, moved: false, container: abs[0].parentElement || document.body };
        } else {
            gesture = { type: "reorder", el: items[0], rect: pageRect(items[0]), sx: e.clientX, sy: e.clientY, moved: false, before: null };
        }
    }

    function moveGesture(g, e) {
        if (g.freeOnMove) {
            const el = g.freeOnMove;
            g.freeOnMove = null;
            const pre = sourcesOf(el, FREE_PROPS);
            freePosition(el, true);
            g.items = [{ el, g: geomOf(el), pre }];
            g.container = el.parentElement;
            g.freed = true;
            setSelection([el], true);
        }
        let dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const o = originOf(g.container);
        if (!g.targets) g.targets = targetsFor(g.items.map((i) => i.el));
        const x0 = Math.min(...g.items.map((i) => i.g.x)) + dx, y0 = Math.min(...g.items.map((i) => i.g.y)) + dy;
        const x1 = Math.max(...g.items.map((i) => i.g.x + i.g.w)) + dx, y1 = Math.max(...g.items.map((i) => i.g.y + i.g.h)) + dy;
        const box = { x: x0 + o.x, y: y0 + o.y, w: x1 - x0, h: y1 - y0 };
        const measure = g.freed ? e.metaKey : e.altKey || e.metaKey; // Alt: no snapping, just the distances (an Alt-drag that freed the element: Cmd)
        const s = measure ? { dx: null, dy: null } : snapDelta(box, g.targets, [0, 1, 2], [0, 1, 2]);
        // Snaps are sticky: once locked on a line (a centre, an edge, an equal gap) the box stays there until the pointer has moved a
        // clear distance past it, then it lets go. So it moves in steps from line to line, not smoothly through them.
        g.hold = g.hold || { x: null, y: null };
        const release = px(4);
        if (measure) g.hold = { x: null, y: null };
        [["x", "dx"], ["y", "dy"]].forEach(([a, d]) => {
            const h = g.hold[a], fresh = s[d];
            // keep the line it is on only while it is close, and never over another line that is nearer to the pointer
            if (h !== null && Math.abs(box[a] - h) <= release && (fresh === null || Math.abs(fresh) >= Math.abs(box[a] - h))) s[d] = h - box[a];
            else g.hold[a] = fresh === null ? null : box[a] + fresh;
        });
        s.dx = s.dx || 0; s.dy = s.dy || 0;
        box.x += s.dx; box.y += s.dy;
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const want = ax > 2 * ay ? ["left", "right"] : ay > 2 * ax ? ["up", "down"] : ["left", "right", "up", "down"]; // the axis it is moving along
        showGuides(box, g.targets, [0, 1, 2], [0, 1, 2], measure, want);
        g.items.forEach((i) => { setPx(i.el, "left", i.g.x + dx + s.dx); setPx(i.el, "top", i.g.y + dy + s.dy); });
    }

    /** How a box lays out its children: "grid", "flex row", "flex column" or "page flow". */
    const layoutOf = (c) => {
        const cs = getComputedStyle(c);
        if (cs.display.includes("grid")) return "grid";
        if (cs.display.includes("flex")) return cs.flexDirection.startsWith("row") ? "flex row" : "flex column";
        return "page flow";
    };
    const kidsOf = (c, skip) => Array.prototype.filter.call(c.children, (k) => k !== skip && !["SCRIPT", "STYLE"].includes(k.tagName) && !(k.hasAttribute && k.hasAttribute("data-wc-agent-style")));
    // tags that are not boxes on the page
    const NOT_BOXES = new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "BR"]);
    // ── Where a drop goes: the targeting model ──────────────────────────────────────────────────────────────
    // Read on the page as it was when the drag started (the boxes do not move under the pointer while the others slide apart), in three
    // steps that never mix: which box (relation to the element, and what a box can hold), what the drop means, then the slot.
    //  1. Does the element leave its box? Decided at its own box's level: over its own box, or within the gutter around it, it stays;
    //     over a direct sibling, in the sibling's outer 30% along the box's direction, it goes beside the sibling; in its middle, into
    //     it (or into the deepest box there that can hold the element); a sibling that can hold nothing is gone beside. In a grid a
    //     sibling cell is a place: the element takes it.
    //  2. Out of its box (past the gutter): into the deepest box under the pointer that can hold the element. A box's edge is not a
    //     reason to go beside it there: the space between boxes belongs to the box around them, and the slot step puts it in between.
    //  3. The slot in the chosen box, from its children as they stood (the element left out); the exact middle by reading order.
    // What a box can hold is read from HTML and layout, not from a list of tags: a list holds only items, a table only rows and cells,
    // text tags only text-level elements, a link or button no other control; a replaced element nothing; a box of running text is not
    // dropped into; an empty box only holds what fits in it; a wrapper (its one child fills it and can hold nothing) is passed through.
    const T_BAND = 0.3, T_GUTTER = 24, T_FILL = 0.9;
    const T_VOID = /^(img|input|br|hr|meta|link|source|track|wbr|area|col|embed|param|video|audio|canvas|svg|iframe|select|textarea|picture|path|g|circle|rect|line|polyline|polygon|use|ellipse|text)$/;
    const T_PHRASING = /^(span|a|img|svg|button|strong|em|b|i|u|s|small|label|input|code|abbr|time|mark|sub|sup|kbd|select|textarea|picture|video|audio|canvas|br|wbr|q|cite|dfn|var|samp|data|output|meter|progress)$/;
    const T_INTERACTIVE = /^(a|button|input|select|textarea|label|details|iframe|video|audio)$/;
    const T_PHRASING_ONLY = /^(p|h[1-6]|span|button|label|strong|em|b|i|u|s|small|code|abbr|q|cite|sub|sup|mark|time|kbd|samp|var|dfn|legend|summary|pre)$/;
    const T_BOX = /^(block|flex|inline-flex|grid|inline-grid|flow-root|list-item|table-cell|inline-block)$/;
    /** The direction a box lays out its children: row, column or grid (text flow reads as a row). */
    function boxAxis(n) {
        const cs = getComputedStyle(n);
        if (cs.display.includes("grid")) return "grid";
        if (cs.display.includes("flex")) return cs.flexDirection.startsWith("column") ? "column" : "row";
        if (cs.display === "table-row") return "row";
        const kids = [...n.children].filter((k) => !NOT_BOXES.has(k.tagName) && getComputedStyle(k).display !== "none");
        return kids.length && kids.every((k) => /^inline/.test(getComputedStyle(k).display)) ? "row" : "column";
    }
    /** HTML and layout allow `n` to hold the element at all. */
    function canContain(n, el) {
        const t = n.tagName.toLowerCase(), d = el.tagName.toLowerCase(), disp = getComputedStyle(n).display;
        if (T_VOID.test(t) || n.closest("svg")) return false;
        if (disp === "none" || disp === "contents") return false;
        if (/^(ul|ol|menu)$/.test(t)) return d === "li";
        if (/^(table|thead|tbody|tfoot)$/.test(t)) return /^(tr|thead|tbody|tfoot|caption|colgroup)$/.test(d);
        if (t === "tr") return /^(td|th)$/.test(d);
        if (T_PHRASING_ONLY.test(t) && !T_PHRASING.test(d)) return false;
        if ((t === "a" || t === "button" || n.closest("a,button")) && (T_INTERACTIVE.test(d) || el.querySelector("a,button,input,select,textarea"))) return false;
        return true;
    }
    /** `n` is a place this drag may put the element (its own box always is). `geo` gives the start-of-drag boxes. */
    function canReceive(n, el, geo) {
        if (n === geo.home) return true;
        if (n === el || el.contains(n) || n === root || !staysInGroup(el, n) || !canContain(n, el)) return false;
        const kids = [...n.children].filter((k) => k !== el && !NOT_BOXES.has(k.tagName) && !isOverlay(k) && !(k.hasAttribute && k.hasAttribute("data-wc-agent-style")));
        const ownText = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
        if (!kids.length && ownText) return false; // a box of running text
        if (!T_BOX.test(getComputedStyle(n).display) && n !== document.body) return false;
        if (!kids.length && !ownText) { const r = geo.rect(n), e0 = geo.el; if (r && (r.w < e0.w || r.h < e0.h)) return false; } // empty: only what fits
        return true;
    }
    const canGoBeside = (n) => !isAbs(n) && !/^(none|contents)$/.test(getComputedStyle(n).display);
    /** The page as it was when the drag started: every box's rect (the element itself left out), read once. */
    function startGeometry(el) {
        const rects = new Map(), order = [];
        const walk = (n, depth) => { for (const k of n.children) { if (k === el || NOT_BOXES.has(k.tagName) || isOverlay(k) || (k.hasAttribute && k.hasAttribute("data-wc-agent-style"))) continue; const cs = getComputedStyle(k); if (cs.display === "none") continue; const r = pageRect(k); if (r.w > 0 && r.h > 0 && cs.visibility !== "hidden") { rects.set(k, r); order.push({ k, depth }); } if (!(k.closest("svg") && k.tagName.toLowerCase() !== "svg")) walk(k, depth + 1); } };
        walk(document.body, 1);
        const er = pageRect(el);
        return { home: el.parentElement, rects, order, el: er, rect: (n) => rects.get(n) || (n === document.body ? { x: 0, y: 0, w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight } : null) };
    }
    /** The boxes under a page point on the start-of-drag page, deepest first, up to the page. */
    function startChain(geo, x, y) {
        let hit = null, bd = -1;
        geo.order.forEach(({ k, depth }) => { const r = geo.rects.get(k); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && depth >= bd) { hit = k; bd = depth; } });
        const out = [];
        for (let n = hit || document.body; n && n !== document.documentElement; n = n.parentElement) out.push(n);
        return out;
    }
    /** The slot in `c` for a page point, from its children as they stood (the element left out): before which child, or at the end. */
    function startSlot(geo, el, c, x, y) {
        const kids = kidsOf(c, el).filter(inFlow).filter((k) => geo.rects.has(k));
        const ax = boxAxis(c);
        if (!kids.length) return { container: c, ref: null, horizontal: ax === "row" };
        const before = kids.find((k) => { const r = geo.rects.get(k), cx = r.x + r.w / 2, cy = r.y + r.h / 2; return ax === "grid" ? r.y > y || (y <= r.y + r.h && cx > x) : ax === "row" ? cx > x : cy > y; });
        return before ? { container: c, ref: before, before: true, horizontal: ax !== "column" } : { container: c, ref: kids[kids.length - 1], before: false, horizontal: ax !== "column" };
    }
    /** Where a drop at client point (cx, cy) goes: { container, ref, before, horizontal, why } (stay: true keeps it where it is). */
    function targetAt(g, cx, cy) {
        const el = g.el, geo = g.geo || (g.geo = startGeometry(el)), par = geo.home;
        const x = cx + window.scrollX, y = cy + window.scrollY;
        const S = startChain(geo, x, y), e0 = geo.el;
        const frac = (n) => { const r = geo.rect(n); return r && r.w && r.h ? [(x - r.x) / r.w, (y - r.y) / r.h] : null; };
        const inside = (f) => f && f[0] >= 0 && f[0] <= 1 && f[1] >= 0 && f[1] <= 1;
        // reading order of a box against the element (start rects): "after" when it comes later
        const readsAfter = (n) => { const r = geo.rect(n); if (!r) return true; const ecy = e0.y + e0.h / 2, ncy = r.y + r.h / 2; return Math.abs(ncy - ecy) < Math.min(e0.h, r.h) / 2 ? r.x + r.w / 2 > e0.x + e0.w / 2 : ncy > ecy; };
        const sideOf = (n, axis) => { const f = frac(n), i = axis === "row" ? 0 : 1, r = geo.rect(n), size = r ? (i ? r.h : r.w) : 100; return Math.abs(f[i] - 0.5) * size < 1 ? readsAfter(n) : f[i] > 0.5; };
        const stay = (why) => ({ container: par, ref: null, stay: true, why });
        const beside = (n, c, after, why) => (canGoBeside(n) ? { container: c, ref: n, before: !after, horizontal: boxAxis(c) !== "column", why } : stay(`${why}, but it is out of the flow: stays`));
        const wrapper = (w, kid) => { if (!kid) return false; const kids = kidsOf(w, el).filter(inFlow), rw = geo.rect(w), rk = geo.rect(kid); return kids.length === 1 && kids[0] === kid && rw && rk && rk.w >= T_FILL * rw.w && rk.h >= T_FILL * rw.h && !canReceive(kid, el, geo); };
        // the deepest box in a branch (top-down list) under the pointer that can hold the element
        const deepest = (branch) => { for (let i = branch.length - 1; i >= 0; i--) { const n = branch[i]; if (inside(frac(n)) && canReceive(n, el, geo) && !wrapper(n, branch[i + 1])) return n; } return null; };
        const into = (n, why) => ({ ...startSlot(geo, el, n, x, y), why });
        const iOwn = S.indexOf(par);
        if (iOwn >= 0) {
            const branch = S.slice(0, iOwn).reverse();
            if (!branch.length) return { ...into(par, "over its own box: a slot in it"), open: true }; // (open space in its own box: placed freely)
            const D = branch[0], f = frac(D), axis = boxAxis(par);
            if (!inside(f)) return stay("the pointer is outside the box under it");
            if (axis === "grid") {
                const inner = deepest(branch.slice(1)), mid = Math.min(f[0], f[1], 1 - f[0], 1 - f[1]) >= T_BAND;
                if (inner && mid && canReceive(D, el, geo)) return into(inner, "middle of a cell, over a box that can hold it: into it");
                return beside(D, par, readsAfter(D), "over a cell of its grid: takes its place");
            }
            const along = axis === "row" ? f[0] : f[1];
            if (along < T_BAND || along > 1 - T_BAND) return beside(D, par, along > 0.5, "near a sibling's side: beside it");
            const X = deepest(branch);
            if (X) return into(X, X === D ? "middle of a sibling: into it" : "middle of a sibling: into the box there that can hold it");
            return beside(D, par, sideOf(D, axis), "middle of a sibling that holds nothing: beside it");
        }
        const pr = geo.rect(par) || pageRect(par);
        const out = Math.max(pr.x - x, x - pr.x - pr.w, pr.y - y, y - pr.y - pr.h, 0);
        if (out <= px(T_GUTTER)) return into(par, "just outside its box (gutter): stays in it");
        const iA = S.findIndex((n) => n.contains(par));
        if (iA < 0) return stay("no box around it under the pointer");
        const A = S[iA], branch = S.slice(0, iA).reverse();
        if (!branch.length) return canReceive(A, el, geo) ? into(A, "over a box around it: into it") : stay("over a box around it that cannot hold it");
        const X = deepest(branch);
        if (X) return into(X, "into the deepest box under the pointer that can hold it");
        const top = branch[0];
        return canReceive(A, el, geo) && inside(frac(top)) ? beside(top, A, sideOf(top, boxAxis(A) === "column" ? "column" : "row"), "nothing under the pointer can hold it: beside it") : stay("nothing under the pointer can hold it");
    }

    // ── Leaving the box: the ghost drag ────────────────────────────────────────────────────────────────────────────────
    // Inside the box it came from, an element is dragged as in reorderGesture (it follows the pointer, the others slide, guides and
    // distances). Once the drag leaves that box (what targetAt says), it goes on as this: a copy of the element (the ghost) follows
    // the pointer anywhere, to the pixel, and the editor keeps asking what the drag means in HTML: a short list of real edits (put it at another place among its siblings, into another box, aligned in its box,
    // pushed to the end), each one tried on the live page and measured by the browser itself. The one that puts the element closest
    // to the ghost, without needless classes, is shown: the element itself sits there (faded, outlined), its neighbours have made
    // room, and a label says what it is. Letting go keeps exactly that. Tab tries the next option, Esc puts everything back.
    // Nothing is a pixel offset. Coming back into its box hands the drag back to reorderGesture.
    const INTENT_PROPS = ["align-self", "justify-self", "margin-left", "margin-right", "margin-top", "margin-bottom"];
    const landBox = mk(`position:absolute;display:none;pointer-events:none;box-sizing:border-box;background:rgba(59,130,246,.10);`);
    overlay.append(landBox);
    const ORD = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
    function intentStart(g) {
        const el = g.el, par = el.parentElement;
        const flow = kidsOf(par, null).filter(inFlow);
        g.ih = { parent: par, next: el.nextSibling, index: flow.indexOf(el), inl: inlineOf(el, INTENT_PROPS), opacity: el.style.getPropertyValue("opacity"), first: flow[0] === el, last: flow[flow.length - 1] === el };
        g.ipre = sourcesOf(el, INTENT_PROPS);
        g.icache = new Map();
        g.ipick = 0;
        g.irank = [];
        g.ishown = null;
        const r = g.rect, cs = getComputedStyle(el);
        // the ghost: a copy that keeps the element's look (its inherited text style too) and floats above the page
        const ghost = el.cloneNode(true);
        ghost.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
        ["color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform"].forEach((p) => ghost.style.setProperty(p, cs.getPropertyValue(p)));
        Object.assign(ghost.style, { position: "absolute", left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, margin: "0", boxSizing: "border-box", pointerEvents: "none", opacity: "0.92", zIndex: "2", transformOrigin: "center", transform: "rotate(1.2deg)" });
        ghost.style.setProperty("box-shadow", `0 ${px(14)}px ${px(34)}px rgba(0,0,0,.22), 0 0 0 ${px(1)}px rgba(0,0,0,.08)`);
        overlay.appendChild(ghost);
        g.igh = ghost;
        el.style.setProperty("opacity", "0.35"); // the element itself becomes the landing shadow
    }
    /** Put the element back exactly where it was, as it was. */
    function intentHome(g) {
        const el = g.el, h = g.ih;
        if (h.next && h.next.parentElement === h.parent) h.parent.insertBefore(el, h.next); else h.parent.appendChild(el);
        intentAlign(g, null);
    }
    /** The element's own alignment values back as they were, then `align` ({ prop: value }) over them. */
    function intentAlign(g, align) {
        INTENT_PROPS.forEach((p) => { if (g.ih.inl[p]) g.el.style.setProperty(p, g.ih.inl[p]); else g.el.style.removeProperty(p); });
        if (align) Object.entries(align).forEach(([p, v]) => g.el.style.setProperty(p, v));
    }
    /**
     * In another box, the margins the element brought along go where the drop takes them off (dropSmart): a gap already spaces that
     * box's children, so the preview shows it without them, as it will be.
     */
    function marginsFor(g, c) {
        if (c === g.ih.parent) return null;
        const lay = layoutOf(c), cs = getComputedStyle(c), f = (v) => parseFloat(v) || 0, out = {};
        if (lay !== "page flow" && lay !== "flex row" && f(cs.rowGap) > 0) Object.assign(out, { "margin-top": "0px", "margin-bottom": "0px" });
        if (lay !== "page flow" && lay !== "flex column" && f(cs.columnGap) > 0) Object.assign(out, { "margin-left": "0px", "margin-right": "0px" });
        return Object.keys(out).length ? out : null;
    }
    /** Put the element where a candidate says (the n-th in-flow child of `c`, aligned so). */
    function intentApply(g, cand) {
        const el = g.el, sibs = kidsOf(cand.c, el).filter(inFlow), ref = sibs[cand.i] || null;
        if (ref) cand.c.insertBefore(el, ref);
        else if (sibs.length) sibs[sibs.length - 1].after(el);
        else cand.c.insertBefore(el, cand.c.firstChild);
        const fix = marginsFor(g, cand.c);
        intentAlign(g, fix || cand.align ? { ...(fix || {}), ...(cand.align || {}) } : null);
    }
    const candKey = (c) => `${pathOf(c.c).join(".")}|${c.i}|${c.align ? JSON.stringify(c.align) : ""}`;
    /** Where the candidate really puts the element: tried on the page and measured (once: the page does not change while dragging). */
    function intentMeasure(g, cand) {
        const k = candKey(cand);
        if (g.icache.has(k)) return g.icache.get(k);
        intentApply(g, cand);
        const r = pageRect(g.el);
        // where it lands, seen from the neighbour it lands beside (or its box), as that neighbour stood before the drag: taking the
        // element out of its old place shifts what comes after it, and that shift must not count against a place further down the page
        const sibs = kidsOf(cand.c, g.el).filter(inFlow), anchor = sibs[cand.i - 1] || sibs[cand.i] || cand.c;
        const a1 = pageRect(anchor), a0 = g.iorig.get(anchor) || a1;
        const ecs = getComputedStyle(g.el);
        const m = { x: r.x - a1.x + a0.x, y: r.y - a1.y + a0.y, w: r.w, h: r.h, real: r, ml: parseFloat(ecs.marginLeft) || 0, mt: parseFloat(ecs.marginTop) || 0 };
        g.icache.set(k, m);
        return m;
    }
    /** The alignments worth trying for an element in `c`: only ones that can move it (it is narrower than its room, the box lays out that way). */
    function alignsFor(g, c) {
        const lay = layoutOf(c), out = [];
        if (lay === "flex row") out.push({ "align-self": "flex-start" }, { "align-self": "center" }, { "align-self": "flex-end" }, { "margin-left": "auto" });
        else if (lay === "flex column") out.push({ "align-self": "flex-start" }, { "align-self": "center" }, { "align-self": "flex-end" }, { "margin-top": "auto" });
        else if (lay === "grid") out.push({ "justify-self": "start" }, { "justify-self": "center" }, { "justify-self": "end" }, { "align-self": "start" }, { "align-self": "center" }, { "align-self": "end" });
        else if (getComputedStyle(g.el).display.startsWith("block")) out.push({ "margin-left": "0px", "margin-right": "0px" }, { "margin-left": "auto", "margin-right": "auto" }, { "margin-left": "auto", "margin-right": "0px" });
        return out;
    }
    /** The boxes the drop could go into, best first: the one targetAt chose, the box around it that can hold the element, where it came from. */
    function intentBoxes(g, e) {
        const t = targetAt(g, e.clientX, e.clientY), out = [];
        const add = (c) => { if (c && c !== root && !out.includes(c)) out.push(c); };
        add(t.container);
        for (let up = t.container.parentElement; up && up !== root && out.length < 2; up = up.parentElement) if (canReceive(up, g.el, g.geo)) add(up);
        add(g.ih.parent);
        return out.slice(0, 3);
    }
    /** The index among `c`'s in-flow children (without the element) the pointer is at, on the page as it stood when the drag began. */
    function nearestSlot(g, c, x, y) {
        const sibs = kidsOf(c, g.el).filter(inFlow), s = startSlot(g.geo, g.el, c, x, y);
        if (!s.ref) return sibs.length ? sibs.length : 0;
        const i = sibs.indexOf(s.ref);
        return i < 0 ? sibs.length : s.before ? i : i + 1;
    }
    /** Every candidate for this pointer position, measured and scored (lower is better), best first. */
    function intentRank(g, e) {
        const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        const gx = g.rect.x + dx + g.rect.w / 2, gy = g.rect.y + dy + g.rect.h / 2; // the ghost's centre, in the page
        const px0 = e.clientX + window.scrollX, py0 = e.clientY + window.scrollY;
        const score = (r, extra) => Math.hypot(r.x + r.w / 2 - gx, r.y + r.h / 2 - gy) + extra;
        // What the pointer is over is read on the page as it was before the drag (the element at home), not on the preview: the
        // preview moves things (a box below the element's old place moves up when it leaves), and reading that would change the preview again.
        intentHome(g);
        const places = intentBoxes(g, e).map((c) => ({ c, n: kidsOf(c, g.el).filter(inFlow).length, i0: nearestSlot(g, c, px0, py0) }));
        // the page as it was, for the boxes and children that could be landed beside (see intentMeasure)
        g.iorig = g.iorig || new Map();
        places.forEach(({ c }) => [c, ...kidsOf(c, g.el).filter(inFlow)].forEach((k) => { if (!g.iorig.has(k)) g.iorig.set(k, pageRect(k)); }));
        const all = [];
        places.forEach(({ c, n, i0 }, depth) => {
            // the box is the targeting model's choice (the first); the others are there for Tab, never picked over it
            const moved = depth ? px(400) : 0;
            [i0 - 1, i0, i0 + 1].filter((i) => i >= 0 && i <= n).forEach((i) => {
                const cand = { c, i, align: null };
                cand.r = intentMeasure(g, cand);
                // the slot the pointer is in (past a neighbour's middle is after it) is the one: distance only chooses between boxes and alignments
                cand.s = score(cand.r, moved) + (i === i0 ? 0 : px(400)); // the neighbouring slots: there for Tab, never picked over the pointer's
                all.push(cand);
            });
        });
        all.sort((p, q) => p.s - q.s);
        // alignments, for the best two places only (each is a layout to measure)
        const keeps = (r) => Math.abs(r.w - g.rect.w) <= 1.5 && Math.abs(r.h - g.rect.h) <= 1.5;
        if (!e.metaKey) all.slice(0, 2).forEach((base) => {
            // in another box its new row or column may stretch it (a button that was as tall as its text, as tall as the row): it keeps
            // the size it had unless it was stretched before, and the ghost's height says where in the row it sits (top, middle, bottom)
            const stretched = base.c !== g.ih.parent && !keeps(base.r);
            alignsFor(g, base.c).forEach((align) => {
                const cand = { c: base.c, i: base.i, align };
                cand.r = intentMeasure(g, cand);
                if ((align["margin-left"] === "auto" && align["margin-right"] !== "auto" && cand.r.ml < 1) || (align["margin-top"] === "auto" && cand.r.mt < 1)) return; // no room to push into: it would only drop a margin
                if (stretched) { if (!keeps(cand.r)) return; cand.s = score(cand.r, 0) + (base.s - score(base.r, 0)) - px(3); all.push(cand); return; }
                if (Math.abs(cand.r.w - base.r.w) > 1 || Math.abs(cand.r.h - base.r.h) > 1) return; // an alignment moves the element, never resizes it (a stretched card stays full width)
                if (Math.abs(cand.r.x - base.r.x) < 1 && Math.abs(cand.r.y - base.r.y) < 1 && Math.abs(cand.r.w - base.r.w) < 1 && Math.abs(cand.r.h - base.r.h) < 1) return; // changes nothing: the plain place says it
                cand.s = score(cand.r, base.s - score(base.r, 0) + px(6) * Object.keys(align).length);
                all.push(cand);
            });
        });
        all.sort((p, q) => p.s - q.s);
        // one per distinct result: two candidates that land in the same place are one option (the simpler one, found first)
        const seen = new Set(), out = [];
        all.forEach((c) => { const k = `${Math.round(c.r.x)},${Math.round(c.r.y)},${Math.round(c.r.w)},${Math.round(c.r.h)}|${c.c === g.ih.parent ? "" : pathOf(c.c).join(".")}`; if (!seen.has(k)) { seen.add(k); out.push(c); } });
        out.forEach((c) => { c.home = c.c === g.ih.parent && c.i === g.ih.index && !c.align; });
        return out;
    }
    const ALIGN_WORDS = { "flex-start": "start", start: "start", center: "centred", "flex-end": "end", end: "end" };
    function intentWords(g, c) {
        if (c.home) return "Back where it was";
        const lay = layoutOf(c.c), n = kidsOf(c.c, g.el).filter(inFlow).length + 1;
        const kind = lay === "flex row" ? "Row" : lay === "flex column" ? "Column" : lay === "grid" ? "Grid" : "Stack";
        const parts = [];
        if (c.c !== g.ih.parent) parts.push(`Into ${c.c === document.body ? "the page" : c.c.tagName.toLowerCase()}`);
        parts.push(`${kind} · ${n === 1 ? "only item" : ORD(c.i + 1) + " of " + n}`);
        if (c.align) {
            const a = c.align;
            if (a["margin-left"] === "auto" && a["margin-right"] === "auto") parts.push("centred");
            else if (a["margin-left"] === "auto") parts.push(lay === "flex row" ? "pushed to the end" : "right");
            else if (a["margin-top"] === "auto") parts.push("pushed to the bottom");
            else if (a["margin-left"] === "0px") parts.push("left");
            else if (a["justify-self"]) parts.push(`${ALIGN_WORDS[a["justify-self"]] === "centred" ? "centred" : ALIGN_WORDS[a["justify-self"]]} in its cell`);
            else if (a["align-self"]) parts.push(lay === "flex row" || lay === "grid" ? { "flex-start": "top", start: "top", center: "middle", "flex-end": "bottom", end: "bottom" }[a["align-self"]] : { "flex-start": "left", center: "centred", "flex-end": "right" }[a["align-self"]]);
        }
        return parts.join(" · ");
    }
    /** Show a candidate: the element there (its neighbours make room), outlined, with what it means. */
    function intentShow(g, c) {
        intentApply(g, c);
        g.ishown = c;
        const r = pageRect(g.el), cr = pageRect(c.c);
        const one = px(1);
        Object.assign(landBox.style, { display: "block", left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        landBox.style.setProperty("box-shadow", `inset 0 0 0 ${1.5 * one}px rgba(59,130,246,.9)`);
        Object.assign(dropBox.style, { display: c.c === g.ih.parent ? "none" : "block", left: `${cr.x}px`, top: `${cr.y}px`, width: `${cr.w}px`, height: `${cr.h}px` });
        const more = g.irank.length > 1 ? "   Tab: other options" : "";
        dropHint.textContent = intentWords(g, c) + more;
        Object.assign(dropHint.style, { display: "block", transform: "", left: `${r.x}px`, top: `${Math.max(0, r.y - px(26))}px`, fontSize: `${px(11)}px`, padding: `${px(4)}px ${px(7)}px` });
        // kept inside the page: near the right edge it goes left, so it is never cut off
        const room = window.scrollX + document.documentElement.clientWidth - px(4), w = dropHint.offsetWidth;
        if (r.x + w > room) dropHint.style.left = `${Math.max(window.scrollX + px(4), room - w)}px`;
        // the drag is shown: the frame's own boxes are redrawn without the selection's handles
        redraw();
    }
    /** Run `cb` on the next animation frame, or within 48ms if the frame never comes (the editor's frame does not always get them). Returns a cancel. */
    function onFrame(cb) {
        let done = false;
        const run = () => { if (done) return; done = true; clearTimeout(t); cancelAnimationFrame(id); cb(); };
        const id = requestAnimationFrame(run), t = setTimeout(run, 48);
        return () => { done = true; clearTimeout(t); cancelAnimationFrame(id); };
    }
    function intentGesture(g, e) {
        g.iev = e;
        const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        if (g.igh) Object.assign(g.igh.style, { left: `${g.rect.x + dx}px`, top: `${g.rect.y + dy}px` });
        if (g.iraf) return;
        g.iraf = onFrame(() => {
            g.iraf = null;
            if (gesture !== g || !g.leave) return;
            const ev = g.iev;
            const shown = g.ishown;
            g.irank = intentRank(g, ev);
            g.ipick = 0;
            let best = g.irank[0];
            // hold on to what is shown until something is clearly better: the preview must not flicker between two close options
            const same = shown && g.irank.find((c) => candKey(c) === candKey(shown));
            if (same && best && same !== best && same.s - best.s < px(8)) best = same;
            if (best) intentShow(g, best);
        });
    }
    function intentCycle(g) {
        if (!g.irank.length) return;
        g.ipick = (g.ipick + 1) % Math.min(4, g.irank.length);
        intentShow(g, g.irank[g.ipick]);
    }
    function intentCleanup(g) {
        if (g.iraf) { g.iraf(); g.iraf = null; } // (cancelled, and forgotten: the next time in the ghost drag must be able to ask again)
        if (g.igh) { g.igh.remove(); g.igh = null; }
        landBox.style.display = "none";
        if (g.ih.opacity) g.el.style.setProperty("opacity", g.ih.opacity); else g.el.style.removeProperty("opacity");
        tidyStyle(g.el);
    }
    function intentCancel(g) {
        intentCleanup(g);
        intentHome(g);
        tidyStyle(g.el);
        clearGuides();
        gesture = null;
        post({ type: "gesture", on: false });
        redraw();
    }
    /** Letting go: keep what is shown, as classes. */
    function intentDrop(g, e) {
        intentCleanup(g);
        const c = g.ishown;
        if (!c || c.home) { intentHome(g); tidyStyle(g.el); return redraw(); }
        intentApply(g, c);
        intentAlign(g, null); // the alignment is written below as a class, from what it was before (not as an inline style)
        tidyStyle(g.el);
        setSelection([g.el]);
        g.ialign = c.align;
        const items = dropSmart(g, e, g.ih.parent, g.ih.first, g.ih.last);
        return items.length ? askConvert(items) : changed();
    }

    // ── Dragging in the layout: slots, as in Figma's auto layout ───────────────────────────────────────────────────
    // An element in the flow is never moved by pixels. It is dragged to a slot (before or after a sibling, or into another box): the
    // others slide apart to make room, the place it will take is marked, and on release it settles into it. Across a flex row or column
    // a drag onto the start, centre or end of the box is written as an alignment (self-*), with a guide that says so.
    /** A box as the place things are dropped into: its content box, the other children (before: ahead of `skip` in the DOM) and its layout. */
    function laneOf(c, skip) {
        const cs = getComputedStyle(c), pr = pageRect(c);
        const f = (v) => parseFloat(v) || 0;
        const bx = f(cs.borderLeftWidth) + f(cs.paddingLeft), bt = f(cs.borderTopWidth) + f(cs.paddingTop);
        const box = { x: pr.x + bx, y: pr.y + bt, w: pr.w - bx - f(cs.borderRightWidth) - f(cs.paddingRight), h: pr.h - bt - f(cs.borderBottomWidth) - f(cs.paddingBottom) };
        const idx = skip ? Array.prototype.indexOf.call(c.children, skip) : -1;
        const others = kidsOf(c, skip).filter((k) => !isAbs(k) && getComputedStyle(k).display !== "none").map((k) => ({ el: k, r: pageRect(k), before: idx >= 0 && Array.prototype.indexOf.call(c.children, k) < idx }));
        return { box, outer: pr, lay: layoutOf(c), others };
    }
    /** Is this axis one that the element's own margin moves its siblings along (block flow down, a flex box along its direction)? */
    const mainAxis = (lay, a) => (lay === "page flow" || lay === "flex column" ? a === "y" : lay === "flex row" ? a === "x" : false);
    /** The line, among the container's edges and centre, its neighbours' edges and the spacing used between them, that `start` .. `start + size` is close to. */
    function containerLine(n, a, start, size, reach) {
        const S = a, Z = a === "x" ? "w" : "h", main = mainAxis(n.lay, a);
        const lines = [{ at: n.box[S], e: "s", k: "start" }, { at: n.box[S] + n.box[Z] / 2, e: "c", k: "centre" }, { at: n.box[S] + n.box[Z], e: "e", k: "end" }];
        n.others.forEach((o) => lines.push({ at: o.r[S], e: "s", k: "sib" }, { at: o.r[S] + o.r[Z] / 2, e: "c", k: "sib" }, { at: o.r[S] + o.r[Z], e: "e", k: "sib" }));
        const gaps = [];
        if (main) {
            const before = n.others.filter((o) => o.before).sort((p, q) => p.r[S] - q.r[S]);
            const all = n.others.slice().sort((p, q) => p.r[S] - q.r[S]);
            for (let i = 1; i < all.length; i++) { const d = all[i].r[S] - (all[i - 1].r[S] + all[i - 1].r[Z]); if (d >= 0) gaps.push(Math.round(d)); }
            const end = before.length ? Math.max(...before.map((o) => o.r[S] + o.r[Z])) : n.box[S];
            const med = gaps.length ? gaps.sort((p, q) => p - q)[Math.floor(gaps.length / 2)] : 0;
            [0, med].forEach((gp) => lines.push({ at: end + gp, e: "s", k: "gap", gap: gp }));
        }
        const T = reach || px(6);
        let best = null, gap = null;
        lines.forEach((c) => {
            const d = c.at - (c.e === "s" ? start : c.e === "c" ? start + size / 2 : start + size);
            if (Math.abs(d) > T) return;
            if (c.k === "gap") { if (!gap || Math.abs(d) < Math.abs(gap.d)) gap = { ...c, d }; } else if (!best || Math.abs(d) < Math.abs(best.d)) best = { ...c, d };
        });
        return gap && (!best || Math.abs(gap.d) <= Math.abs(best.d) + px(4)) ? gap : best; // the spacing wins over an edge that is about as close
    }

    // A child of a row, column or grid let go somewhere else in it: the drop is a demonstration. The host fits the structure that puts
    // everything where it now is (a 2-column grid, a column, ...); until it answers, the exact offset waits unconverted.
    let flowPending = null;
    function flowHint(g, items) {
        const par = g.el.parentElement;
        if (!par || !/flex|grid/.test(getComputedStyle(par).display)) return false;
        const kids = kidsOf(par, null).filter(inFlow), i = kids.indexOf(g.el);
        if (i < 0 || kids.length < 2 || kids.length > 12) return false;
        flowPending = { items, el: g.el, timer: setTimeout(keepOffset, 800) };
        post({ type: "layoutHint", flow: true, moved: i, current: layoutOf(par), container: pathOf(par), box: laneOf(par, null).box, kids: kids.map((k) => ({ path: pathOf(k), ...pageRect(k) })) });
        return true;
    }
    // While a child is dragged freely in a row, column or grid: where the structure the drop would be read as puts it, asked of the host a
    // few times a second and drawn as a box (the drop box) with a short name for the structure.
    let probeAt = 0;
    function probeFlow(g) {
        const now = Date.now();
        if (now - probeAt < 90) return;
        probeAt = now;
        const par = g.el.parentElement;
        if (!par || !/flex|grid/.test(getComputedStyle(par).display)) return;
        const kids = kidsOf(par, null).filter(inFlow), i = kids.indexOf(g.el);
        if (i < 0 || kids.length < 2 || kids.length > 12) return;
        post({ type: "layoutHint", flow: "probe", moved: i, current: layoutOf(par), container: pathOf(par), box: laneOf(par, null).box, kids: kids.map((k) => ({ path: pathOf(k), ...pageRect(k) })) });
    }
    function showProbe(m) {
        const g = gesture;
        if (!m.box || !g || g.type !== "reorder" || !g.free) { dropBox.style.display = "none"; dropHint.style.display = "none"; return; }
        Object.assign(dropBox.style, { display: "block", left: `${m.box.x}px`, top: `${m.box.y}px`, width: `${m.box.w}px`, height: `${m.box.h}px`, borderRadius: "6px", opacity: "1" });
        dropHint.textContent = m.label;
        Object.assign(dropHint.style, { display: "block", left: `${m.box.x + m.box.w + 8}px`, top: `${m.box.y}px`, padding: "4px 7px" });
    }
    function keepOffset() {
        if (!flowPending) return;
        const f = flowPending; clearTimeout(f.timer); flowPending = null;
        askConvert(f.items);
    }

    // ── Dropping into another slot or container: the element takes on the spacing there ──────────────────
    // Margins and alignment that belonged to its old place are cleaned off, it gets the rhythm its new neighbours use (their
    // margin-top, or margin-bottom), the neighbour it left behind loses the spacing it only had for it, and dropped near the
    // centre or the end of a column it is centred or pushed there. Everything goes through the same pixels-to-classes step as a move.
    const inFlow = (k) => !isAbs(k) && getComputedStyle(k).display !== "none";
    const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
    /**
     * A drop to another slot or box is a change of structure, for every size: the markup is one for all of them. So what it writes
     * (the rhythm of the new neighbours) goes on every size, and what the old place gave the element comes off at every size and
     * state too (`lg:mx-auto`, `md:mt-8`, `hover:...` included), not only the plain class. `reflow` is false for a drop that changes
     * no place in the markup (let go in its own slot, aligned there): that one is for the device being edited.
     */
    function dropSmart(g, e, old, wasFirst, wasLast, reflow = true) {
        const el = g.el, par = el.parentElement;
        if (!par || el === document.body) return [];
        const plan = new Map(); // element -> { set: {prop: px | word}, clear: [class groups] }
        const of = (k) => { if (!plan.has(k)) plan.set(k, { set: {}, clear: [] }); return plan.get(k); };
        const f = (v) => parseFloat(v) || 0;
        const has = (k, re) => (k.getAttribute("class") || "").split(/\s+/).some((t) => re.test(t.replace(/^(?:[\w-]+:)*/, "")));
        const flow = (c) => kidsOf(c, null).filter(inFlow);
        const lay = layoutOf(par), moved = par !== old;
        // a margin on one side, as the value it should have: a class that gave it a value is taken off to get 0
        const want = (k, prop, v) => {
            const group = prop === "margin-top" ? "mt" : "mb";
            if (Math.abs(f(getComputedStyle(k)[prop === "margin-top" ? "marginTop" : "marginBottom"]) - v) < 0.5) return;
            if (v === 0 && has(k, new RegExp(`^${group}-`))) { const c = of(k).clear; if (!c.includes(group)) c.push(group); } else of(k).set[prop] = v;
        };
        const noMargins = (k, groups) => groups.forEach((gp) => { if (has(k, new RegExp(`^${gp}-(?!auto$)`)) && !of(k).clear.includes(gp)) of(k).clear.push(gp); });
        // 0. the exact offset it was given in its old slot (relative + left/top) belongs to that slot, not to the new one
        if (reflow && (moved || kidsOf(par, null).indexOf(el) !== (g.home0 ? g.home0.index : (g.ih ? g.ih.index : -1)))) {
            const offs = ["left", "top", "right", "bottom", "inset"].filter((gp) => has(el, new RegExp(`^-?${gp}-`)));
            if (offs.length) { const c = of(el).clear; offs.forEach((gp) => { if (!c.includes(gp)) c.push(gp); }); if (has(el, /^relative$/) && !c.includes("position")) c.push("position"); }
        }
        // 1. alignment and auto margins only mean something in the layout they were made for
        if (moved && lay !== layoutOf(old)) {
            if (has(el, /^self-/)) of(el).clear.push("self");
            ["mx", "ml", "mr"].forEach((gp) => { if (has(el, new RegExp(`^${gp}-auto$`))) of(el).clear.push(gp); });
        }
        // 2. spacing: a gap already spaces its children, so margins along it would double up; in the flow the neighbours' rhythm is kept
        const sibs = flow(par).filter((k) => k !== el);
        if (lay !== "page flow") {
            const pcs = getComputedStyle(par);
            if (lay !== "flex row" && f(pcs.rowGap) > 0) noMargins(el, ["mt", "mb", "my"]);
            if (lay !== "flex column" && f(pcs.columnGap) > 0) noMargins(el, ["ml", "mr", "mx"]);
            // across the box (a row's top and bottom, a column's sides) a margin only shows as a shift, unless the neighbours use it too
            if (moved && sibs.length) {
                const cross = lay === "flex row" || lay === "grid" ? [["marginTop", ["mt", "my"]], ["marginBottom", ["mb", "my"]]] : lay === "flex column" ? [["marginLeft", ["ml", "mx"]], ["marginRight", ["mr", "mx"]]] : [];
                cross.forEach(([side, groups]) => { if (median(sibs.map((k) => f(getComputedStyle(k)[side]))) === 0) noMargins(el, groups); });
            }
        } else if (sibs.length >= 2) {
            const kids = flow(par), i = kids.indexOf(el), cs = sibs.map((k) => getComputedStyle(k));
            const mt = median(cs.slice(1).map((c) => f(c.marginTop))), mb = median(cs.slice(0, -1).map((c) => f(c.marginBottom)));
            if (mt > 0) {
                want(el, "margin-top", i === 0 ? 0 : mt);
                if (kids[i + 1]) want(kids[i + 1], "margin-top", mt);
                if (mb === 0 && f(getComputedStyle(el).marginBottom) > 0) noMargins(el, ["mb"]);
            } else if (mb > 0) {
                want(el, "margin-bottom", i === kids.length - 1 ? 0 : mb);
                if (kids[i - 1]) want(kids[i - 1], "margin-bottom", mb);
                if (f(getComputedStyle(el).marginTop) > 0) noMargins(el, ["mt"]);
            }
        }
        // 3. the place it left: the neighbour that became first (or last) loses the spacing it only had for the element
        if (moved && layoutOf(old) === "page flow") {
            const kids = flow(old);
            if (kids.length >= 2) {
                const cs = kids.map((k) => getComputedStyle(k));
                if (wasFirst && median(cs.slice(1).map((c) => f(c.marginTop))) > 0) want(kids[0], "margin-top", 0);
                if (wasLast && median(cs.slice(0, -1).map((c) => f(c.marginBottom))) > 0) want(kids[kids.length - 1], "margin-bottom", 0);
            }
        }
        // 4a. the ghost drag chose an alignment: it is written, and the alignment classes it replaces come off
        if (g.leave && g.ialign) {
            const a = g.ialign, set = new Set(), off = new Set();
            const GROUP = { "align-self": "self", "justify-self": "justifySelf", "margin-left": "ml", "margin-right": "mr", "margin-top": "mt" };
            Object.keys(a).forEach((p) => set.add(GROUP[p]));
            if (a["margin-left"] !== undefined && a["margin-left"] === a["margin-right"]) { set.add("mx"); off.add("ml"); off.add("mr"); } // written as mx-*
            else if (a["margin-left"] !== undefined || a["margin-right"] !== undefined) off.add("mx");
            Object.assign(of(el).set, a);
            of(el).clear = [...new Set([...of(el).clear.filter((gp) => !set.has(gp)), ...[...off].filter((gp) => !set.has(gp) && has(el, new RegExp(`^${gp}-`)))])];
        }
        // 4. dropped on the start, centre or end of a flex row or column (the guide said so): aligned there, not nudged
        if (g.align && g.align.container === par && (lay === "flex row" || lay === "flex column")) {
            const cross = g.align.cross, Z = cross === "x" ? "w" : "h", n = laneOf(par, el), r = pageRect(el);
            const word = { start: "flex-start", centre: "center", end: "flex-end" }[g.align.k];
            const goal = g.align.k === "start" ? n.box[cross] : g.align.k === "centre" ? n.box[cross] + (n.box[Z] - r[Z]) / 2 : n.box[cross] + n.box[Z] - r[Z];
            // (a box its new row or column stretches is "there" at every line: the guide still meant its own size, placed there)
            if (Math.abs(r[cross] - goal) > 1 || (g.rect && Math.abs(r[Z] - g.rect[Z]) > 1)) { // not there already
                const was = inlineOf(el, ["align-self"]);
                el.style.setProperty("align-self", word);
                const r1 = pageRect(el), goal1 = g.align.k === "start" ? n.box[cross] : g.align.k === "centre" ? n.box[cross] + (n.box[Z] - r1[Z]) / 2 : n.box[cross] + n.box[Z] - r1[Z];
                const ok = Math.abs(r1[cross] - goal1) <= 1.5;
                if (was["align-self"]) el.style.setProperty("align-self", was["align-self"]); else el.style.removeProperty("align-self");
                tidyStyle(el);
                if (ok) of(el).set["align-self"] = word;
            }
        }
        // ... and in the page flow, near the middle or the end: centred or pushed there with auto margins
        if (!e.metaKey && lay === "page flow" && isFinite(g.sx)) {
            const r = pageRect(el), n = laneOf(par, el);
            if (r.w < n.box.w - 1) {
                const at = g.rect.x + (e.clientX - g.sx), hit = containerLine(n, "x", at, r.w);
                if (hit && (hit.k === "centre" || hit.k === "end")) {
                    const props = hit.k === "centre" ? { "margin-left": "auto", "margin-right": "auto" } : { "margin-left": "auto" };
                    const was = inlineOf(el, Object.keys(props));
                    Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v));
                    const ok = Math.abs(pageRect(el).x - (at + hit.d)) <= 2;
                    Object.keys(props).forEach((k) => { if (was[k]) el.style.setProperty(k, was[k]); else el.style.removeProperty(k); });
                    tidyStyle(el);
                    if (ok) {
                        Object.assign(of(el).set, props);
                        of(el).clear = of(el).clear.filter((gp) => !["mx", "ml", "mr", "self"].includes(gp));
                    }
                }
            }
        }
        // 6. a size taken from the box it was in (w-full, h-full, a fraction) means something else in another box: it keeps the size it
        // had (an icon that filled a 16x24 holder does not collapse, or stretch, in the row it is dropped into)
        if (moved && g.rect) {
            const r = pageRect(el);
            ["w", "h"].forEach((a) => { if (has(el, new RegExp(`^${a}-(full|\\d+\\/\\d+)$`)) && Math.abs(r[a] - g.rect[a]) > 2) of(el).set[a === "w" ? "width" : "height"] = g.rect[a]; });
            if (plan.has(el) && (plan.get(el).set.width || plan.get(el).set.height) && /^(flex row|flex column)$/.test(lay) && /^(IMG|SVG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName.toUpperCase())) of(el).set["flex-shrink"] = "0";
        }
        const work = [];
        plan.forEach((p, k) => { const props = Object.keys(p.set); if (props.length || p.clear.length) work.push({ k, p, props, pre: sourcesOf(k, props) }); });
        work.forEach(({ k, p }) => Object.entries(p.set).forEach(([prop, v]) => k.style.setProperty(prop, typeof v === "number" ? `${Math.round(v)}px` : v)));
        return work.map(({ k, p, props, pre }) => { const it = gestureItem(k, pre, props, p.clear); if (reflow) it.structural = true; return it; });
    }

    // ── Making room: the page shows the layout the drop will make ─────────────────────────────────────────────────
    // While an element is dragged between slots it is put in the slot in the page itself (the DOM), so every box around it lays out as it
    // will once it is let go (a card in a row that grows to fill it takes the new width, a wrapping row wraps anew, a grid re-flows),
    // and each one that moved is animated from where it was (Web Animations on the `translate` property, which composes with the
    // page's own transforms). The element itself keeps following the pointer, its `translate` made up from where its slot now is.
    // Back at its own slot it goes home; Esc, or going on as the ghost drag, puts it home too. Nothing is written until the drop.
    const room = { anims: [], slot: null };
    const EASE = "cubic-bezier(.2,.8,.3,1)";
    /** The element back in the DOM place it came from. */
    function homeDom(g) {
        const el = g.el, h = g.home0;
        if (!h || el.parentElement === h.parent && el.nextSibling === h.next) return;
        if (h.next && h.next.parentElement === h.parent) h.parent.insertBefore(el, h.next); else h.parent.appendChild(el);
    }
    function closeRoom() {
        room.anims.forEach((an) => an.cancel());
        room.anims = []; room.slot = null;
        landBox.style.display = "none";
    }
    /** Where the element will land, outlined (as in the ghost drag): its slot in the layout, while it follows the pointer. */
    function showLanding(g) {
        const r = g.lay, one = px(1);
        Object.assign(landBox.style, { display: "block", left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        landBox.style.setProperty("box-shadow", `inset 0 0 0 ${1.5 * one}px rgba(59,130,246,.9)`);
    }
    /** Would dropping at `t` leave the element where it came from? (the element may be somewhere else in the DOM by now: the preview) */
    function sameAsHome(g, t) {
        const h = g.home0;
        if (t.container !== h.parent) return false;
        if (!t.ref) return true;
        const others = kidsOf(h.parent, g.el), i = others.indexOf(t.ref);
        return i >= 0 && (t.before ? i : i + 1) === h.index;
    }
    /** Put the element in the slot `t` says (or home, when `home`), and let the others find their new places. */
    function liveRoom(g, t, home) {
        const el = g.el, h = g.home0;
        const slot = home ? { home: true } : { c: t.container, ref: t.ref || null, before: Boolean(t.before) };
        const cur = room.slot;
        if (cur && cur.home === slot.home && cur.c === slot.c && cur.ref === slot.ref && cur.before === slot.before) return;
        if (!cur && home) { room.slot = slot; return; } // never left its slot
        room.slot = slot;
        // where everything around it is now, as it shows (animations under way included)
        const around = new Set();
        [el.parentElement, home ? h.parent : slot.c].forEach((c) => kidsOf(c, el).filter(inFlow).forEach((k) => around.add(k)));
        const was = new Map([...around].map((k) => [k, pageRect(k)]));
        room.anims.forEach((an) => an.cancel());
        room.anims = [];
        el.style.removeProperty("translate");
        if (home) homeDom(g);
        else if (slot.ref) { if (slot.before) slot.ref.before(el); else slot.ref.after(el); }
        else slot.c.appendChild(el);
        // the others as the layout puts them, and where the element's own slot is
        was.forEach((r0, k) => {
            const r1 = pageRect(k), dx = r0.x - r1.x, dy = r0.y - r1.y;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
            room.anims.push(k.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 170, easing: EASE }));
        });
        g.lay = pageRect(el);
    }

    // ── Free drag: the element follows the pointer to the pixel, and the drop is read as what it means ──────────────
    // Over empty space inside its own box the real element moves (the `translate` property, nothing is written while dragging), and the
    // drop is measured against what a layout can say: back in its slot, aligned to the start, centre or end of the box (self-*, or auto
    // margins in the page flow), pushed to the end of the row or column (ml-auto), and only if none of those is near, an exact offset
    // from its slot (relative + left/top). A guide and a label say what the drop will mean; within 6px it is pulled onto it (Cmd: never).
    // Over another child it is a drag to a slot instead (below), and out of the box it moves to the box it lands in.
    const FLOW_PROPS = ["position", "left", "top", "align-self", "margin-left", "margin-right", "margin-top"];
    const sameRect = (p, q) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1 && Math.abs(p.w - q.w) < 1 && Math.abs(p.h - q.h) < 1;
    /** What the drop could mean on each axis, as the offset from its place that each would put the element at: slot, aligned, pushed. */
    function intentsFor(g) {
        const lane = g.lane, r0 = g.rect, lay = lane.lay, b = lane.box;
        const row = lay === "flex row", col = lay === "flex column", blk = lay === "page flow";
        const mainA = row ? "x" : col || blk ? "y" : null, crossA = row ? "y" : col || blk ? "x" : null;
        const out = { x: [{ k: "slot", off: 0 }], y: [{ k: "slot", off: 0 }] };
        if (crossA) {
            const Z = crossA === "x" ? "w" : "h", free = b[Z] - r0[Z];
            if (free >= 2) {
                const word = { start: crossA === "x" ? "Left" : "Top", centre: "Center", end: crossA === "x" ? "Right" : "Bottom" };
                [["start", 0], ["centre", free / 2], ["end", free]].forEach(([k, at]) => {
                    if (blk && k === "start") return; // the page flow's own start needs no class
                    out[crossA].push({ k, off: b[crossA] + at - r0[crossA], line: b[crossA] + (k === "start" ? 0 : k === "centre" ? b[Z] / 2 : b[Z]), word: `Align ${word[k].toLowerCase()}`, cross: true });
                });
            }
        }
        if (mainA && g.last) { const Z = mainA === "x" ? "w" : "h"; out[mainA].push({ k: "push", off: b[mainA] + b[Z] - r0[mainA] - r0[Z], line: b[mainA] + b[Z], word: "Push to end" }); }
        return { out, mainA, crossA };
    }
    function freeMove(g, e, dx, dy) {
        const el = g.el, { out, mainA, crossA } = intentsFor(g), chosen = {}, lines = [];
        g.stick = g.stick || {};
        ["x", "y"].forEach((a) => {
            const d = a === "x" ? dx : dy;
            if (e.metaKey || Math.abs(d) < 1) { g.stick[a] = null; if (Math.abs(d) < 1) chosen[a] = { k: "slot", off: 0 }; return; }
            const reach = g.stick[a] ? px(10) : px(6);
            let best = null;
            out[a].forEach((c) => {
                const dist = Math.abs(d - c.off);
                if (dist > reach || (c.k !== "slot" && Math.abs(c.off) < 1)) return; // already there: that is the slot
                if (!best || dist < best.dist - 0.01 || (g.stick[a] === c.k && dist <= best.dist + px(4))) best = { ...c, dist };
            });
            g.stick[a] = best ? best.k : null;
            if (!best) return;
            chosen[a] = best;
            if (a === "x") dx = Math.round(best.off); else dy = Math.round(best.off);
            if (best.line !== undefined) lines.push({ a: a === crossA && best.cross ? crossA : mainA, at: best.line, word: best.word });
        });
        g.fi = { dx, dy, chosen, mainA, crossA };
        g.ghost = { x: g.rect.x + dx, y: g.rect.y + dy };
        el.style.setProperty("translate", `${dx}px ${dy}px`);
        // the guides, and a label that says what letting go will do
        const b = g.lane.box;
        lines.forEach((l) => {
            guideLayer.appendChild(mk(l.a === "x"
                ? `position:absolute;left:${l.at - px(0.5)}px;top:${b.y}px;width:${px(1)}px;height:${b.h}px;background:${RED};`
                : `position:absolute;top:${l.at - px(0.5)}px;left:${b.x}px;height:${px(1)}px;width:${b.w}px;background:${RED};`));
        });
        // the distances to what is around it, as Figma shows them: to the nearest child on each side, or to the edge of the box
        {
            const r = pageRect(el), nb = neighbours(r, g.lane.others.map((o) => o.r)), bx = g.lane.box;
            const across = (a0, a1) => mid(a0, a1, a0, a1);
            const side = (s, near, edge) => {
                if (near) { const gp = gapBetween(s, r, near); if (gp >= 1) return s === "left" ? ["x", near.x + near.w, r.x, mid(near.y, near.y + near.h, r.y, r.y + r.h)] : s === "right" ? ["x", r.x + r.w, near.x, mid(near.y, near.y + near.h, r.y, r.y + r.h)] : s === "up" ? ["y", near.y + near.h, r.y, mid(near.x, near.x + near.w, r.x, r.x + r.w)] : ["y", r.y + r.h, near.y, mid(near.x, near.x + near.w, r.x, r.x + r.w)]; return null; }
                if (s === "left" && r.x - bx.x >= 1) return ["x", bx.x, r.x, across(r.y, r.y + r.h)];
                if (s === "right" && bx.x + bx.w - (r.x + r.w) >= 1) return ["x", r.x + r.w, bx.x + bx.w, across(r.y, r.y + r.h)];
                if (s === "up" && r.y - bx.y >= 1) return ["y", bx.y, r.y, across(r.x, r.x + r.w)];
                if (s === "down" && bx.y + bx.h - (r.y + r.h) >= 1) return ["y", r.y + r.h, bx.y + bx.h, across(r.x, r.x + r.w)];
                return null;
            };
            if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) ["left", "right", "up", "down"].forEach((s) => { const d = side(s, nb[s]); if (d) drawGap(...d); });
        }
        const parts = ["x", "y"].map((a) => chosen[a]).filter((c) => c && c.k !== "slot").map((c) => c.word);
        const free = ["x", "y"].filter((a) => !chosen[a] && Math.abs(a === "x" ? dx : dy) >= 1);
        if (free.length) parts.push(free.length === 2 ? `Offset ${Math.round(dx)}, ${Math.round(dy)}` : `Offset ${free[0]} ${Math.round(free[0] === "x" ? dx : dy)}`);
        const r = pageRect(el);
        dropHint.textContent = parts.length ? parts.join(" · ") : "Back in its slot";
        Object.assign(dropHint.style, { display: "block", left: `${r.x}px`, top: `${Math.max(0, r.y - px(24))}px`, fontSize: `${px(11)}px`, padding: `${px(4)}px ${px(7)}px` });
    }
    /** The drop as classes: each axis is written as the intent that was near, checked by measuring, or else as an exact offset. */
    function freeDrop(g) {
        const el = g.el, { dx, dy, chosen, mainA, crossA } = g.fi, lane = g.lane, r0 = g.rect, lay = lane.lay;
        const f = (v) => parseFloat(v) || 0, d = { x: dx, y: dy }, written = {};
        const others = () => lane.others.every((o) => sameRect(pageRect(o.el), o.r));
        const keep = inlineOf(el, FLOW_PROPS);
        const tryProps = (props, axis, target) => { // apply them and measure: the element lands on the target and nothing else moves
            const was = inlineOf(el, Object.keys(props));
            Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v));
            const ok = Math.abs(pageRect(el)[axis] - target) <= 1.5 && others();
            if (!ok) Object.keys(props).forEach((k) => { if (was[k]) el.style.setProperty(k, was[k]); else el.style.removeProperty(k); });
            return ok;
        };
        ["x", "y"].forEach((a) => {
            const c = chosen[a];
            if (!c || c.k === "slot") { if (c) written[a] = true; return; }
            let props = null;
            if (c.k === "push") props = { [a === "x" ? "margin-left" : "margin-top"]: "auto" };
            else if (lay === "page flow") props = c.k === "centre" ? { "margin-left": "auto", "margin-right": "auto" } : { "margin-left": "auto" };
            else props = { "align-self": { start: "flex-start", centre: "center", end: "flex-end" }[c.k] };
            if (tryProps(props, a, r0[a] + d[a])) written[a] = true;
        });
        // what no intent was near (or failed its check) is an exact offset from its slot
        const cs = getComputedStyle(el), rel = cs.position === "relative";
        const move = ["x", "y"].filter((a) => !written[a] && Math.abs(d[a]) >= 1);
        if (move.length) {
            if (cs.position === "static") el.style.setProperty("position", "relative");
            else if (!rel) return [];
            move.forEach((a) => { const prop = a === "x" ? "left" : "top", was = rel ? f(cs[prop]) : 0, v = was + (g.metaDrop ? Math.round(d[a]) : onScale(d[a])); el.style.setProperty(prop, `${v}px`); });
            if (!others()) { FLOW_PROPS.forEach((p) => { if (keep[p]) el.style.setProperty(p, keep[p]); else el.style.removeProperty(p); }); tidyStyle(el); return []; }
        }
        const props = FLOW_PROPS.filter((p) => el.style.getPropertyValue(p) !== keep[p]);
        tidyStyle(el);
        return props.length ? [gestureItem(el, g.pre, props)] : [];
    }

    /** Esc while dragging: everything back as it was, nothing written. */
    function reorderCancel(g) {
        if (g.leave) return intentCancel(g);
        g.el.style.removeProperty("translate");
        homeDom(g);
        tidyStyle(g.el);
        closeRoom();
        guideLayer.innerHTML = "";
        [dropBox, dropHint, insertLine, ghostBox].forEach((b) => { b.style.display = "none"; });
        dropBox.style.opacity = "";
        gesture = null;
        post({ type: "gesture", on: false });
        redraw();
    }
    /**
     * One drag, two halves. In the box it came from (reorderGesture below) the element follows the pointer to the pixel, its
     * neighbours slide apart, guides and distances show. Once the drop would go anywhere else than that box (targetAt), the drag goes
     * on as the ghost drag (above): a copy follows the pointer, the element itself sits where the drop would put it. Back in its box
     * it is the first again. Both ways every frame is read from the page as it was when the drag started, so neither moves a box
     * out from under the pointer; a switch needs the other half to hold for 60ms (and 90ms since the last switch, looked at again by a timer if
     * the pointer stops), so a pointer on the line between the two does not flicker.
     */
    function enterLeave(g) {
        const el = g.el;
        closeRoom();
        el.style.removeProperty("translate"); tidyStyle(el);
        homeDom(g); // the ghost drag starts from the page as it was
        guideLayer.innerHTML = ""; insertLine.style.display = "none"; ghostBox.style.display = "none"; dropBox.style.opacity = "";
        g.free = false; g.fi = null; g.align = null; g.align0 = null; g.target = null; g.same = false;
        g.leave = true;
        intentStart(g);
        redraw();
    }
    function exitLeave(g) {
        intentCleanup(g);
        intentHome(g);
        tidyStyle(g.el);
        dropBox.style.display = "none"; dropHint.style.display = "none";
        g.leave = false; g.ishown = null;
        redraw();
    }
    function reorderGesture(g, e) {
        const el = g.el;
        if (!g.lane) {
            const par0 = el.parentElement, flow0 = kidsOf(par0, null).filter(inFlow);
            g.lane = laneOf(par0, el); g.pre = sourcesOf(el, FLOW_PROPS); g.last = flow0.slice(-1)[0] === el;
            g.home0 = { parent: par0, next: el.nextSibling, index: kidsOf(par0, null).indexOf(el), first: flow0[0] === el, last: g.last };
            g.lay = g.rect;
        }
        // where a drop here goes, read on the page as it was when the drag started (see targetAt): what slides apart while dragging
        // cannot move a box out from under the pointer
        const cx = Math.min(Math.max(e.clientX, 1), document.documentElement.clientWidth - 2), cy = Math.min(Math.max(e.clientY, 1), innerHeight - 2);
        const t = targetAt(g, cx, cy);
        const par = g.geo.home, leaves = t.container !== par;
        g.lastE = e;
        if (leaves !== Boolean(g.leave)) {
            const now = performance.now();
            if (!g.flipSince) g.flipSince = now;
            if (now - g.flipSince >= 60 && now - (g.switched || 0) > 90) { g.flipSince = 0; g.switched = now; clearTimeout(g.flipT); if (leaves) enterLeave(g); else exitLeave(g); }
            else {
                // not sure yet: look again shortly even if the pointer stops here
                clearTimeout(g.flipT);
                g.flipT = setTimeout(() => { if (gesture === g && g.lastE) reorderGesture(g, g.lastE); }, 70);
                if (!g.leave) return; // about to leave: the picture is held for the moment it takes to be sure
            }
        } else { g.flipSince = 0; clearTimeout(g.flipT); }
        if (g.leave) { intentGesture(g, e); return; }
        dropBox.style.opacity = "";
        guideLayer.innerHTML = "";
        // an element in a group stays in it: a drop outside the group changes nothing (ungroup to take it out)
        const held = !staysInGroup(g.el, t.container);
        g.free = !held && Boolean(t.open); // over open space in its own box: placed freely
        if (g.free) {
            liveRoom(g, null, true); g.align = null; g.same = true; g.target = null; landBox.style.display = "none";
            ghostBox.style.display = "none"; dropBox.style.display = "none"; insertLine.style.display = "none";
            let dx = Math.round(e.clientX - g.sx), dy = Math.round(e.clientY - g.sy);
            if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
            g.metaDrop = e.metaKey;
            freeMove(g, e, dx, dy);
            redraw();
            if (!g.metaDrop) probeFlow(g);
            return;
        }
        g.fi = null;
        g.same = held || Boolean(t.stay) || sameAsHome(g, t);
        g.target = t.ref || t.container;
        g.pos = t.ref ? (t.before ? "before" : "after") : "inside";
        // the box that follows the pointer, pulled onto the start, centre or end of a flex row or column when it comes near one
        let gx = g.rect.x + (e.clientX - g.sx), gy = g.rect.y + (e.clientY - g.sy);
        g.align = null;
        const lc = layoutOf(t.container);
        if (!held && !e.metaKey && (lc === "flex row" || lc === "flex column")) {
            const cross = lc === "flex row" ? "y" : "x", Z = cross === "x" ? "w" : "h", n = laneOf(t.container, g.el);
            if (n.box[Z] - g.rect[Z] >= 2) {
                const hit = containerLine(n, cross, cross === "x" ? gx : gy, g.rect[Z], g.align0 ? px(10) : px(6));
                g.align0 = hit && (hit.k === "start" || hit.k === "centre" || hit.k === "end") ? hit : null;
                if (g.align0) {
                    g.align = { k: g.align0.k, cross, container: t.container };
                    if (cross === "x") gx += g.align0.d; else gy += g.align0.d;
                    const word = { start: cross === "x" ? "Left" : "Top", centre: "Center", end: cross === "x" ? "Right" : "Bottom" }[g.align0.k];
                    guideLayer.appendChild(mk(cross === "x"
                        ? `position:absolute;left:${g.align0.at - px(0.5)}px;top:${n.box.y}px;width:${px(1)}px;height:${n.box.h}px;background:${RED};`
                        : `position:absolute;top:${g.align0.at - px(0.5)}px;left:${n.box.x}px;height:${px(1)}px;width:${n.box.w}px;background:${RED};`));
                    const lb = guideLayer.appendChild(mk(`position:absolute;${cross === "x" ? `left:${g.align0.at + px(4)}px;top:${n.box.y + n.box.h - px(4)}px;transform:translate(0,-100%)` : `left:${n.box.x + n.box.w - px(4)}px;top:${g.align0.at - px(3)}px;transform:translate(-100%,-100%)`};background:${RED};color:#fff;font:600 ${px(10)}px/1 system-ui,sans-serif;padding:${px(2)}px ${px(5)}px;border-radius:${px(3)}px;white-space:nowrap;`));
                    lb.textContent = word;
                }
            } else g.align0 = null;
        } else g.align0 = null;
        g.ghost = { x: gx, y: gy };
        ghostBox.style.display = "none";
        liveRoom(g, t, g.same); // the page shows the layout the drop would make
        el.style.setProperty("translate", `${gx - g.lay.x}px ${gy - g.lay.y}px`); // the real element follows the pointer
        if (held) landBox.style.display = "none"; else showLanding(g); // and the place it will land is outlined
        // the container it would land in
        const cr = pageRect(held ? groupAround(g.el) : t.container); // held in a group: the group it stays in is outlined
        Object.assign(dropBox.style, { display: "block", left: `${cr.x}px`, top: `${cr.y}px`, width: `${cr.w}px`, height: `${cr.h}px`, borderWidth: `${px(1.5)}px` });
        const tag = t.container === document.body ? "page" : t.container.tagName.toLowerCase();
        dropHint.textContent = held ? "In a group · ungroup to take it out" : g.same ? (g.align ? `Align ${g.align.k === "centre" ? "center" : g.align.k}` : "Same slot · Alt-drag to place freely") : `${t.ref ? "Insert in" : "Drop into"} ${tag} · ${layoutOf(t.container)}`;
        Object.assign(dropHint.style, { display: "block", left: `${cr.x}px`, top: `${Math.max(0, cr.y - px(22))}px`, fontSize: `${px(11)}px`, padding: `${px(4)}px ${px(7)}px` });
        redraw();
        insertLine.style.display = "none"; // the layout shows the slot: the gap it leaves is the marker
    }

    function resizeGesture(g, e) {
        // work in the element's own axes, so a rotated element resizes along its own edges
        const th = g.rot * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
        const sdx = e.clientX - g.sx, sdy = e.clientY - g.sy;
        const dx = sdx * cos + sdy * sin, dy = -sdx * sin + sdy * cos;
        const hd = g.h;
        let w = g.g.w, h = g.g.h;
        if (hd.includes("e")) w = g.g.w + dx;
        if (hd.includes("s")) h = g.g.h + dy;
        if (hd.includes("w")) w = g.g.w - dx;
        if (hd.includes("n")) h = g.g.h - dy;
        if ((e.shiftKey || g.ratio) && g.g.w && g.g.h) { // Shift, or a locked aspect ratio, keeps the shape
            const r = g.g.w / g.g.h;
            if (hd.length === 2 || hd === "e" || hd === "w") h = w / r; else w = h * r;
        }
        w = Math.max(1, w); h = Math.max(1, h);
        // a flex child that flex sizes along its axis (flex-1, grow) ignores a size there: leave that axis alone, or the margin that
        // keeps the opposite edge in place would push it sideways instead
        const fx = !g.abs && g.fx && g.fx.sized ? g.fx.dir : null;
        if (fx === "row") w = g.g.w;
        if (fx === "column") h = g.g.h;
        // the edges being dragged snap to the edges and centres of the boxes around, like a move does
        let keysX = [], keysY = [];
        if (g.rot === 0 && !e.shiftKey && !e.altKey) {
            if (!g.pr) { g.pr = pageRect(g.el); g.targets = targetsFor([g.el]); }
            const t = px(6), pr = g.pr;
            const edgeX = hd.includes("e") ? pr.x + w : hd.includes("w") ? pr.x + pr.w - w : null;
            const edgeY = hd.includes("s") ? pr.y + h : hd.includes("n") ? pr.y + pr.h - h : null;
            let sx = edgeX === null ? null : nearestLine([edgeX], g.targets.map((r) => three(r.x, r.w)), t);
            let sy = edgeY === null ? null : nearestLine([edgeY], g.targets.map((r) => three(r.y, r.h)), t);
            // sticky, like a move: stay on a line until the edge has been dragged clearly past it
            g.hold = g.hold || { x: null, y: null };
            const release = px(4);
            const hold = (edge, fresh, h) => (h !== null && Math.abs(edge - h) <= release && (fresh === null || Math.abs(fresh) >= Math.abs(edge - h)) ? { s: h - edge, h } : { s: fresh, h: fresh === null ? null : edge + fresh });
            if (edgeX !== null) { const r = hold(edgeX, sx, g.hold.x); sx = r.s; g.hold.x = r.h; }
            if (edgeY !== null) { const r = hold(edgeY, sy, g.hold.y); sy = r.s; g.hold.y = r.h; }
            if (sx !== null) w = Math.max(1, hd.includes("e") ? w + sx : w - sx);
            if (sy !== null) h = Math.max(1, hd.includes("s") ? h + sy : h - sy);
            // the same size as a neighbour: a width or height within 6px of a sibling's takes it (an edge that lined up is left as it is)
            const same = [];
            if (!g.sibs) g.sibs = kidsOf(g.el.parentElement || document.body, g.el).map(pageRect).filter((r) => r.w >= 1 && r.h >= 1);
            const match = (v, key) => { let best = null; g.sibs.forEach((r) => { const d = Math.abs(r[key] - v); if (d <= px(6) && (!best || d < best.d)) best = { d, v: r[key] }; }); return best; };
            if (sx === null && fx !== "row" && /[ew]/.test(hd)) { const m = match(w, "w"); if (m) { w = m.v; same.push("width"); } }
            if (sy === null && fx !== "column" && /[ns]/.test(hd)) { const m = match(h, "h"); if (m) { h = m.v; same.push("height"); } }
            if (same.length) {
                dropHint.textContent = `Same ${same.join(" and ")} as a neighbour`;
                Object.assign(dropHint.style, { display: "block", left: `${pr.x}px`, top: `${Math.max(0, pr.y - px(24))}px`, fontSize: `${px(11)}px`, padding: `${px(4)}px ${px(7)}px` });
            } else dropHint.style.display = "none";
            keysX = edgeX === null ? [] : [hd.includes("e") ? 2 : 0];
            keysY = edgeY === null ? [] : [hd.includes("s") ? 2 : 0];
            g.guide = { want: [hd.includes("e") ? "right" : hd.includes("w") ? "left" : null, hd.includes("s") ? "down" : hd.includes("n") ? "up" : null].filter(Boolean), box: { x: hd.includes("w") ? pr.x + pr.w - w : pr.x, y: hd.includes("n") ? pr.y + pr.h - h : pr.y, w, h }, keysX, keysY };
        } else g.guide = null;
        if (fx !== "row") setPx(g.el, "width", w);
        if (fx !== "column") setPx(g.el, "height", h);
        if (!g.abs) {
            if (g.rot === 0) {
                if (hd.includes("w") && fx !== "row") setPx(g.el, "marginLeft", g.ml - (w - g.g.w));
                if (hd.includes("n") && fx !== "column") setPx(g.el, "marginTop", g.mt - (h - g.g.h));
            }
            return;
        }
        // keep the opposite edge or corner where it was (or the center, with Alt)
        const ax = hd.includes("w") ? 1 : hd.includes("e") ? -1 : 0;
        const ay = hd.includes("n") ? 1 : hd.includes("s") ? -1 : 0;
        const rot = (x, y) => ({ x: x * cos - y * sin, y: x * sin + y * cos });
        const a0 = rot(ax * g.g.w / 2, ay * g.g.h / 2), a1 = rot(ax * w / 2, ay * h / 2);
        const cx = e.altKey ? g.c.x : g.c.x + a0.x - a1.x;
        const cy = e.altKey ? g.c.y : g.c.y + a0.y - a1.y;
        setPx(g.el, "left", cx - w / 2 - g.o.x);
        setPx(g.el, "top", cy - h / 2 - g.o.y);
    }

    // Drag a corner dot toward the middle: every corner gets the same radius, previewed inline until the editor applies it as a class or style.
    function radiusGesture(g, e) {
        const th = -g.rot * Math.PI / 180;
        const px0 = e.clientX + window.scrollX - g.c.x, py0 = e.clientY + window.scrollY - g.c.y;
        const lx = px0 * Math.cos(th) - py0 * Math.sin(th) + g.w / 2;
        const ly = px0 * Math.sin(th) + py0 * Math.cos(th) + g.h / 2;
        const east = g.corner.includes("e"), south = g.corner.includes("s");
        const inset = ((east ? g.w - lx : lx) + (south ? g.h - ly : ly)) / 2;
        g.r = Math.max(0, Math.min(Math.round(inset - px(11)), Math.floor(Math.min(g.w, g.h) / 2)));
        g.el.style.borderRadius = `${g.r}px`;
    }

    function rotateGesture(g, e) {
        const a = Math.atan2(e.clientY + window.scrollY - g.cy, e.clientX + window.scrollX - g.cx) * 180 / Math.PI;
        let rot = g.start + (a - g.a0);
        if (e.shiftKey) rot = Math.round(rot / 15) * 15;
        g.deg = Math.round((((rot + 180) % 360 + 360) % 360 - 180) * 10) / 10; // the angle shown while turning, -180 to 180
        g.at = { x: e.clientX, y: e.clientY };
        g.el.style.transform = rot % 360 === 0 ? "" : `rotate(${Math.round(rot * 10) / 10}deg)`;
        if (!g.el.style.transform) g.el.style.removeProperty("transform");
    }

    function marqueeSelect(g, e) {
        const x0 = Math.min(g.sx, e.clientX) + window.scrollX, y0 = Math.min(g.sy, e.clientY) + window.scrollY;
        const x1 = Math.max(g.sx, e.clientX) + window.scrollX, y1 = Math.max(g.sy, e.clientY) + window.scrollY;
        Object.assign(marqueeBox.style, { display: "block", left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
        const touches = (el) => { const r = pageRect(el); return r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0; };
        // as in Figma: the boxes at the level being worked in (the one gone into, else the top of the page) that the rectangle touches;
        // a lone wrapper holding everything doesn't count as a level, so the boxes inside it are the ones picked
        let level = inside && alive(inside) ? inside : document.body;
        const shown = (el) => realKids(el).filter((c) => getComputedStyle(c).display !== "none" && !isLocked(c));
        for (let n = shown(level); n.length === 1 && !isTextual(n[0]) && shown(n[0]).length; n = shown(level)) level = n[0];
        let hits = shown(level).filter(touches);
        if (!hits.length) { // nothing there: free-positioned boxes anywhere, as before
            hits = Array.prototype.filter.call(document.body.querySelectorAll("*"), (el) => !isOverlay(el) && isAbs(el) && touches(el)).filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)));
        }
        g.hits = hits;
    }

    /** A handle drawn by the editor was pressed. The editor then forwards the pointer (hmove / hend) in this frame's coordinates. */
    function beginHandle(hd, e) {
        if (editing) finishEdit(); // resizing (or turning) what is being typed in: the typing is done
        const el = primary();
        if (!el || el === document.body) return;
        const g = geomOf(el);
        const br = pageRect(el);
        if (hd.startsWith("rad")) {
            gesture = { type: "radius", el, corner: hd.slice(4), c: { x: br.x + br.w / 2, y: br.y + br.h / 2 }, rot: g.rot, w: el.offsetWidth || br.w, h: el.offsetHeight || br.h, prev: el.style.borderRadius, r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, sx: e.clientX, sy: e.clientY, moved: false };
        } else if (hd.startsWith("rot")) {
            const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
            gesture = { type: "rotate", el, prevTransform: el.style.transform, cx, cy, a0: Math.atan2(e.clientY + window.scrollY - cy, e.clientX + window.scrollX - cx) * 180 / Math.PI, start: g.rot, moved: false };
        } else {
            const cs0 = getComputedStyle(el);
            const ar = cs0.aspectRatio;
            gesture = { type: "resize", el, ratio: ar && ar !== "auto", fx: flexItemOf(el), pre: sourcesOf(el, GESTURE_PROPS), inl0: inlineOf(el, GESTURE_PROPS), h: hd, g, abs: g.abs, rot: g.rot, ml: parseFloat(cs0.marginLeft) || 0, mt: parseFloat(cs0.marginTop) || 0, c: { x: br.x + br.w / 2, y: br.y + br.h / 2 }, o: originOf(el.parentElement || document.body), sx: e.clientX, sy: e.clientY, moved: false };
        }
    }

    document.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (converting) { e.preventDefault(); return; } // the last drag is still becoming classes (askConvert)
        if (editing && editing.contains(e.target)) return;
        if (editing) finishEdit(); else dropTextSelection();
        try { root.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        e.preventDefault();
        if (picking) { // the click names the element an interaction acts on: it is not a selection
            picking = false; root.style.cursor = "";
            const t = hitAt(e.clientX, e.clientY);
            post({ type: "picked", path: t === document.body ? [] : pathOf(t) });
            return;
        }

        if (tool === "hand") { gesture = { type: "pan", sx: e.clientX, sy: e.clientY, moved: false }; root.style.cursor = "grabbing"; return; }
        if (DRAW.has(tool)) {
            gesture = { type: "draw", kind: tool, sx: e.clientX, sy: e.clientY, container: containerAt(e.clientX, e.clientY), moved: false };
            return;
        }
        const gh = tool === "move" && sels.length === 1 ? gapAt(e) : null;
        if (gh) { // a gap between the children of the selected box, or one side of its padding
            const el = sels[0];
            const props = gh.kind === "pad" ? [gh.prop, gh.opp] : gh.prop === "gap" ? ["column-gap", "row-gap"] : [gh.prop]; // the shorthand has no source of its own: its two halves do (a side's padding: its opposite too, for Alt)
            gesture = { type: "gap", el, h: gh, props, start: gh.gap, pre: sourcesOf(el, props), inl0: inlineOf(el, props), sx: e.clientX, sy: e.clientY, moved: false };
            return;
        }
        const t = targetOf(e);
        if (t === document.body) {
            gesture = { type: "marquee", sx: e.clientX, sy: e.clientY, shift: e.shiftKey, hits: [], moved: false };
            if (!e.shiftKey) setSelection([]);
            return;
        }
        if (e.shiftKey) setSelection(sels.includes(t) ? sels.filter((s) => s !== t) : [...sels, t]);
        else if (!sels.includes(t)) setSelection([t]);
        startMove(e, sels.length ? sels : [t]);
    }, true);

    // the pointer over the empty part of the design: the editor outlines the frame, as it does for a frame that isn't open
    let frameHovered = false;
    const hoverFrame = (on) => { if (on !== frameHovered) { frameHovered = on; post({ type: "hoverFrame", on }); } };
    function onMove(e) {
        const g = gesture;
        if (!g) {
            if (!editing && tool === "move") {
                const gh = sels.length === 1 ? gapAt(e) : null; // over a gap or padding handle of the selected box: it lights up, the pointer says which way
                const hotNow = gh ? gh.i : -1;
                if (hotNow !== gapHot || gh) root.style.cursor = gh ? (gh.axis === "x" ? "col-resize" : "row-resize") : CURSOR[tool] || "default";
                gapHot = hotNow;
                if (gh) { hov = null; redraw(); hoverFrame(false); return; }
                hov = targetOf(e);
                // over the box that is selected: the child under the pointer is outlined (a double-click goes into it)
                const cur = sels.length === 1 ? sels[0] : null, raw = e.target && e.target.nodeType === 1 && !isOverlay(e.target) ? e.target : null;
                if (hov && cur && hov === cur && raw && raw !== cur && cur.contains(raw) && !isTextual(cur) && !e.metaKey && !e.ctrlKey) hov = childOf(cur, raw.closest("svg") || raw);
                redraw();
            }
            hoverFrame(!editing && tool === "move" && hov === document.body);
            return;
        }
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3 && g.type !== "rotate") return;
        g.moved = true;
        if (!g.notified) { g.notified = true; post({ type: "gesture", on: true }); }
        if (g.type === "draw") {
            const x0 = Math.min(g.sx, e.clientX) + window.scrollX, y0 = Math.min(g.sy, e.clientY) + window.scrollY;
            Object.assign(draftBox.style, { display: "block", left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(e.clientX - g.sx)}px`, height: `${Math.abs(e.clientY - g.sy)}px` });
        } else if (g.type === "move") { moveGesture(g, e); redraw(); }
        else if (g.type === "reorder") reorderGesture(g, e);
        else if (g.type === "gap") gapGesture(g, e);
        else if (g.type === "resize") { resizeGesture(g, e); if (g.guide) showGuides(g.guide.box, g.targets, g.guide.keysX, g.guide.keysY, false, g.guide.want); else guideLayer.innerHTML = ""; redraw(); }
        else if (g.type === "rotate") { rotateGesture(g, e); redraw(); }
        else if (g.type === "radius") { g.at = { x: e.clientX, y: e.clientY }; radiusGesture(g, e); redraw(); }
        else if (g.type === "marquee") marqueeSelect(g, e);
        else if (g.type === "pan") { post({ type: "pan", dx: e.clientX - g.sx, dy: e.clientY - g.sy }); g.sx = e.clientX; g.sy = e.clientY; }
    }
    document.addEventListener("pointermove", onMove, true);

    function onUp(e) {
        const g = gesture;
        gesture = null;
        clearGuides();
        marqueeBox.style.display = "none";
        root.style.cursor = CURSOR[tool] || "default";
        if (!g) return;
        if (g.notified) post({ type: "gesture", on: false });
        if (g.type === "gap") {
            dropHint.style.display = "none";
            if (!g.moved) return redraw();
            if (g.v === g.start && !g.pair) { g.props.forEach((p) => { if (g.inl0[p]) g.el.style.setProperty(p, g.inl0[p]); else g.el.style.removeProperty(p); }); g.el.style.removeProperty(g.h.prop); tidyStyle(g.el); return redraw(); } // back where it was
            // what changed: the one side (both with Alt), or for a gap its halves
            const props = g.h.kind === "pad" ? g.props.filter((p) => g.el.style.getPropertyValue(p) !== g.inl0[p]) : g.props;
            if (!props.length) return redraw();
            return askConvert([gestureItem(g.el, g.pre, props)]);
        }
        if (g.type === "radius") {
            if (!g.moved) return;
            if (g.prev) g.el.style.borderRadius = g.prev; else g.el.style.removeProperty("border-radius");
            if (!g.el.getAttribute("style")) g.el.removeAttribute("style");
            redraw();
            return post({ type: "radius", path: pathOf(g.el), value: g.r });
        }
        if (g.type === "rotate") { // the turn becomes a class (rotate-45, rotate-[15deg]); the inline transform it used while turning goes
            if (g.prevTransform) g.el.style.transform = g.prevTransform; else g.el.style.removeProperty("transform");
            if (!g.el.getAttribute("style")) g.el.removeAttribute("style");
            redraw();
            return g.moved && g.deg !== undefined ? post({ type: "rotate", path: pathOf(g.el), value: g.deg }) : undefined;
        }
        if (g.type === "draw") return finishDraw(g, e);
        if (g.type === "marquee") {
            if (g.moved) setSelection(g.shift ? [...new Set([...sels, ...g.hits])] : g.hits);
            else if (!g.shift) post({ type: "frameClick" }); // a click on the empty part of the design: the frame itself
            return;
        }
        if (g.type === "reorder" && g.moved && g.leave) return intentDrop(g, e); // out of its box: the ghost drag's drop
        if (g.type === "reorder") { g.el.style.removeProperty("translate"); tidyStyle(g.el); dropBox.style.opacity = ""; closeRoom(); dropHint.style.display = "none"; }
        if (g.type === "reorder" && g.moved && g.free && g.fi) {
            const items = freeDrop(g);
            guideLayer.innerHTML = "";
            if (items.length && !g.metaDrop && items.some((i) => i.values.left !== undefined || i.values.top !== undefined) && flowHint(g, items)) return redraw();
            if (items.length) return askConvert(items);
            redraw(); return;
        }
        if (g.type === "reorder" && g.moved && g.same) {
            // let go in its own slot: nothing moves, unless it was dropped on the start, centre or end of a flex box (then it is aligned there)
            if (g.align) { const items = dropSmart(g, e, g.el.parentElement, false, false, false); if (items.length) return askConvert(items); }
            redraw(); return;
        }
        if (g.type === "reorder" && g.moved && g.target) {
            // (the preview has put it in its slot already; where it came from is what was kept at the start)
            const was = g.home0.parent, wasFirst = g.home0.first, wasLast = g.home0.last;
            if (g.pos === "before") g.target.before(g.el); else if (g.pos === "after") g.target.after(g.el); else g.target.appendChild(g.el);
            setSelection([g.el]);
            // it settles into its slot from where it was let go
            // (the selection is drawn again once it has settled: until then its box is still on the way)
            if (g.ghost) { const fin = pageRect(g.el); const an = g.el.animate([{ translate: `${g.ghost.x - fin.x}px ${g.ghost.y - fin.y}px` }, { translate: "0 0" }], { duration: 170, easing: EASE }); an.onfinish = an.oncancel = () => redraw(); }
            const items = was ? dropSmart(g, e, was, wasFirst, wasLast) : [];
            return items.length ? askConvert(items) : changed();
        }
        if (g.type === "pan") return;
        if (g.type === "move" && g.freeOnMove) return post({ type: "selected", info: describe(primary()) }); // Alt-click: nothing freed
        if (g.moved && g.type === "move") { askConvert(g.items.map((i) => gestureItem(i.el, i.pre, g.freed ? FREE_PROPS : ["left", "top"]))); if (!g.freed && g.items.length === 1) layoutHint(g.container); return; }
        if (g.moved && g.type === "resize") {
            // a size or position the resize rewrote without changing it (a corner dragged sideways, the top-left of a box resized from
            // its bottom-right) is dropped, not saved as a class
            [["width", g.g.w], ["height", g.g.h], ["left", g.g.x], ["top", g.g.y]].forEach(([p, was]) => {
                if (!g.inl0[p] && Math.round(parseFloat(g.el.style.getPropertyValue(p))) === Math.round(was)) g.el.style.removeProperty(p);
            });
            tidyStyle(g.el);
            // with the ratio locked the height follows the width: a fixed height would break the lock
            if (g.ratio && g.el.style.getPropertyValue("width") && !g.inl0.height) g.el.style.removeProperty("height");
            const props = GESTURE_PROPS.filter((p) => g.el.style.getPropertyValue(p) !== g.inl0[p]); // what the resize wrote
            const item = gestureItem(g.el, g.pre, props);
            // pulled along the axis flex sizes it on: nothing changed there, and the editor says why
            if (!g.abs && g.fx && g.fx.sized && (g.fx.dir === "row" ? /[ew]/.test(g.h) : /[ns]/.test(g.h))) item.blocked = g.fx.dir === "row" ? "width" : "height";
            return askConvert([item]);
        }
        if (g.moved) changed();
        else post({ type: "selected", info: describe(primary()) });
    }
    document.addEventListener("pointerup", onUp, true);
    // leaving the frame must also drop the hover highlight (no pointermove arrives once the pointer is outside)
    const dropHover = () => { hoverFrame(false); if (hov && !gesture) { hov = null; redraw(); } };
    root.addEventListener("pointerleave", dropHover);
    document.addEventListener("mouseleave", dropHover);

    const hitAt = (x, y) => document.elementsFromPoint(x, y).find((n) => !isOverlay(n) && n !== root) || document.body;
    /** Has words of its own (not only elements): a double-click edits it, rather than going into what is in it. */
    const isTextual = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    /** The child of `box` that holds `el`. */
    const childOf = (box, el) => { let c = el; while (c.parentElement && c.parentElement !== box) c = c.parentElement; return c; };
    document.addEventListener("dblclick", (e) => {
        e.preventDefault();
        const el = hitAt(e.clientX, e.clientY);
        if (el === document.body || tool !== "move" || isLocked(el)) return;
        const cur = sels.length === 1 && alive(sels[0]) ? sels[0] : null;
        const inner = cur && cur !== el && cur.contains(el) && el.closest("svg") !== cur ? childOf(cur, el.closest("svg") || el) : null;
        // into the selected box: the one of its children under the pointer is picked (and what sits beside it can be picked next). A box with words of its own is edited
        // instead, unless the pointer is on a child with no words (an icon, an image): that child is picked, so an icon beside a brand name can be selected, not the name typed in.
        if (inner && (!isTextual(cur) || !inner.textContent.trim())) {
            inside = cur;
            setSelection([inner]);
            return;
        }
        if (isField(el)) { setSelection([el]); startEdit(el, true); return; } // a field inside a label: the field's own words, typed in the field
        const target = cur && cur.contains(el) && isTextual(cur) ? cur : cur === el ? el : pickable(el);
        setSelection([target]);
        if ((isTextual(target) || !realKids(target).length) && !NO_TEXT.test(target.tagName)) {
            startEdit(target, false);
            // the caret goes where the double-click was (not to the start of the text), so typing lands where it was aimed
            const at = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
            const sel = getSelection();
            if (at && target.contains(at.startContainer)) { sel.removeAllRanges(); sel.addRange(at); }
            else if (target.childNodes.length) { const r = document.createRange(); r.selectNodeContents(target); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
        }
    }, true);
    document.addEventListener("selectionchange", () => { if (editing) postEditing(); });
    // pasting while typing brings the words only: another app's fonts, colours and markup would land inline in the design
    document.addEventListener("paste", (e) => {
        if (!editing || editing.dataset.wcField) return;
        e.preventDefault();
        const text = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
        document.execCommand("insertText", false, text);
    }, true);
    // while typing, keep the editor's copy of the markup (and so the Code panel) current instead of waiting for the edit to finish
    let typingTimer = null;
    document.addEventListener("input", () => {
        if (!editing) return;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => { if (editing) post({ type: "typing", html: serialize() }); }, 80);
    }, true);
    document.addEventListener("focusout", (e) => { if (editing && e.target === editing) finishEdit(); }, true);
    document.addEventListener("submit", (e) => e.preventDefault(), true);
    document.addEventListener("click", (e) => { if (!(editing && editing.contains(e.target))) { e.preventDefault(); e.stopPropagation(); } }, true);

    // ── Align, group, duplicate, delete ─────────────────────────────────────────────────────
    function align(mode) {
        const items = sels.filter(isAbs);
        if (!items.length) return;
        const gs = items.map((el) => ({ el, g: geomOf(el) }));
        let box;
        if (items.length === 1) {
            const par = items[0].parentElement;
            box = { x: 0, y: 0, w: par === document.body ? Math.max(root.scrollWidth, innerWidth) : par.clientWidth, h: par === document.body ? Math.max(root.scrollHeight, innerHeight) : par.clientHeight };
        } else {
            const x0 = Math.min(...gs.map((i) => i.g.x)), y0 = Math.min(...gs.map((i) => i.g.y));
            box = { x: x0, y: y0, w: Math.max(...gs.map((i) => i.g.x + i.g.w)) - x0, h: Math.max(...gs.map((i) => i.g.y + i.g.h)) - y0 };
        }
        if (mode === "distribute-h" || mode === "distribute-v") {
            if (gs.length < 3) return;
            const horiz = mode === "distribute-h";
            gs.sort((a, b) => (horiz ? a.g.x - b.g.x : a.g.y - b.g.y));
            const total = gs.reduce((s, i) => s + (horiz ? i.g.w : i.g.h), 0);
            const gap = ((horiz ? box.w : box.h) - total) / (gs.length - 1);
            let cur = horiz ? box.x : box.y;
            gs.forEach((i) => { setPx(i.el, horiz ? "left" : "top", cur); cur += (horiz ? i.g.w : i.g.h) + gap; });
        } else {
            gs.forEach(({ el, g }) => {
                if (mode === "left") setPx(el, "left", box.x);
                if (mode === "hcenter") setPx(el, "left", box.x + (box.w - g.w) / 2);
                if (mode === "right") setPx(el, "left", box.x + box.w - g.w);
                if (mode === "top") setPx(el, "top", box.y);
                if (mode === "vcenter") setPx(el, "top", box.y + (box.h - g.h) / 2);
                if (mode === "bottom") setPx(el, "top", box.y + box.h - g.h);
            });
        }
        changed();
    }

    function group() {
        const items = sels.filter((el) => el !== document.body && el.parentElement && !isLocked(el));
        if (items.length < 2) return;
        const par = items[0].parentElement;
        if (items.some((el) => el.parentElement !== par)) return;
        if (!items.every(isAbs)) return items.some(isAbs) ? undefined : groupInFlow(items, par); // free and flowing mixed: nothing sensible
        const gs = items.map((el) => ({ el, g: geomOf(el) }));
        const x0 = Math.min(...gs.map((i) => i.g.x)), y0 = Math.min(...gs.map((i) => i.g.y));
        const x1 = Math.max(...gs.map((i) => i.g.x + i.g.w)), y1 = Math.max(...gs.map((i) => i.g.y + i.g.h));
        const grp = document.createElement("div");
        grp.className = "absolute";
        grp.style.position = "absolute";
        grp.setAttribute("data-wc-group", "");
        setPx(grp, "left", x0); setPx(grp, "top", y0); setPx(grp, "width", x1 - x0); setPx(grp, "height", y1 - y0);
        par.insertBefore(grp, items[0]);
        gs.forEach(({ el, g }) => { grp.appendChild(el); setPx(el, "left", g.x - x0); setPx(el, "top", g.y - y0); });
        setSelection([grp]);
        changed();
    }

    /** Elements in the page flow, a flex box or a grid: a box around them in their place, laid out as their parent lays them out, so
     *  grouping changes nothing on the page (in a grid the box has none of its own: display: contents keeps every cell where it was). */
    function groupInFlow(items, par) {
        const ordered = Array.prototype.filter.call(par.children, (c) => items.includes(c));
        const lay = layoutOf(par), pcs = getComputedStyle(par);
        const grp = document.createElement("div");
        grp.setAttribute("data-wc-group", "");
        par.insertBefore(grp, ordered[0]);
        ordered.forEach((el) => grp.appendChild(el));
        made.add(grp);
        let props = [];
        if (lay === "grid") grp.className = "contents";
        else if (lay !== "page flow") {
            const want = { display: "flex", "flex-direction": pcs.flexDirection, "align-items": pcs.alignItems, "column-gap": pcs.columnGap, "row-gap": pcs.rowGap };
            const plain = { "flex-direction": ["row"], "align-items": ["normal", "stretch"], "column-gap": ["normal", "0px"], "row-gap": ["normal", "0px"] };
            props = Object.keys(want).filter((k) => !(plain[k] || []).includes(want[k]));
            props.forEach((k) => grp.style.setProperty(k, want[k]));
        }
        setSelection([grp]);
        if (props.length) return askConvert([gestureItem(grp, {}, props)]);
        changed();
    }

    /**
     * Shift+A: several free elements in one parent become a flex row or column (whichever way they are spread), in the order
     * they sit, with the gap they have most often, in a free box where they were. The box is the editor's, so it gets Tailwind
     * classes (askConvert); the elements lose their own position and keep their size.
     */
    function autoLayout() {
        const items = sels.filter((el) => isAbs(el) && el.parentElement);
        if (items.length < 2) return;
        const par = items[0].parentElement;
        if (items.some((el) => el.parentElement !== par)) return;
        const rs = items.map((el) => ({ el, r: pageRect(el) }));
        const x0 = Math.min(...rs.map((i) => i.r.x)), y0 = Math.min(...rs.map((i) => i.r.y));
        const x1 = Math.max(...rs.map((i) => i.r.x + i.r.w)), y1 = Math.max(...rs.map((i) => i.r.y + i.r.h));
        const row = (x1 - x0) - Math.max(...rs.map((i) => i.r.w)) >= (y1 - y0) - Math.max(...rs.map((i) => i.r.h));
        rs.sort((a, b) => (row ? a.r.x - b.r.x : a.r.y - b.r.y));
        const gaps = rs.slice(1).map((b, i) => (row ? b.r.x - (rs[i].r.x + rs[i].r.w) : b.r.y - (rs[i].r.y + rs[i].r.h))).map((g) => Math.max(0, Math.round(g))).sort((a, b) => a - b);
        const gap = gaps[Math.floor(gaps.length / 2)] || 0;
        const o = originOf(par);
        const box = document.createElement("div");
        Object.assign(box.style, { position: "absolute", display: "flex", alignItems: "flex-start", gap: `${gap}px` });
        if (!row) box.style.flexDirection = "column";
        setPx(box, "left", x0 - o.x); setPx(box, "top", y0 - o.y);
        par.insertBefore(box, rs[0].el);
        made.add(box);
        rs.forEach(({ el }) => {
            [...el.classList].filter((t) => POSITION_TOKEN.test(t)).forEach((t) => el.classList.remove(t));
            if (!el.classList.length) el.removeAttribute("class");
            ["position", "left", "top", "right", "bottom", "transform"].forEach((p) => el.style.removeProperty(p));
            tidyStyle(el);
            box.appendChild(el);
        });
        setSelection([box], true);
        askConvert([gestureItem(box, {}, ["position", "left", "top", "display", "flex-direction", "align-items", "gap"])]);
    }

    /**
     * Shift+G: free elements that sit in a matrix (every column in line, every row in line, a cell each) become a grid: columns as wide as
     * their widest cell, the gaps they have most often, in a free box where they were, like Shift+A does for a row or column. Anything that
     * is not a clean matrix is left alone.
     */
    function gridLayout() {
        const items = sels.filter((el) => isAbs(el) && el.parentElement && !isLocked(el));
        if (items.length < 4) return;
        const par = items[0].parentElement;
        if (items.some((el) => el.parentElement !== par)) return;
        const rs = items.map((el) => ({ el, r: pageRect(el) }));
        const T = 3; // pixels of slack
        const cluster = (values) => {
            const out = [];
            [...values].sort((a, b) => a - b).forEach((v) => { const l = out[out.length - 1]; if (l && v - l.max <= T) { l.max = v; l.sum += v; l.n++; } else out.push({ max: v, sum: v, n: 1 }); });
            return out.map((c) => c.sum / c.n);
        };
        const xs = cluster(rs.map((i) => i.r.x)), ys = cluster(rs.map((i) => i.r.y));
        if (xs.length < 2 || ys.length < 2 || xs.length * ys.length !== rs.length) return;
        const cell = Array.from({ length: ys.length }, () => Array(xs.length).fill(null));
        for (const i of rs) {
            const c = xs.findIndex((x) => Math.abs(x - i.r.x) <= T), r = ys.findIndex((y) => Math.abs(y - i.r.y) <= T);
            if (c < 0 || r < 0 || cell[r][c]) return;
            cell[r][c] = i;
        }
        const colW = xs.map((_, c) => Math.max(...cell.map((row) => row[c].r.w)));
        const rowH = ys.map((_, r) => Math.max(...cell[r].map((i) => i.r.h)));
        const median = (list) => { const s = list.map((g) => Math.max(0, Math.round(g))).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
        const gapX = median(xs.slice(1).map((x, c) => x - (xs[c] + colW[c]))), gapY = median(ys.slice(1).map((y, r) => y - (ys[r] + rowH[r])));
        const o = originOf(par);
        const box = document.createElement("div");
        Object.assign(box.style, { position: "absolute", display: "grid", alignItems: "start", justifyItems: "start", columnGap: `${gapX}px`, rowGap: `${gapY}px`, gridTemplateColumns: colW.map((w) => `${Math.round(w)}px`).join(" ") });
        setPx(box, "left", xs[0] - o.x); setPx(box, "top", ys[0] - o.y);
        par.insertBefore(box, rs[0].el);
        made.add(box);
        cell.flat().forEach(({ el }) => {
            [...el.classList].filter((t) => POSITION_TOKEN.test(t)).forEach((t) => el.classList.remove(t));
            if (!el.classList.length) el.removeAttribute("class");
            ["position", "left", "top", "right", "bottom", "transform"].forEach((p) => el.style.removeProperty(p));
            tidyStyle(el);
            box.appendChild(el);
        });
        setSelection([box], true);
        askConvert([gestureItem(box, {}, ["position", "left", "top", "display", "grid-template-columns", "align-items", "justify-items", "column-gap", "row-gap"])]);
    }

    function ungroup() {
        const el = primary();
        if (!el || el === document.body || !el.children.length || !el.parentElement) return;
        if (!isAbs(el)) {
            if (!el.hasAttribute("data-wc-group")) return; // only a box Ctrl+G made is taken apart; any other box is part of the design
            const kids = Array.prototype.slice.call(el.children);
            kids.forEach((k) => el.before(k));
            el.remove();
            setSelection(kids);
            return changed();
        }
        const g = geomOf(el);
        const kids = Array.prototype.slice.call(el.children).filter(isAbs);
        if (!kids.length) return;
        kids.forEach((k) => { const kg = geomOf(k); el.parentElement.insertBefore(k, el); setPx(k, "left", kg.x + g.x); setPx(k, "top", kg.y + g.y); });
        if (!el.children.length) el.remove();
        setSelection(kids);
        changed();
    }

    function duplicate() {
        const copies = sels.filter((el) => el !== document.body).map((el) => {
            const c = el.cloneNode(true);
            el.after(c);
            if (isAbs(c)) { const g = geomOf(c); setPx(c, "left", g.x + 12); setPx(c, "top", g.y + 12); }
            return c;
        });
        if (copies.length) { setSelection(copies); changed(); }
    }

    // Cut / copy / paste of elements, inside this page (the markup is kept as text; a pasted copy lands after the selection, or at the end of the page)
    let held = [];
    function copySelection(cut) {
        const items = sels.filter((el) => el !== document.body);
        if (!items.length) return;
        held = items.map((el) => el.outerHTML);
        if (cut) removeSelection();
    }
    function pasteSelection() {
        if (!held.length) return;
        const at = sels.filter((el) => el !== document.body).pop();
        const made = held.map((h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstElementChild; }).filter(Boolean);
        made.forEach((c) => {
            if (at) at.after(c); else root.appendChild(c);
            if (isAbs(c)) { const g = geomOf(c); setPx(c, "left", g.x + 12); setPx(c, "top", g.y + 12); }
        });
        if (made.length) { setSelection(made); changed(); }
    }

    function removeSelection() {
        const items = sels.filter((el) => el !== document.body);
        if (!items.length) return;
        const next = items[0].parentElement;
        items.forEach((el) => el.remove());
        setSelection(next && next !== root ? [next] : []);
        changed();
    }

    function nudge(dx, dy) {
        const items = sels.filter((el) => isAbs(el) && !isLocked(el));
        if (!items.length) return;
        items.forEach((el) => { const g = geomOf(el); setPx(el, "left", g.x + dx); setPx(el, "top", g.y + dy); });
        changed(false, "nudge");
    }

    const POSITION_TOKEN = /^(?:[\w-]+:)*(?:absolute|fixed|-?(?:left|top|right|bottom|inset(?:-[xy])?)-\S+)$/;
    const FREE_PROPS = ["position", "left", "top", "width", "height"];
    function freePosition(el, on) {
        if (!el || el === document.body) return;
        if (on) {
            if (isAbs(el)) return;
            const par = el.parentElement || document.body;
            ensurePositioned(par);
            const o = originOf(par);
            const r = pageRect(el);
            el.style.position = "absolute"; // as pixels for now: askConvert turns them into classes on a Tailwind element
            // an absolute box's margins still push it, so they come off its left / top: it stays exactly where it was
            const cs = getComputedStyle(el);
            setPx(el, "left", r.x - o.x - (parseFloat(cs.marginLeft) || 0)); setPx(el, "top", r.y - o.y - (parseFloat(cs.marginTop) || 0));
            // keep the size only where being absolute would change it (a full-width block shrinks to its content)
            [["width", "w"], ["height", "h"]].forEach(([p, k]) => { if (Math.abs(pageRect(el)[k] - r[k]) > 0.5) setPx(el, p, r[k]); });
        } else {
            // the position classes too, at any breakpoint (absolute md:left-[..] top-10 ...); a size it was given stays
            [...el.classList].filter((t) => POSITION_TOKEN.test(t)).forEach((t) => el.classList.remove(t));
            if (!el.classList.length) el.removeAttribute("class");
            ["position", "left", "top", "width", "height", "transform"].forEach((p) => el.style.removeProperty(p));
            if (!el.getAttribute("style")) el.removeAttribute("style");
        }
    }

    /**
     * Layer order is the order among siblings in the HTML (a later sibling is drawn over an earlier one; in a flex row or column it is also
     * the order across), as in Figma. mode: front, back (all the way), forward, backward (one step). A selection keeps its own order.
     */
    function reorder(mode) {
        const items = sels.filter((el) => el !== document.body && el.parentElement && !isLocked(el));
        if (!items.length) return;
        for (const par of new Set(items.map((el) => el.parentElement))) {
            const mine = Array.prototype.filter.call(par.children, (c) => items.includes(c)); // in page order
            if (mode === "front") mine.forEach((el) => par.appendChild(el));
            else if (mode === "back") [...mine].reverse().forEach((el) => par.insertBefore(el, par.firstElementChild));
            else if (mode === "forward") [...mine].reverse().forEach((el) => { const n = el.nextElementSibling; if (n && !items.includes(n)) n.after(el); });
            else if (mode === "backward") mine.forEach((el) => { const p = el.previousElementSibling; if (p && !items.includes(p)) p.before(el); });
        }
        changed();
    }

    /** Lock or unlock the selection (all locked when any is not, else all unlocked). */
    function toggleLockSelection() {
        const items = sels.filter((el) => el !== document.body);
        if (!items.length) return;
        const on = !items.every((el) => el.hasAttribute("data-wc-locked"));
        items.forEach((el) => (on ? el.setAttribute("data-wc-locked", "") : el.removeAttribute("data-wc-locked")));
        changed();
    }

    /** Hide or show the selection: Tailwind's `hidden` class, so the code says so too. */
    function toggleHiddenSelection() {
        const items = sels.filter((el) => el !== document.body);
        if (!items.length) return;
        const on = !items.every((el) => el.classList.contains("hidden"));
        items.forEach((el) => { el.classList.toggle("hidden", on); if (!el.getAttribute("class")) el.removeAttribute("class"); });
        changed();
    }

    // ── Keyboard ────────────────────────────────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        // while dragging in the layout: Tab tries the next option, Esc puts the element back
        if (gesture && gesture.type === "reorder" && gesture.moved && (e.key === "Escape" || (e.key === "Tab" && gesture.leave))) { e.preventDefault(); if (e.key === "Tab") intentCycle(gesture); else reorderCancel(gesture); return; }
        // Ctrl/Cmd + = / - / 0 zoom the plane, never this frame's page
        if ((e.metaKey || e.ctrlKey) && !e.altKey && ["=", "+", "-", "_", "0"].includes(e.key)) { e.preventDefault(); post({ type: "zoomKey", key: e.key }); return; }
        if (editing) {
            if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); finishEdit(); }
            return;
        }
        const meta = e.metaKey || e.ctrlKey;
        const k = e.key.toLowerCase();
        if (e.code === "Space") { e.preventDefault(); post({ type: "space", down: true }); return; }
        if (e.key === "Enter" && !meta && !e.altKey && tool === "move" && sels.length === 1) { // Figma: Enter goes into the box, Shift+Enter back out to what holds it
            const cur = sels[0];
            if (e.shiftKey) { const par = cur.parentElement; if (par && par !== document.body) { e.preventDefault(); inside = par.parentElement && par.parentElement !== document.body ? par.parentElement : null; setSelection([par]); } return; }
            const kid = !isTextual(cur) && realKids(cur).find((c) => getComputedStyle(c).display !== "none");
            if (kid) { e.preventDefault(); inside = cur; setSelection([kid]); return; }
        }
        if (meta && k === "g") { e.preventDefault(); e.shiftKey ? ungroup() : group(); return; }
        if (meta && (e.code === "BracketRight" || e.code === "BracketLeft")) { e.preventDefault(); reorder(e.code === "BracketRight" ? (e.shiftKey ? "front" : "forward") : (e.shiftKey ? "back" : "backward")); return; }
        if (meta && e.shiftKey && k === "l") { e.preventDefault(); toggleLockSelection(); return; }
        if (meta && e.shiftKey && k === "h") { e.preventDefault(); toggleHiddenSelection(); return; }
        if (e.shiftKey && !meta && k === "a") { e.preventDefault(); autoLayout(); return; }
        if (e.shiftKey && !meta && k === "g") { e.preventDefault(); gridLayout(); return; }
        if (meta && !e.shiftKey && k === "a") { e.preventDefault(); selectAll(); return; }
        if (meta && k === "d") { e.preventDefault(); duplicate(); return; }
        if (meta && !e.shiftKey && (k === "c" || k === "x") && sels.length) { e.preventDefault(); copySelection(k === "x"); return; }
        if (meta && !e.shiftKey && k === "v") { e.preventDefault(); pasteSelection(); return; }
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelection(); return; }
        if (e.key.startsWith("Arrow") && sels.length) {
            e.preventDefault();
            const s = e.shiftKey ? 10 : 1;
            nudge(e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0, e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0);
            return;
        }
        if (e.key === "Escape") { e.preventDefault(); if (tool !== "move") setTool("move"); else if (inside && sels.length && sels.every((el) => inside.contains(el))) setSelection([inside]); else setSelection([]); return; }
        if (e.shiftKey && (e.key === "!" || e.key === "@")) { e.preventDefault(); post({ type: "key", key: e.key, meta: false, shift: true }); return; }
        const forward = (meta && ["z", "y", "s"].includes(k)) || (!meta && !e.altKey && ["v", "f", "r", "o", "t", "i", "b", "h", "p"].includes(k));
        if (forward) { e.preventDefault(); post({ type: "key", key: k, meta, shift: e.shiftKey }); }
    }, true);

    // the editor owns the plane: scrolling pans it and Ctrl/Cmd + scroll (or a pinch) zooms it
    window.addEventListener("wheel", (e) => {
        e.preventDefault();
        post({ type: "wheel", x: e.clientX, y: e.clientY, dx: e.deltaX, dy: e.deltaY, zoom: e.ctrlKey || e.metaKey });
    }, { passive: false });

    document.addEventListener("keyup", (e) => { if (e.code === "Space" && !editing) post({ type: "space", down: false }); }, true);

    // ── While editing, the page holds still: hover, focus and active styles are off ──────────────────────
    // A button that changes colour under the pointer, or a field's focus ring, would get in the way of selecting and editing (and
    // the panel would show a look that isn't the element's own). Every rule for those states (hover:, focus:, active:, group-hover:,
    // in Tailwind's output or the design's CSS) is rewritten to match an attribute instead (data-wc-state="hover"), which no element
    // has, so it shows nowhere; the Interact tool shows the page with them, live. The panel's State picks one to show on the selected
    // element (previewState), so its hover look can be seen and edited. Tailwind rewrites its styles as classes change, so new rules
    // are caught as they appear.
    // a real pseudo-class, not an escaped colon inside a class name (.md\:hover\:bg-x is a name; its :hover at the end is the state)
    const STATE = /(?<!\\):(?:hover|focus-visible|focus-within|focus|active)\b/;
    const STATES = /(?<!\\):(?:hover|focus-visible|focus-within|focus|active)\b/g;
    function freezeStates() {
        const walk = (rules) => {
            for (const r of rules) {
                if (r.selectorText && STATE.test(r.selectorText)) { try { r.selectorText = r.selectorText.replace(STATES, (m) => `[data-wc-state~="${m.slice(1)}"]`); } catch (_) { /* a selector the browser won't take back stays */ } }
                if (r.cssRules) walk(r.cssRules); // @media, @supports, @layer, and nested rules (&:hover)
            }
        };
        for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch (_) { /* a stylesheet from another site can't be read */ } }
    }
    freezeStates();
    /**
     * The state picked in the panel, shown on the selected element: hover / focus / active on the element itself, group-hover on
     * its .group parent, peer-hover on the .peer before it. Kept as the selection changes; never saved (serialize strips it).
     */
    function showState() {
        document.querySelectorAll("[data-wc-state]").forEach((n) => n.removeAttribute("data-wc-state"));
        const el = primary();
        if (!shownState || !el || el === document.body) return;
        const m = shownState.match(/^(group|peer)-(hover|focus|focus-visible|focus-within|active)$/);
        let target = el, st = shownState;
        if (m) {
            st = m[2];
            if (m[1] === "group") target = el.parentElement && el.parentElement.closest(".group");
            else { target = el.previousElementSibling; while (target && !target.classList.contains("peer")) target = target.previousElementSibling; }
        }
        if (target && /^(hover|focus|focus-visible|focus-within|active)$/.test(st)) target.setAttribute("data-wc-state", st === "focus-visible" ? "focus focus-visible" : st);
    }
    document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "LINK") freezeStates(); }, true); // a stylesheet that arrives later

    // Tailwind writes its styles a moment after an element appears, so the numbers the editor shows can be stale
    let infoTimer = null;
    new MutationObserver(() => {
        freezeStates();
        redraw();
        clearTimeout(infoTimer);
        infoTimer = setTimeout(() => {
            if (gesture) return;
            if (primary() && alive(primary())) post({ type: "info", info: describe(primary()) });
            else post({ type: "body", info: describe(document.body) }); // nothing selected: the page panel's styling of the body
        }, 150);
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("resize", redraw);
    new ResizeObserver(() => { redraw(); post({ type: "height", height: Math.ceil(root.getBoundingClientRect().height) }); }).observe(root);

    // images dropped from the desktop become <img> elements
    document.addEventListener("dragover", (e) => { e.preventDefault(); }, true);
    document.addEventListener("drop", (e) => {
        e.preventDefault();
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file || !/^image\//.test(file.type) || file.size > 1500000) return;
        const reader = new FileReader();
        reader.onload = () => {
            const container = containerAt(e.clientX, e.clientY);
            const o = originOf(container);
            const el = createAt("image", container, e.clientX + window.scrollX - o.x, e.clientY + window.scrollY - o.y);
            el.setAttribute("src", reader.result);
            el.setAttribute("alt", file.name.replace(/\.[^.]+$/, ""));
            setSelection([el]);
            changed();
        };
        reader.readAsDataURL(file);
    }, true);

    // ── Commands from the editor ────────────────────────────────────────────────────────────
    const applyAnimation = (el, m) => {
        const re = new RegExp(m.strip);
        const cls = [...(el.getAttribute("class") || "").split(/\s+/).filter((t) => t && !re.test(t)), ...(m.classes || [])];
        if (cls.length) el.setAttribute("class", cls.join(" ")); else el.removeAttribute("class");
        (m.removeAttrs || []).forEach((n) => el.removeAttribute(n));
        Object.keys(m.attrs || {}).forEach((k) => el.setAttribute(k, m.attrs[k]));
    };
    const mutate = {
        setClasses: (el, m) => { m.value ? el.setAttribute("class", m.value) : el.removeAttribute("class"); },
        /** Another tag for the element (div -> section, p -> h2...), if it's one it can validly become: attributes and children move over unchanged. */
        setTag: (el, m) => {
            const tag = String(m.tag || "").toLowerCase();
            if (tag === el.tagName.toLowerCase() || !tagOptions(el).includes(tag)) return;
            const next = document.createElement(tag);
            Array.prototype.forEach.call(el.attributes, (at) => next.setAttribute(at.name, at.value));
            while (el.firstChild) next.appendChild(el.firstChild);
            el.replaceWith(next);
            if (made.has(el)) made.add(next);
            sels = sels.map((x) => (x === el ? next : x));
        },
        setText: (el, m) => { if (el.children.length === 0) el.textContent = m.text; },
        // wire an element to an animation: the animation's classes replace what was there (m.strip is the pattern of those classes), attributes are set or taken off
        setAnimation: (el, m) => applyAnimation(el, m),
        // the same for every child of the element, each with its own --i (0, 1, 2...), so a delay of calc(var(--i) * step) makes them play one after another
        stagger: (el, m) => { Array.prototype.filter.call(el.children, (c) => !/^(SCRIPT|STYLE)$/.test(c.tagName) && !isOverlay(c)).forEach((c, i) => { applyAnimation(c, m); c.style.setProperty("--i", String(i)); }); },
        // a heading's text as letters (or words), each its own span with --i, so an entrance can run letter by letter; the element keeps its words in aria-label so readers still get them
        revealText: (el, m) => {
            if (el.children.length || !el.textContent.trim()) return; // only plain text
            const text = el.textContent, by = m.by === "words" ? "words" : "letters";
            el.setAttribute("aria-label", text.trim().replace(/\s+/g, " ")); el.setAttribute("data-split", by); el.textContent = "";
            let i = 0;
            text.split(/(\s+)/).forEach((tok) => {
                if (!tok) return;
                if (/^\s+$/.test(tok)) { el.appendChild(document.createTextNode(" ")); return; }
                const word = document.createElement("span"); word.className = "inline-block whitespace-nowrap"; word.setAttribute("aria-hidden", "true");
                if (by === "words") { word.textContent = tok; word.style.setProperty("--i", String(i++)); applyAnimation(word, m); }
                else for (const ch of tok) { const c = document.createElement("span"); c.className = "inline-block"; c.textContent = ch; c.style.setProperty("--i", String(i++)); applyAnimation(c, m); word.appendChild(c); }
                el.appendChild(word);
            });
        },
        unsplitText: (el) => { if (!el.hasAttribute("data-split")) return; el.textContent = el.getAttribute("aria-label") || el.textContent; el.removeAttribute("data-split"); el.removeAttribute("aria-label"); },
        // an SVG's lines drawn: each shape's length is measured (--len), dashed to that length, and its offset animated to 0; shape i is delayed by i x gap
        drawSvg: (el, m) => {
            const SHAPES = "path,line,polyline,polygon,circle,ellipse,rect";
            const shapes = el.matches(SHAPES) ? [el] : Array.prototype.slice.call(el.querySelectorAll(SHAPES));
            shapes.forEach((g, i) => {
                if (m.clear) { g.style.removeProperty("--len"); g.style.removeProperty("--i"); applyAnimation(g, m); if (!g.getAttribute("style")) g.removeAttribute("style"); return; }
                let len = 0; try { len = Math.ceil(g.getTotalLength()); } catch (e) { /* not measurable */ }
                if (!len) return;
                g.style.setProperty("--len", String(len)); g.style.setProperty("--i", String(i));
                if (m.outline) { if (!g.getAttribute("stroke")) g.setAttribute("stroke", "currentColor"); g.setAttribute("fill", "none"); }
                applyAnimation(g, m);
            });
        },
        setAttr: (el, m) => { m.value === null ? el.removeAttribute(m.name) : el.setAttribute(m.name, m.value); },
        remove: (el) => { const p = el.parentElement; el.remove(); sels = p && p !== root ? [p] : []; },
        duplicate: (el) => { const c = el.cloneNode(true); el.after(c); if (made.has(el)) markMade(c); sels = [c]; },
        move: (el, m) => {
            if (m.dir < 0 && el.previousElementSibling) el.previousElementSibling.before(el);
            if (m.dir > 0 && el.nextElementSibling) el.nextElementSibling.after(el);
        },
        front: (el) => { if (el.parentElement) el.parentElement.appendChild(el); },
        back: (el) => { const p = el.parentElement; if (p) p.insertBefore(el, p.firstElementChild); },
        toggleLock: (el) => { if (el.hasAttribute("data-wc-locked")) el.removeAttribute("data-wc-locked"); else el.setAttribute("data-wc-locked", ""); },
        toggleHidden: (el) => { el.classList.toggle("hidden"); if (!el.getAttribute("class")) el.removeAttribute("class"); },
        moveTo: (el, m) => {
            const t = elAt(m.targetPath);
            if (!t || el.contains(t) || el === t) return;
            if (!staysInGroup(el, m.position === "inside" ? t : t.parentElement)) return; // in a group: it stays there until ungrouped
            if (m.position === "before") t.before(el);
            else if (m.position === "after") t.after(el);
            else t.appendChild(el);
        },
        replaceOuter: (el, m) => {
            const tpl = document.createElement("template");
            tpl.innerHTML = m.html;
            const n = tpl.content.firstElementChild;
            if (n) { el.replaceWith(n); sels = sels.includes(el) ? sels.map((x) => (x === el ? n : x)) : sels; } // the selection stays where it is
        },
        insert: (el, m) => {
            const tpl = document.createElement("template");
            tpl.innerHTML = m.html;
            const n = tpl.content.firstElementChild;
            if (!n) return;
            if (m.position === "inside") el.appendChild(n); else el.after(n);
            markMade(n);
            sels = [n];
        },
        setGeom: (el, m) => {
            const abs = isAbs(el);
            if (abs && m.x !== undefined && m.x !== null) setPx(el, "left", m.x);
            if (abs && m.y !== undefined && m.y !== null) setPx(el, "top", m.y);
            if (m.w !== undefined && m.w !== null) setPx(el, "width", Math.max(1, m.w));
            if (m.h !== undefined && m.h !== null) setPx(el, "height", Math.max(1, m.h));
            if (m.rot !== undefined && m.rot !== null) { el.style.transform = Number(m.rot) % 360 === 0 ? "" : `rotate(${Number(m.rot)}deg)`; if (!el.style.transform) el.style.removeProperty("transform"); }
        },

        setStyleProps: (el, m) => {
            Object.keys(m.props).forEach((prop) => { const v = m.props[prop]; if (v === null || v === "") el.style.removeProperty(prop); else el.style.setProperty(prop, v); });
            if (!el.getAttribute("style")) el.removeAttribute("style");
        },
        setStyleProp: (el, m) => {
            if (m.value === null || m.value === "") el.style.removeProperty(m.prop);
            else el.style.setProperty(m.prop, m.value);
            if (!el.getAttribute("style")) el.removeAttribute("style");
        },
    };

    window.addEventListener("message", (e) => {
        if (e.source !== parent) return;
        const m = e.data || {};
        if (m.cmd === "load") {
            editing = null;
            document.body.innerHTML = m.html;
            sels = m.selectPath ? [elAt(m.selectPath)].filter(Boolean) : [];
            changed(true);
            if (primary()) post({ type: "selected", info: describe(primary()) });
            return;
        }
        if (m.cmd === "extPointer") { // a drag that left the frame: the page around it sends the pointer on (the frame gets nothing outside itself)
            const ev = { clientX: m.x, clientY: m.y, shiftKey: Boolean(m.shift), altKey: Boolean(m.alt), metaKey: Boolean(m.meta), ctrlKey: Boolean(m.ctrl), button: 0, target: document.body, preventDefault() {}, stopPropagation() {} };
            if (m.ev === "up") onUp(ev); else if (gesture) onMove(ev);
            return;
        }
        if (m.cmd === "selectAll") { selectAll(); return; }
        if (m.cmd === "select") { if (Array.isArray(m.paths)) setSelection(m.paths.map(elAt).filter(Boolean)); else select(elAt(m.path)); return; } // paths: several at once
        if (m.cmd === "injectAnim") { // a new animation shows at once, without reloading the design: its keyframes and class, in the page's head (not part of the design's markup)
            let st = document.querySelector("style[data-wc-anim]");
            if (!st) { st = document.createElement("style"); st.dataset.wcAnim = ""; document.head.appendChild(st); }
            st.textContent += String(m.css || "").replace(/<\/style/gi, "");
            return;
        }
        if (m.cmd === "previewAnim") { // the canvas shows a design at rest (see stillStyle); for a few seconds it moves, so an animation can be seen
            if (previewRestore) { clearTimeout(previewTimer); previewRestore(); } // a preview still running is ended first, so what it held is put back before this one holds it
            stillStyle.disabled = true;
            // animations that wait for a scroll or a click (the page's script is not running here) are released for the preview, then put back
            const held = [];
            document.querySelectorAll("[data-reveal]").forEach((e) => { held.push([e, "data-reveal", e.getAttribute("data-reveal")]); e.setAttribute("data-reveal", "in"); });
            document.querySelectorAll("[data-click-anim]").forEach((e) => { held.push([e, "data-play", e.getAttribute("data-play")]); e.setAttribute("data-play", "on"); });
            previewRestore = () => { previewRestore = null; stillStyle.disabled = false; held.forEach(([e, a, v]) => { if (v === null) e.removeAttribute(a); else e.setAttribute(a, v); }); };
            previewTimer = setTimeout(() => previewRestore && previewRestore(), Math.min(15000, Math.max(500, Number(m.ms) || 4000)));
            return;
        }
        if (m.cmd === "previewState") { shownState = m.state || ""; showState(); redraw(); if (primary() && alive(primary())) post({ type: "info", info: describe(primary()) }); return; }
        if (m.cmd === "deselect") { editing = null; setSelection([], true); post({ type: "body", info: describe(document.body) }); return; } // the page's styling, for the page panel
        if (m.cmd === "hover") { hov = m.path ? elAt(m.path) : null; redraw(); return; }
        if (m.cmd === "pickTarget") { picking = Boolean(m.on); root.style.cursor = picking ? "crosshair" : ""; return; } // an interaction's target: the next click names an element
        if (m.cmd === "tool") { setTool(m.tool, true); return; }
        if (m.cmd === "cssProps") { cssProps = m.props || []; return; }
        if (m.cmd === "hstart") { beginHandle(m.hd, m.e); return; }
        if (m.cmd === "hmove") { onMove(m.e); return; }
        if (m.cmd === "hend") { onUp(m.e); return; }
        if (m.cmd === "exec") {
            if (editing && m.name) { editing.focus(); document.execCommand(m.name, false, m.arg || null); postEditing(); }
            return;
        }
        if (m.cmd === "view") { zoom = m.zoom || 1; lineWidths(); redraw(); return; }
        if (m.cmd === "scrollTo") { const el = elAt(m.path); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
        if (m.cmd === "align") { align(m.mode); return; }
        if (m.cmd === "order") { reorder(m.mode); return; }
        if (m.cmd === "lockSel") { toggleLockSelection(); return; }
        if (m.cmd === "hideSel") { toggleHiddenSelection(); return; }
        if (m.cmd === "group") { group(); return; }
        if (m.cmd === "ungroup") { ungroup(); return; }
        if (m.cmd === "deleteSel") { removeSelection(); return; }
        if (m.cmd === "duplicateSel") { duplicate(); return; }
        if (m.cmd === "copySel") { copySelection(false); return; }
        if (m.cmd === "cutSel") { copySelection(true); return; }
        if (m.cmd === "pasteSel") { pasteSelection(); return; }
        if (m.cmd === "nudgeSel") { nudge(m.dx || 0, m.dy || 0); return; }
        if (m.cmd === "dragKey") { if (gesture && gesture.type === "reorder" && gesture.moved) { if (m.key === "Escape") reorderCancel(gesture); else if (m.key === "Tab" && gesture.leave) intentCycle(gesture); } return; }
        if (m.cmd === "applyGesture") { applyGesture(m); return; }
        if (m.cmd === "applyLayout") { applyLayout(m); return; }
        if (m.cmd === "probeGhost") { showProbe(m); return; }
        if (m.cmd === "keepOffset") { keepOffset(); return; }
        if (m.cmd === "freePosition") {
            const el = elAt(m.path);
            if (!el) return;
            if (!m.on) { freePosition(el, false); changed(); return; }
            if (isAbs(el)) return;
            const pre = sourcesOf(el, FREE_PROPS);
            freePosition(el, true);
            askConvert([gestureItem(el, pre, FREE_PROPS)]);
            return;
        }
        if (m.cmd === "groupOn") { // one class change (a group's class at a breakpoint / state) on every element of a multiple selection
            (m.paths || []).forEach((pa) => {
                const el = elAt(pa);
                if (!el) return;
                let kept = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
                (m.ops || []).forEach((op) => {
                    const re = new RegExp(op.re);
                    kept = kept.filter((t) => { const i = t.lastIndexOf(":"); return !(t.slice(0, i + 1) === m.vp && re.test(t.slice(i + 1))); });
                    if (op.token) kept.push(m.vp + op.token);
                });
                if (kept.length) el.setAttribute("class", kept.join(" ")); else el.removeAttribute("class");
            });
            changed(false, m.key);
            if (primary() && alive(primary())) post({ type: "selected", info: describe(primary()) });
            return;
        }
        if (m.cmd === "autoLayout") { autoLayout(); return; }
        if (m.cmd === "gridLayout") { gridLayout(); return; }
        if (m.cmd === "setProp") {
            const el = elAt(m.path);
            if (el) setProp(el, m).then(() => { changed(false, m.key); if (primary() && alive(primary())) post({ type: "selected", info: describe(primary()) }); });
            return;
        }
        if (mutate[m.cmd]) {
            const el = elAt(m.path);
            if (!el) return;
            mutate[m.cmd](el, m);
            changed(false, m.key); // the editor's undo key comes back with the result
            if (primary() && alive(primary())) post({ type: "selected", info: describe(primary()) });
        }
    });

    post({ type: "ready", html: serialize(), tree: tree() });
    // the page panel shows the page's styling from the start: sent again once the styles have loaded, when the values are real
    // the animations the design's Tailwind config defines (its animation section), so the panel can offer them next to Tailwind's own
    const BUILTIN_ANIM = ["none", "spin", "ping", "pulse", "bounce"];
    const postNames = () => {
        const t = (window.tailwind && window.tailwind.config && window.tailwind.config.theme) || {};
        const names = Object.keys({ ...(t.animation || {}), ...((t.extend || {}).animation || {}) }).filter((n) => !BUILTIN_ANIM.includes(n));
        post({ type: "tw-names", animations: names });
    };
    postNames();
    window.addEventListener("load", () => setTimeout(postNames, 300));
    const postBody = () => { if (!primary()) post({ type: "body", info: describe(document.body) }); };
    postBody();
    if (document.readyState === "complete") setTimeout(postBody, 300); else window.addEventListener("load", () => setTimeout(postBody, 100));
}
