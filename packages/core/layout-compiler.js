// Layout compiler: from loose pieces placed anywhere (a free canvas, as in Figma) to well-structured Tailwind.
//
// The designer places pieces; the compiler writes the structure. Input is a flat list of pieces with their rectangles:
//   leaf     text, an image, a button, an icon: kept whole, with its own look (classes)
//   surface  a box that is seen (a background, a border, a shadow): a card, a bar, a section; it can hold other pieces
// Nothing else is given: no wrappers, no flex, no nesting. The compiler rebuilds them:
//   1. containment: a piece sits in the smallest surface (painted below it) that holds it
//   2. inside each surface: cut the pieces into rows and columns (XY cut), and group them by spacing, the closest first
//      (proximity, as people read a layout: a title and its subtitle belong together before the buttons under them)
//   3. each group becomes flex (a row, a column) or grid; spacing is gap-*, padding is p-*, alignment is items-* / self-* /
//      justify-*, and only the sizes the layout cannot give are written (w-*, flex-1)
//   4. pieces that overlap are layers (absolute), the only place absolute is written
// Pure functions of numbers and class strings, so it runs in Node and in the browser. Measuring is the caller's: `fixes`
// (sizes measured off where a first render came out different) are written as explicit sizes on the next compile.

/**
 * Everything in one function, so the editor's frame (which gets its script as text) can run the same code: layoutKit.toString().
 * Nothing in it reaches outside it.
 */
export function layoutKit() {
    const TOL = 2;
    const near = (a, b, t = TOL) => Math.abs(a - b) <= t;
    const right = (r) => r.x + r.w, bottom = (r) => r.y + r.h;
    const bboxOf = (list) => {
        const x = Math.min(...list.map((r) => r.x)), y = Math.min(...list.map((r) => r.y));
        return { x, y, w: Math.max(...list.map(right)) - x, h: Math.max(...list.map(bottom)) - y };
    };

    // ── Tailwind values ─────────────────────────────────────────────────────────────────────────────────────────────────
    const STEP_PX = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384];
    const STEP_NAME = ["0", "px", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "16", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56", "60", "64", "72", "80", "96"];
    /** A length in px as a Tailwind value: the scale step when it is one (within half a pixel), else an arbitrary value. */
    function tw(px) {
        const v = Math.max(0, px), i = STEP_PX.findIndex((s) => Math.abs(s - v) <= 0.5);
        return i >= 0 ? STEP_NAME[i] : `[${Math.round(v)}px]`;
    }
    const isArb = (cls) => /\[/.test(cls);
    /** The same space on both sides is padding when it is small (a card's inset), and centring when it is large (a card in the middle of a page). */
    const PAD_MAX = 64;
    // (a section's py-24 or py-32 is padding too: up to 128px when it is a step of the scale)
    const padLike = (m) => m <= PAD_MAX || (m <= 128 && !isArb(tw(m)));
    const insetOf = (a, b) => { const m = Math.min(a, b); return m > 0.5 && padLike(m) ? m : 0; };
    /** Padding on two opposite sides: each its own when both are padding (pt-14 pb-8), else the same on both (the rest is alignment). */
    const sidesOf = (a, b) => (padLike(Math.max(0, a)) && padLike(Math.max(0, b)) ? [Math.max(0, a), Math.max(0, b)] : [insetOf(a, b), insetOf(a, b)]);
    /** Tailwind's named max widths: a centred column of one of these widths is a container (w-full max-w-6xl mx-auto). */
    const MAX_W = { xs: 320, sm: 384, md: 448, lg: 512, xl: 576, "2xl": 672, "3xl": 768, "4xl": 896, "5xl": 1024, "6xl": 1152, "7xl": 1280 };
    const namedMaxW = (w) => Object.keys(MAX_W).find((k) => Math.abs(MAX_W[k] - w) <= 2) || null;

    /** Padding for four sides, in as few classes as they allow (p-6, px-6 py-4, ...). */
    function paddingClasses(t, r, b, l) {
        const T = tw(t), R = tw(r), B = tw(b), L = tw(l), out = [];
        if (T === R && R === B && B === L) return T === "0" ? [] : [`p-${T}`];
        if (L === R) { if (L !== "0") out.push(`px-${L}`); } else { if (L !== "0") out.push(`pl-${L}`); if (R !== "0") out.push(`pr-${R}`); }
        if (T === B) { if (T !== "0") out.push(`py-${T}`); } else { if (T !== "0") out.push(`pt-${T}`); if (B !== "0") out.push(`pb-${B}`); }
        return out;
    }

    // ── Classes: what is a piece's own look, and what was layout (rebuilt here) ─────────────────────────────────────────
    const LAYOUT_RE = /^(-?m[trblxyse]?-|space-[xy]-|gap-|flex$|inline-flex$|grid$|inline-grid$|block$|inline-block$|inline$|flex-(row|col|wrap|nowrap|1|auto|initial|none)|grid-(cols|rows|flow)-|col-|row-|items-|justify-|content-|self-|place-|order-|grow|shrink|basis-|static$|relative$|absolute$|fixed$|sticky$|-?inset-|-?top-|-?right-|-?bottom-|-?left-|z-|float-|clear-|container$|mx-auto$|p[trblxyse]?-|w-|min-w-|max-w-|h-|min-h-|max-h-|size-|aspect-|hidden$|columns-)/;
    /** A leaf keeps its look and its fixed size (an avatar's w-10 h-10); a surface keeps only its look (the compiler sizes it). */
    function splitClasses(cls, kind) {
        const keep = [], layout = [];
        for (const c of String(cls || "").split(/\s+/).filter(Boolean)) {
            const base = c.slice(c.lastIndexOf(":") + 1).replace(/^!/, "");
            let isLayout = LAYOUT_RE.test(base);
            // a leaf's own inside (a button laid out as flex with its icon, its padding) is its look, not the page's layout
            if (kind === "leaf" && /^(p[trblxyse]?-|flex$|inline-flex$|items-|justify-|gap-|grid$|inline-grid$|grid-cols-|relative$|block$|inline-block$)/.test(base)) isLayout = false;
            if (kind === "leaf" && /^(h|size|w|min-h|aspect)-(\d|\[|px)/.test(base) && !/^w-/.test(base)) isLayout = false;
            if (kind === "leaf" && /^w-(\d|\[|px)/.test(base)) isLayout = false; // a fixed width is the piece's own size
            (isLayout ? layout : keep).push(c);
        }
        return { keep, layout };
    }

    // ── 1. Containment ──────────────────────────────────────────────────────────────────────────────────────────────────
    const holds = (s, n) => s.x <= n.x + 1 && s.y <= n.y + 1 && right(s) >= right(n) - 1 && bottom(s) >= bottom(n) - 1;
    function containment(nodes) {
        // smallest first; between two of the same size, the one painted later is inside the other
        const surfaces = nodes.filter((n) => n.kind === "surface").sort((a, b) => a.w * a.h - b.w * b.h || b.z - a.z);
        const kids = new Map([[null, []]]);
        nodes.forEach((n) => kids.set(n, []));
        for (const n of nodes) {
            // painted below it (earlier in paint order) and holding it: the smallest such surface is its parent
            const p = surfaces.find((s) => s !== n && s.z < n.z && holds(s, n) && s.w * s.h >= n.w * n.h) || null;
            kids.get(p).push(n);
        }
        return kids;
    }

    // ── 2. Cutting into rows and columns ────────────────────────────────────────────────────────────────────────────────
    /** Pieces in bands along an axis: a band ends where nothing covers the axis (a gap a cut can go through). */
    function bands(items, ax) {
        const s = ax === "x" ? "x" : "y", z = ax === "x" ? "w" : "h";
        const sorted = items.slice().sort((a, b) => a[s] - b[s]), out = [];
        let end = -Infinity;
        for (const it of sorted) {
            if (out.length && it[s] < end - 0.5) { out[out.length - 1].push(it); end = Math.max(end, it[s] + it[z]); }
            else { out.push([it]); end = it[s] + it[z]; }
        }
        return out;
    }
    const minGap = (bs, ax) => {
        const s = ax === "x" ? "x" : "y", z = ax === "x" ? "w" : "h";
        let m = Infinity;
        for (let i = 1; i < bs.length; i++) { const a = bboxOf(bs[i - 1]), b = bboxOf(bs[i]); m = Math.min(m, b[s] - (a[s] + a[z])); }
        return m;
    };
    const group = (type, items, extra = {}) => ({ type, items, ...bboxOf(items), ...extra });
    /** Bands joined back together, except across the widest gap(s) between them: { parts, gap } (null when there is one band). */
    function widest(bs, ax) {
        if (bs.length < 2) return null;
        const s = ax === "x" ? "x" : "y", z = ax === "x" ? "w" : "h";
        const boxes = bs.map(bboxOf), gaps = boxes.slice(1).map((b, i) => b[s] - (boxes[i][s] + boxes[i][z]));
        const top = Math.max(...gaps), parts = [bs[0].slice()];
        gaps.forEach((g, i) => { if (g >= top - TOL) parts.push(bs[i + 1].slice()); else parts[parts.length - 1].push(...bs[i + 1]); });
        return { parts, gap: top };
    }

    /**
     * Cells in rows whose columns line up (each column starts at the same place and is as wide in every row): a grid.
     * Equal columns are grid-cols-N; columns of their own widths (a table) are grid-cols-[w1_w2_...].
     */
    function asGrid(rows) {
        if (rows.length < 2) return null;
        const cells = rows.map((r) => bands(r, "x"));
        const C = cells[0].length;
        if (C < 2 || cells.some((r) => r.length > C) || cells.slice(0, -1).some((r) => r.length !== C)) return null;
        if (cells.filter((r) => r.length === C).length < 2) return null; // at least two full rows
        if (cells.flat().some((c) => c.length !== 1)) return null;
        const first = cells[0].map((c) => c[0]);
        if (!cells.every((r) => r.every((c, i) => near(c[0].x, first[i].x, 2) && near(c[0].w, first[i].w, 2)))) return null;
        // the same space between every two columns
        const gx = first.slice(1).map((c, i) => c.x - right(first[i]));
        if (gx.some((g) => g < -1) || Math.max(...gx) - Math.min(...gx) > TOL) return null;
        const equal = first.every((c) => near(c.w, first[0].w, 2));
        if (!equal && Math.max(...gx) > 48) return null; // columns of their own widths are a table: close together, not held apart
        return group("grid", cells.flat().map((c) => c[0]), { cols: C, tracks: equal ? null : first.map((c) => c.w) });
    }

    /** The pieces of one box as a tree of rows, columns and grids; overlapping pieces come out as layers. */
    function cut(items, layers) {
        if (items.length === 1) return items[0];
        const by = bands(items, "y"), bx = bands(items, "x");
        if (by.length > 1 && bx.length > 1) {
            const g = asGrid(by);
            if (g) return g;
        }
        // XY cut: through the widest gap first (a tie is read as a column: pages are read top to bottom). Only the gaps that wide are
        // cut here; each part is cut again, so pieces that are closer together end up grouped together (proximity)
        const sy = widest(by, "y"), sx = widest(bx, "x");
        if (sy && (!sx || sy.gap >= sx.gap - 0.5)) return group("col", sy.parts.map((b) => cut(b, layers)));
        if (sx) return group("row", sx.parts.map((b) => cut(b, layers)));
        // no cut goes through: something overlaps. The piece that overlaps the most becomes a layer, and the rest is cut again.
        const area = (a, b) => Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
        let worst = null, most = -1;
        for (const a of items) {
            const o = items.reduce((t, b) => t + (a === b ? 0 : area(a, b)), 0);
            // ties: the one painted on top is the layer (a badge over a card), unless it is the biggest (a background picture)
            if (o > most || (o === most && a.z > worst.z)) { most = o; worst = a; }
        }
        const biggest = items.reduce((m, a) => (a.w * a.h > m.w * m.h ? a : m));
        const layer = worst === biggest && items.length > 1 ? biggest : worst;
        layers.push(layer);
        return cut(items.filter((a) => a !== layer), layers);
    }

    /** Pieces along one axis grouped by spacing: the closest ones first, until every group has one even gap (proximity). */
    function byProximity(type, list) {
        const s = type === "row" ? "x" : "y", z = type === "row" ? "w" : "h";
        let seq = list;
        for (;;) {
            if (seq.length <= 2) return seq.length === 1 ? seq[0] : group(type, seq);
            const gaps = seq.slice(1).map((b, i) => b[s] - (seq[i][s] + seq[i][z]));
            const lo = Math.min(...gaps), hi = Math.max(...gaps);
            if (hi - lo <= TOL * 2) return group(type, seq);
            // the closest pieces become a group of their own (same direction), and the rest is looked at again
            const next = [];
            for (let i = 0; i < seq.length;) {
                let j = i;
                while (j < gaps.length && gaps[j] <= lo + TOL) j++;
                next.push(j > i ? group(type, seq.slice(i, j + 1)) : seq[i]);
                i = j + 1;
            }
            if (next.length === seq.length) return group(type, seq);
            seq = next;
        }
    }

    // ── 3. Writing classes ──────────────────────────────────────────────────────────────────────────────────────────────
    const isGroup = (it) => it && (it.type === "row" || it.type === "col" || it.type === "grid");
    /** About how wide something is on its own (its content's width): known for text, added up for groups, a surface's own width. */
    function natW(it) {
        if (it.kind === "leaf") return it.nat ?? it.w;
        if (!isGroup(it)) return it.natW ?? it.w;
        if (it.type === "row") return it.items.reduce((t, c) => t + natW(c), 0) + Math.max(0, it.w - it.items.reduce((t, c) => t + c.w, 0));
        return Math.max(...it.items.map(natW));
    }
    /** About how tall something is on its own (its content's height): measured for pieces when known, added up for groups. */
    function natH(it) {
        if (!isGroup(it)) return it.natH ?? it.h;
        if (it.type === "col") return it.items.reduce((t, c) => t + natH(c), 0) + Math.max(0, it.h - it.items.reduce((t, c) => t + c.h, 0));
        if (it.type === "row") return Math.max(...it.items.map(natH));
        return it.h;
    }

    /**
     * Lays out one group inside `box` (the space it has): its own classes, and the classes each child needs to sit where it is.
     * `out` collects { cls, kids } per group; `childCls` (a Map) collects per-child classes (alignment and size).
     */
    function layoutGroup(g, box, childCls, wrapper = false, given = true) {
        const cls = [];
        const add = (it, c) => childCls.set(it, [...(childCls.get(it) || []), ...c]);
        if (g.type === "grid") {
            const xs = [...new Set(g.items.map((c) => Math.round(c.x)))].sort((a, b) => a - b);
            const ys = [...new Set(g.items.map((c) => Math.round(c.y)))].sort((a, b) => a - b);
            const w = g.items[0].w, gx = g.cols > 1 ? g.items[1].x - right(g.items[0]) : 0;
            const tracks = g.tracks || Array(g.cols).fill(w);
            const row0 = g.items.filter((c) => near(c.y, ys[0], 2)), rh = Math.max(...row0.map((c) => c.h));
            const gy = ys.length > 1 ? ys[1] - ys[0] - rh : 0;
            cls.push("grid", g.tracks ? `grid-cols-[${g.tracks.map((t) => Math.round(t) + "px").join("_")}]` : `grid-cols-${g.cols}`);
            if (near(gx, gy, 1)) { if (tw(gx) !== "0") cls.push(`gap-${tw(gx)}`); }
            else { if (tw(gx) !== "0") cls.push(`gap-x-${tw(gx)}`); if (tw(gy) !== "0") cls.push(`gap-y-${tw(gy)}`); }
            // the grid's columns fill its box: if the cells end short of it, the grid gets the width
            // cells in each row: all as tall as the row (stretch, the default), or all at its top, middle or bottom
            const cellRows = [];
            for (let i = 0; i < g.items.length; i += g.cols) cellRows.push(g.items.slice(i, i + g.cols));
            const al = (k) => cellRows.every((r) => { const top = Math.min(...r.map((c) => c.y)), bot = Math.max(...r.map(bottom)); return r.every((c) => k === "start" ? near(c.y, top) : k === "end" ? near(bottom(c), bot) : k === "center" ? near(c.y + c.h / 2, (top + bot) / 2) : near(c.y, top) && near(bottom(c), bot)); });
            const ia = ["stretch", "end", "start", "center"].find(al);
            if (ia && ia !== "stretch") cls.push(`items-${ia}`);
            const used = tracks.reduce((t, v) => t + v, 0) + (g.cols - 1) * gx;
            const kids = g.items.map((c, i) => ({ it: c, box: { x: c.x, y: c.y, w: tracks[i % g.cols], h: c.h }, given: c.type === "row" }));
            return { cls, kids, width: near(used, box.w, 2) ? null : used };
        }
        const row = g.type === "row";
        const S = row ? "x" : "y", Z = row ? "w" : "h", CS = row ? "y" : "x", CZ = row ? "h" : "w";
        if (row && given && g.items.length >= 3) {
            // equal cells side by side, evenly spaced, filling the row: a grid of N columns (cards, chart labels)
            const it0 = g.items, cw = it0[0].w, gp = it0.slice(1).map((b, i) => b.x - right(it0[i]));
            const even = it0.every((c) => near(c.w, cw, 1.5)) && Math.max(...gp) - Math.min(...gp) <= TOL;
            if (even && near(it0[0].x, box.x) && near(right(it0[it0.length - 1]), right(box)) && !it0.every((c) => c.kind === "leaf" && near(c.nat ?? c.w, c.w))) {
                return layoutGroup({ ...g, type: "grid", cols: it0.length }, box, childCls, false, true);
            }
        }
        cls.push("flex");
        if (!row) cls.push("flex-col");
        const items = g.items, n = items.length;
        const gaps = items.slice(1).map((b, i) => b[S] - (items[i][S] + items[i][Z]));
        const gap = n > 1 ? gaps.reduce((t, v) => t + v, 0) / gaps.length : 0;
        let lead = items[0][S] - box[S], trail = box[S] + box[Z] - (items[n - 1][S] + items[n - 1][Z]);
        if (wrapper) {
            // a wrapper given the full width (height) pads itself when its content is inset the same on both sides
            const pad = insetOf(lead, trail);
            if (pad && near(lead, trail, TOL * 2)) { cls.push(`p${row ? "x" : "y"}-${tw(pad)}`); lead -= pad; trail -= pad; box = { ...box, [S]: box[S] + pad, [Z]: box[Z] - 2 * pad }; }
            // and across: its content inset the same on both sides is padding (small) or a centred container (a named max width)
            const c0 = Math.min(...items.map((it) => it[CS])) - box[CS], c1 = box[CS] + box[CZ] - Math.max(...items.map((it) => it[CS] + it[CZ]));
            if (c0 > TOL && near(c0, c1, 4)) {
                const inner = box[CZ] - c0 - c1, named = !row && c0 > 32 ? namedMaxW(inner) : null;
                if (named) cls.push("w-full", `max-w-${named}`, "mx-auto");
                else if (padLike(c0)) cls.push(`p${row ? "y" : "x"}-${tw(c0)}`);
                if (named || padLike(c0)) box = { ...box, [CS]: box[CS] + c0, [CZ]: inner };
            }
        }
        // along the axis: a gap, or the space spread between the ends (two pieces held apart: a logo and a button)
        // (only when its length is given from outside: a group as long as its content has no space to spread)
        const spreadOut = given && n >= 2 && near(lead, 0) && near(trail, 0) && gap > 64 && (n === 2 || isArb(tw(gap)));
        if (spreadOut) cls.push("justify-between");
        else {
            if (tw(gap) !== "0") cls.push(`gap-${tw(gap)}`);
            if (lead > TOL && near(lead, trail, TOL * 2)) cls.push("justify-center");
            else if (lead > TOL && near(trail, 0)) cls.push("justify-end");
            else if (lead > TOL) cls.push(`p${row ? "l" : "t"}-${tw(lead)}`);
        }
        // across the axis: every child's possible alignments; the one most children share is items-*, the rest get self-*
        const fits = items.map((it) => {
            const f = new Set();
            if (near(it[CS], box[CS])) f.add("start");
            if (near(it[CS] + it[CZ], box[CS] + box[CZ])) f.add("end");
            if (near(it[CS] + it[CZ] / 2, box[CS] + box[CZ] / 2)) f.add("center");
            // stretch: as wide (tall) as the box, and able to be (a group or a surface, or a leaf that was stretched)
            if (near(it[CZ], box[CZ]) && near(it[CS], box[CS]) && (isGroup(it) || it.kind === "surface" || !row || it.block)) f.add("stretch");
            if (isGroup(it)) f.add("stretch"); // a group can always take the full width (height) and place its own children
            // a centred surface of a named width in a column: w-full max-w-* mx-auto (it fills a narrow screen, and centres on a wide one)
            if (!row && it.kind === "surface" && f.has("center") && !f.has("stretch") && namedMaxW(it.w) && it.w >= 320) { f.add("stretch"); it.container = namedMaxW(it.w); }
            return f;
        });
        const order = ["stretch", "start", "center", "end"];
        // groups can be any size, so pieces vote on items-*; a group that does not get stretch from it asks for it (self-stretch)
        const voters = fits.filter((f, i) => !isGroup(items[i]));
        const score = (a) => (voters.length ? voters : fits).filter((f) => f.has(a)).length;
        const items_ = order.reduce((best, a) => (score(a) > score(best) ? a : best), "stretch");
        if (items_ !== "stretch") cls.push(`items-${items_}`);
        // in a row, at most one child fills what is left (flex-1): the one with the most width beyond its content
        const excess = (it) => (it.replaced ? 0 : it.w - natW(it));
        const filler = row && given && n > 1 && near(trail, 0) ? items.reduce((m, it) => (excess(it) > excess(m) ? it : m)) : null;
        // in a column, the one taller than its content that reaches the end takes what is left (flex-1): a sidebar row under a header
        const excessH = (it) => (it.replaced || it.fixedH ? 0 : it.h - natH(it));
        const fillerH = !row && given && near(trail, 0) ? items.reduce((m, it) => (excessH(it) > excessH(m) ? it : m)) : null;
        const kids = items.map((it, i) => {
            let al = isGroup(it) && voters.length ? "stretch" : fits[i].has(items_) ? items_ : order.find((a) => fits[i].has(a));
            const c = [];
            if (al !== items_) {
                if (al) c.push(`self-${al}`);
                else { c.push("self-start", `m${row ? "t" : "l"}-${tw(it[CS] - box[CS])}`); al = "start"; }
            }
            // the space this child is given: all of the cross axis when it stretches, its own size otherwise
            if (al === "stretch" && it.container && !near(it.w, box.w)) c.push("w-full", `max-w-${it.container}`, "mx-auto");
            const kb = al === "stretch" && !(it.container && !near(it.w, box.w)) ? (row ? { x: it.x, w: it.w, y: box.y, h: box.h } : { x: box.x, w: box.w, y: it.y, h: it.h }) : { x: it.x, y: it.y, w: it.w, h: it.h };
            // sizes: a leaf whose width is not its natural width, in a row (along) or not stretched in a column (across)
            if (it.kind === "leaf" && it.replaced) {
                // an image or an icon is drawn at a size: its own classes give it, or it is written here (as wide as its box: w-full)
                if (!it.fixedW) c.push(!row && al === "stretch" && near(it.w, box.w) ? "w-full" : `w-${tw(it.w)}`);
                if (!it.fixedH) c.push(`h-${tw(it.h)}`);
                if (row) c.push("shrink-0");
            } else if (it.kind === "leaf") {
                const nat = it.nat ?? it.w;
                if (row && !near(it.w, nat)) {
                    const others = items.reduce((t, o) => t + (o === it ? 0 : o.w), 0) + (spreadOut ? 0 : gap * (n - 1));
                    if (it === filler && near(it.w, box.w - others - Math.max(0, lead), 3)) c.push("flex-1", "min-w-0");
                    else c.push(`w-${tw(it.w)}`, "shrink-0");
                } else if (!row && al !== "stretch" && !near(it.w, nat)) c.push(`w-${tw(it.w)}`);
                else if (!row && al === "stretch" && !near(it.w, nat) && !it.block) c.push("w-full"); // an image or a button as wide as its box
                else if (row && nat > it.w + TOL) c.push("min-w-0");
                if (row && it.fixedW && !c.includes("shrink-0")) c.push("shrink-0"); // its own width holds next to one that fills
            } else {
                // a group or a surface: hug its content (nothing to write), fill what is left (flex-1), or a fixed size (w-*, h-*)
                const others = items.reduce((t, o) => t + (o === it ? 0 : o.w), 0) + (spreadOut ? 0 : gap * (n - 1));
                const fills = it === filler && !spreadOut && near(it.w, box.w - others - Math.max(0, lead), 3);
                const surf = it.kind === "surface" && !c.includes("w-full");
                const sized = surf || (isGroup(it) && it.w < natW(it) - TOL); // a group narrower than its content: its text wraps at a width
                if (row && !near(it.w, natW(it))) {
                    if (fills && it.w > natW(it)) c.push("flex-1", "min-w-0");
                    else if (sized) c.push(`w-${tw(it.w)}`, "shrink-0");
                } else if (!row && al !== "stretch" && sized && !near(it.w, natW(it))) c.push(`w-${tw(it.w)}`);
                if (surf && it.natH !== undefined && !near(it.h, it.natH)) {
                    const tall = row ? al !== "stretch" : true;
                    const colFills = !row && near(trail, 0) && n > 1 && it === items[n - 1] && it.h > it.natH;
                    if (colFills) c.push("flex-1");
                    else if (tall) c.push(`h-${tw(it.h)}`);
                }
            }
            // heights, when the content's own height is known (a box stretched by the page, a sidebar as tall as the screen)
            if (!it.replaced && !(it.kind === "leaf" && it.fixedH) && it.kind !== "surface" && !near(it.h, natH(it))) {
                if (!row && it === fillerH && it.h > natH(it) + TOL) c.push("flex-1", "min-h-0");
                else if (!row || al !== "stretch") c.push(`h-${tw(it.h)}`);
            }
            if (c.length) add(it, c);
            // a child group's length along its own axis is given when the parent stretches it that way (a row across a column)
            // (flex-1 gives length along the parent's axis: to a child laid out along that same axis)
            const kidGiven = isGroup(it) && ((al === "stretch" && (it.type === "row") === !row) || (c.includes("flex-1") && (it.type === "row") === row));
            return { it, box: kb, given: kidGiven };
        });
        return { cls, kids };
    }

    /**
     * Compiles pieces into a tree of elements.
     * @param {{x:number,y:number,w:number,h:number}} page  the page's box
     * @param {Array<{k:string,kind:"leaf"|"surface",x:number,y:number,w:number,h:number,z:number,nat?:number,block?:boolean}>} nodes
     * @param {{fixes?: Record<string,{w?:number,h?:number}>}} [opts]  sizes to write explicitly (measured off a first render)
     * @returns {{tag:"page", cls:string[], kids:any[]}} elements: { k, cls, kids } for pieces, { group:true, cls, kids } for wrappers
     */
    function compile(page, nodes, { fixes = {}, pad = null } = {}) {
        const kids = containment(nodes);
        if (nodes.length) { const bb = bboxOf(nodes); const w = Math.max(page.w, right(bb) - page.x), h = Math.max(page.h, bottom(bb) - page.y); page = { ...page, w, h, grewW: w > page.w + 0.5, grewH: h > page.h + 0.5 }; }
        // what each surface would be on its own (hugging its content): its content's size plus its padding and border, smallest first
        for (const s of nodes.filter((n) => n.kind === "surface").sort((a, b) => a.w * a.h - b.w * b.h)) {
            const items = kids.get(s) || [];
            const bw = (s.bl || 0) + (s.br || 0), bh = (s.bt || 0) + (s.bb || 0);
            const L = [], t = items.length ? cut(items, L) : null, flow = items.filter((i) => !L.includes(i));
            if (!t) { s.natW = bw; s.natH = s.h; continue; } // an empty box (a bar, a dot) has no width of its own: it is given one
            if (!flow.length) { s.natW = s.w; s.natH = s.h; continue; }
            const bb = bboxOf(flow), r = { x: s.x + (s.bl || 0), y: s.y + (s.bt || 0), w: s.w - bw, h: s.h - bh };
            const [l, rr] = sidesOf(bb.x - r.x, right(r) - right(bb)), [tt, b] = sidesOf(bb.y - r.y, bottom(r) - bottom(bb));
            s.natW = (L.length ? bb.w : natW(t)) + l + rr + bw;
            s.natH = bb.h + tt + b + bh;
        }
        const build = (owner, rect) => {
            const items = kids.get(owner) || [];
            const el = owner ? { k: owner.k, cls: [], kids: [] } : { tag: "page", cls: [], kids: [] };
            const fix = owner && fixes[owner.k];
            if (fix?.w) el.cls.push(`w-${tw(fix.w)}`);
            if (fix?.h) el.cls.push(`h-${tw(fix.h)}`);
            if (!items.length) {
                if (owner && owner.kind === "surface" && !fix) el.cls.push(`h-${tw(owner.h)}`); // an empty box: a block of colour, a rule
                return el;
            }
            // inside the border
            if (owner) rect = { x: rect.x + (owner.bl || 0), y: rect.y + (owner.bt || 0), w: rect.w - (owner.bl || 0) - (owner.br || 0), h: rect.h - (owner.bt || 0) - (owner.bb || 0) };
            const layers = [], tree = cut(items, layers);
            const flow = layers.length === items.length ? [] : [tree];
            // padding: the space around the content, the same on opposite sides (the smaller one); more on one side is alignment
            let content = { ...rect };
            if (flow.length) {
                const bb = bboxOf(flow);
                const pl = Math.max(0, bb.x - rect.x), pr = Math.max(0, right(rect) - right(bb)), pt = Math.max(0, bb.y - rect.y), pb = Math.max(0, bottom(rect) - bottom(bb));
                let [padL, padR] = sidesOf(pl, pr), [padT, padB] = sidesOf(pt, pb), px = Math.min(padL, padR), py = Math.min(padT, padB);
                // at least the box's own padding, when everything is still inside it: a child moving does not take its box's padding away
                // (and children sized as a share of it, w-2/3, keep their width)
                if (!owner && pad) {
                    // side by side: at least the box's padding where the content is still inside it; a box that hugs its content
                    // keeps its padding at the far end too (it grows or shrinks with what is in it)
                    const side = (inset, inferred, own, hugs) => (inset >= own - 1 ? Math.max(inferred, own) : hugs ? own : inferred);
                    padL = side(pl, padL, pad.l, false); padT = side(pt, padT, pad.t, false);
                    padR = side(pr, padR, pad.r, pad.hugW || page.grewW); padB = side(pb, padB, pad.b, pad.hugH || page.grewH);
                    px = Math.min(padL, padR); py = Math.min(padT, padB);
                }
                // one thing centred in a small box (an icon in a round button) is centred, with the box's size, not padded by odd amounts
                const centred = !isGroup(tree) && near(pl, pr) && near(pt, pb) && pl > 0.5 && pt > 0.5;
                if (owner && centred && (isArb(tw(px)) || isArb(tw(py)) || !px || !py) && !isArb(tw(owner.w)) && !isArb(tw(owner.h))) {
                    if (!fix) el.cls.push(`w-${tw(owner.w)}`, `h-${tw(owner.h)}`);
                } else {
                    el.cls.push(...paddingClasses(padT, padR, padB, padL));
                    content = { x: rect.x + padL, y: rect.y + padT, w: rect.w - padL - padR, h: rect.h - padT - padB };
                }
            }
            const childCls = new Map();
            const place = (node, box, into, wrapper = false, given = true) => {
                // a group or a piece: a group's own classes go on its wrapper; the box's top group goes on the box itself
                if (isGroup(node)) {
                    const lay = layoutGroup(node, box, childCls, wrapper, given);
                    into.cls.push(...lay.cls);
                    if (lay.width) into.cls.push(`w-${tw(lay.width)}`);
                    for (const { it, box: kb, given: kg } of lay.kids) {
                        if (isGroup(it)) {
                            const w = { group: true, cls: [], kids: [] };
                            place(it, kb, w, true, kg);
                            w.cls.push(...(childCls.get(it) || []));
                            into.kids.push(w);
                        } else {
                            const e = build(it, it);
                            e.cls.push(...(childCls.get(it) || []));
                            into.kids.push(e);
                        }
                    }
                } else {
                    // one piece alone in its box: a column with it, aligned
                    const lay = layoutGroup({ type: "col", items: [node], ...node }, box, childCls);
                    into.cls.push(...lay.cls.filter((c) => !/^p[tl]-/.test(c) || true));
                    const e = build(node, node);
                    e.cls.push(...(childCls.get(node) || []));
                    into.kids.push(e);
                }
            };
            if (flow.length) place(tree, content, el);
            // 4. layers: absolute, from the box's corner
            if (layers.length) {
                el.cls.push("relative");
                // a layer painted under the content (a background picture, a glow) stays under it
                const flowZ = Math.min(...items.filter((i) => !layers.includes(i)).map((i) => i.z));
                if (layers.some((l) => l.z < flowZ)) el.cls.push("isolate");
                for (const l of layers) {
                    const e = build(l, l);
                    if (l.z < flowZ) e.cls.push("-z-10");
                    const fullW = near(l.x, rect.x) && near(right(l), right(rect)), fullH = near(l.y, rect.y) && near(bottom(l), bottom(rect));
                    if (fullW && fullH) e.cls.push("absolute", "inset-0");
                    else {
                        e.cls.push("absolute", `top-${tw(l.y - rect.y)}`, `left-${tw(l.x - rect.x)}`);
                        if (l.kind === "surface" || (l.replaced && !l.fixedW) || (l.nat && !near(l.nat, l.w))) e.cls.push(`w-${tw(l.w)}`);
                        if ((l.kind === "surface" && !(kids.get(l) || []).length) || (l.replaced && !l.fixedH)) e.cls.push(`h-${tw(l.h)}`);
                    }
                    el.kids.push(e);
                }
            }
            return el;
        };
        return build(null, page);
    }

    const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col"]);
    /** The compiled tree as HTML. `pieces[k]` gives each piece's { tag, attrs, keep } (its own look) and, for a leaf, its inner HTML. */
    function emit(tree, pieces, indent = "") {
        const uniq = (a) => [...new Set(a.filter(Boolean))];
        const line = (el, ind) => {
            if (el.tag === "page" || el.group) {
                const inner = el.kids.map((k) => line(k, ind + "  ")).join("\n");
                return `${ind}<div class="${uniq(el.cls).join(" ")}">\n${inner}\n${ind}</div>`;
            }
            const p = pieces[el.k];
            let cls = uniq([...el.cls, ...p.keep]).join(" ");
            const tag = TABLE_TAGS.has(p.tag) ? "div" : p.tag; // a cell out of its table is a box (the parser drops <td> outside <table>)
            if ((p.tag === "td" || p.tag === "th") && p.kind === "leaf" && !/\balign-(top|bottom)\b/.test(cls)) cls = "content-center " + cls; // as a cell: middle
            const open = `<${tag}${p.attrs ? " " + p.attrs : ""}${cls ? ` class="${cls}"` : ""}>`;
            if (p.void) return ind + open;
            if (p.kind === "leaf") return `${ind}${open}${p.inner}</${tag}>`;
            const inner = el.kids.map((k) => line(k, ind + "  ")).join("\n");
            return `${ind}${open}${inner ? "\n" + inner + "\n" + ind : ""}</${tag}>`;
        };
        return line(tree, indent);
    }

    /** How clean the code is: elements, layout classes, arbitrary values and absolutes. */
    function codeStats(tree) {
        const s = { elements: 0, wrappers: 0, classes: 0, arbitrary: 0, absolute: 0, depth: 0 };
        const walk = (el, d) => {
            s.elements++; if (el.group) s.wrappers++;
            s.depth = Math.max(s.depth, d);
            s.classes += el.cls.length; s.arbitrary += el.cls.filter(isArb).length; s.absolute += el.cls.includes("absolute") ? 1 : 0;
            el.kids.forEach((k) => walk(k, d + 1));
        };
        walk(tree, 0);
        return s;
    }

    // ── Editing a page in place: one box's own layout is rewritten, its children keep their insides ───────────────────────
    // (the editor's free drag: the box the element is dropped into is compiled from where its children now are)
    const BASE = (c) => !/:/.test(c.replace(/\[[^\]]*\]/g, ""));
    const INNER_RE = /^(flex|inline-flex|grid|inline-grid|block|inline-block|flex-(row|col|row-reverse|col-reverse|wrap|wrap-reverse|nowrap)|grid-(cols|rows|flow)-.+|auto-(cols|rows)-.+|gap(-[xy])?-.+|space-[xy]-.+|items-.+|justify-(start|end|center|between|around|evenly|stretch|normal)|content-(start|end|center|between|around|evenly|stretch|normal|baseline)|place-(content|items)-.+|p[trblxyse]?-.+|relative|isolate)$/;
    const OUTER_RE = /^(-?m[trblxyse]?-.+|self-.+|justify-self-.+|place-self-.+|order-.+|flex-(1|auto|initial|none)|flex-\[.+\]|grow(-0)?|shrink(-0)?|basis-.+|col-(span|start|end)-.+|row-(span|start|end)-.+|w-(full|auto)|h-(full|auto)|-?z-10)$/; // (min-h-screen, max-w-md, w-2/3, w-fit: its own size, kept)
    const words = (cls) => String(cls || "").split(/\s+/).filter(Boolean);
    /** A box's classes without its own layout (display, gap, padding, alignment of its children): the compiler writes those. */
    function stripInner(cls) { return words(cls).filter((c) => !(BASE(c) && INNER_RE.test(c))); }
    /** A child's classes without where it sat in its old layout (margins, self-*, flex-1, w-full...): its look and own size stay. */
    function stripOuter(cls) { return words(cls).filter((c) => !(BASE(c) && OUTER_RE.test(c))); }
    /** A few words for what a compiled box is: "Row · gap-4 · justify-between". */
    function layoutWords(cls) {
        const c = words(cls), kind = c.includes("grid") ? "Grid" : c.includes("flex-col") ? "Column" : c.includes("flex") ? "Row" : "Box";
        const keep = c.filter((t) => /^(gap|grid-cols|justify|items|p[xytblr]?)-/.test(t));
        return [kind, ...keep].join(" · ");
    }

    return { compile, emit, splitClasses, codeStats, tw, stripInner, stripOuter, layoutWords };
}

const kit = layoutKit();
export const { compile, emit, splitClasses, codeStats, tw, stripInner, stripOuter, layoutWords } = kit;
