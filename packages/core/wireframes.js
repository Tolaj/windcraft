// Wireframes: blank page and section skeletons as plain Tailwind HTML, built from parts by rules, endlessly.
//
// A wireframe is only structure: real elements (header, aside, main, section) in two greys, the frame darker, content lighter, with
// text as short grey bars. `wireframe(kind, n)` is the n-th of a kind, always the same one (a seeded choice of parts and numbers),
// so the list can be scrolled forever, shared and reproduced. Pure functions, no DOM: tested in test/wireframes.test.js.

export const FRAME = "rounded-lg bg-gray-300";
export const SPACE = "rounded-lg bg-gray-200";

// ── Hand-picked: the ones offered first ────────────────────────────────────────────────────────────────────────────
export const LAYOUTS = [
    ["landing", "Landing", `<div class="flex min-h-screen flex-col gap-4 p-4"><header class="h-14 ${FRAME}"></header><main class="flex flex-1 flex-col gap-4"><section class="h-80 ${SPACE}"></section><section class="grid gap-4 md:grid-cols-3"><div class="h-40 ${FRAME}"></div><div class="h-40 ${FRAME}"></div><div class="h-40 ${FRAME}"></div></section></main><footer class="h-20 ${FRAME}"></footer></div>`],
    ["app", "App shell", `<div class="flex min-h-screen gap-4 p-4"><aside class="hidden w-60 shrink-0 md:block ${FRAME}"></aside><div class="flex min-w-0 flex-1 flex-col gap-4"><header class="h-14 ${FRAME}"></header><main class="flex-1 ${SPACE}"></main></div></div>`],
    ["dashboard", "Dashboard", `<div class="flex min-h-screen gap-4 p-4"><aside class="hidden w-60 shrink-0 md:block ${FRAME}"></aside><main class="flex min-w-0 flex-1 flex-col gap-4"><section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div class="h-24 ${FRAME}"></div><div class="h-24 ${FRAME}"></div><div class="h-24 ${FRAME}"></div><div class="h-24 ${FRAME}"></div></section><section class="flex-1 ${SPACE}"></section></main></div>`],
    ["docs", "Docs", `<div class="flex min-h-screen gap-4 p-4"><nav class="hidden w-52 shrink-0 md:block ${FRAME}"></nav><main class="min-w-0 flex-1 ${SPACE}"></main><aside class="hidden w-44 shrink-0 xl:block ${FRAME}"></aside></div>`],
    ["auth", "Sign in", `<main class="flex min-h-screen items-center justify-center p-4"><section class="h-96 w-full max-w-sm ${FRAME}"></section></main>`],
    ["pricing", "Pricing", `<main class="flex min-h-screen flex-col justify-center gap-4 p-4"><section class="mx-auto grid w-full max-w-5xl items-end gap-4 md:grid-cols-3"><div class="h-80 ${FRAME}"></div><div class="h-96 ${FRAME}"></div><div class="h-80 ${FRAME}"></div></section></main>`],
    ["blog", "Blog post", `<main class="flex min-h-screen justify-center p-4"><article class="flex w-full max-w-2xl flex-col gap-4"><header class="h-12 ${FRAME}"></header><section class="h-[32rem] ${SPACE}"></section></article></main>`],
];

export const SECTIONS = [
    ["cols2", "Two columns", `<div class="grid gap-4 p-4 md:grid-cols-2"><div class="h-64 ${FRAME}"></div><div class="h-64 ${FRAME}"></div></div>`],
    ["cols3", "Three columns", `<div class="grid gap-4 p-4 md:grid-cols-3"><div class="h-56 ${FRAME}"></div><div class="h-56 ${FRAME}"></div><div class="h-56 ${FRAME}"></div></div>`],
    ["side", "Sidebar + content", `<div class="flex gap-4 p-4"><aside class="hidden h-80 w-56 shrink-0 md:block ${FRAME}"></aside><div class="h-80 min-w-0 flex-1 ${SPACE}"></div></div>`],
    ["hero", "Hero", `<section class="flex flex-col items-center gap-4 px-4 py-16"><div class="h-12 w-2/3 ${FRAME}"></div><div class="h-6 w-1/2 ${SPACE}"></div><div class="mt-4 flex gap-3"><div class="h-10 w-32 ${FRAME}"></div><div class="h-10 w-32 ${SPACE}"></div></div></section>`],
    ["cards", "Card grid", `<div class="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4"><div class="h-48 ${FRAME}"></div><div class="h-48 ${FRAME}"></div><div class="h-48 ${FRAME}"></div><div class="h-48 ${FRAME}"></div></div>`],
    ["split", "Text + image", `<section class="grid items-center gap-8 p-4 md:grid-cols-2"><div class="flex flex-col gap-3"><div class="h-10 w-3/4 ${FRAME}"></div><div class="h-5 ${SPACE}"></div><div class="h-5 w-5/6 ${SPACE}"></div><div class="mt-3 h-10 w-32 ${FRAME}"></div></div><div class="h-72 ${SPACE}"></div></section>`],
];

// ── The generator ──────────────────────────────────────────────────────────────────────────────────────────────────
/** A small, fast seeded random generator (mulberry32): the same seed gives the same choices everywhere. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const pick = (r, list) => list[Math.floor(r() * list.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const times = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");

// pieces
const box = (cls) => `<div class="${cls}"></div>`;
const bar = (w, h = "h-3") => box(`${h} ${w} rounded bg-gray-200`);
const heading = (w) => box(`h-8 ${w} ${FRAME}`);
const button = (w = "w-28", strong = true) => box(`h-10 ${w} ${strong ? FRAME : SPACE}`);
const text = (r, lines) => `<div class="flex flex-col gap-2">${times(lines, (i) => bar(i === lines - 1 ? pick(r, ["w-2/3", "w-1/2", "w-3/4"]) : "w-full"))}</div>`;
const HEIGHTS = ["h-32", "h-40", "h-48", "h-56", "h-64", "h-72"];
const ORD = ["", "", "two", "three", "four", "five", "six"];

/** Each kind: a name for the list and a function from a random source to { name, html } (one root element). */
const KINDS = {
    navbar: (r) => {
        const links = int(r, 3, 6), style = pick(r, ["spread", "center", "left"]), cta = r() < 0.7;
        const nav = `<nav class="hidden items-center gap-6 md:flex">${times(links, () => bar("w-16"))}</nav>`;
        const logo = box(`h-8 w-28 ${FRAME}`), right = cta ? `<div class="flex gap-2">${r() < 0.5 ? button("w-20", false) : ""}${button("w-24")}</div>` : "";
        const inner = style === "center" ? `${logo}${nav}${right || box("w-28")}` : style === "left" ? `<div class="flex items-center gap-10">${logo}${nav}</div>${right}` : `${logo}${nav}${right}`;
        return { name: `Navbar · ${links} links${cta ? " · button" : ""}`, html: `<header class="flex items-center justify-between gap-6 rounded-lg bg-gray-100 px-6 py-4">${inner}</header>` };
    },
    hero: (r) => {
        const v = pick(r, ["center", "center-image", "left-image", "image-left", "big"]), buttons = int(r, 1, 2);
        const copy = (align) => `<div class="flex flex-col gap-4 ${align}">${heading(pick(r, ["w-3/4", "w-2/3", "w-full"]))}${heading("w-1/2")}${text(r, int(r, 2, 3))}<div class="mt-2 flex gap-3">${button("w-32")}${buttons > 1 ? button("w-32", false) : ""}</div></div>`;
        const img = box(`${pick(r, ["h-72", "h-80", "h-96"])} ${SPACE}`);
        const html = v === "center" ? `<section class="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-20 text-center">${copy("w-full items-center")}</section>`
            : v === "center-image" ? `<section class="flex flex-col items-center gap-10 px-4 py-16"><div class="flex w-full max-w-3xl flex-col items-center">${copy("w-full items-center")}</div><div class="w-full max-w-5xl">${img}</div></section>`
            : v === "big" ? `<section class="flex flex-col gap-6 px-4 py-24">${box(`h-16 w-5/6 ${FRAME}`)}${box(`h-16 w-2/3 ${FRAME}`)}<div class="max-w-xl">${text(r, 2)}</div><div class="flex gap-3">${button("w-36")}${buttons > 1 ? button("w-36", false) : ""}</div></section>`
            : `<section class="grid items-center gap-10 px-4 py-16 md:grid-cols-2">${v === "image-left" ? `${img}${copy("")}` : `${copy("")}${img}`}</section>`;
        return { name: `Hero · ${{ center: "centred", "center-image": "centred, image below", "left-image": "image right", "image-left": "image left", big: "big type" }[v]}`, html };
    },
    grid: (r) => {
        const cols = int(r, 2, 6), rows = int(r, 1, 3), h = pick(r, HEIGHTS), sm = Math.min(2, cols);
        return { name: `Grid · ${cols} × ${rows}`, html: `<div class="grid gap-4 p-4 grid-cols-1 sm:grid-cols-${sm} md:grid-cols-${cols}">${times(cols * rows, () => box(`${h} ${FRAME}`))}</div>` };
    },
    bento: (r) => {
        const PATTERNS = [
            [[2, 2], [1, 1], [1, 1], [1, 1], [1, 1]], [[2, 1], [1, 2], [1, 1], [1, 1], [2, 1]], [[1, 2], [2, 1], [1, 2], [2, 1]],
            [[2, 2], [2, 1], [1, 1], [1, 1]], [[3, 1], [1, 2], [1, 1], [2, 1]], [[1, 1], [2, 2], [1, 1], [1, 1], [1, 1]],
            [[2, 1], [2, 1], [1, 1], [1, 1], [1, 1], [1, 1]], [[4, 1], [1, 1], [2, 1], [1, 1]], [[1, 2], [1, 1], [2, 1], [1, 1], [1, 1], [1, 1]],
        ];
        const p = pick(r, PATTERNS), dark = int(r, 0, p.length - 1);
        const cls = ([c, rw], i) => `${c > 1 ? `md:col-span-${c} ` : ""}${rw > 1 ? "md:row-span-2 " : ""}${i === dark ? FRAME : SPACE}`;
        return { name: `Bento · ${p.length} tiles`, html: `<div class="grid auto-rows-[10rem] gap-4 p-4 md:grid-cols-4">${p.map((t, i) => box(cls(t, i))).join("")}</div>` };
    },
    split: (r) => {
        const ratio = pick(r, ["1:1", "1:2", "2:1"]), imageFirst = r() < 0.5, media = pick(r, ["image", "list", "cards"]);
        const copy = `<div class="flex flex-col gap-4 ${ratio === "2:1" ? "md:col-span-2" : ""}">${heading("w-3/4")}${text(r, int(r, 3, 5))}<div class="mt-2">${button()}</div></div>`;
        const side = media === "image" ? box(`h-80 ${SPACE} ${ratio === "1:2" ? "md:col-span-2" : ""}`)
            : media === "list" ? `<div class="flex flex-col gap-3 ${ratio === "1:2" ? "md:col-span-2" : ""}">${times(int(r, 3, 5), () => `<div class="flex items-center gap-3">${box(`h-10 w-10 shrink-0 ${FRAME}`)}${bar("w-full", "h-4")}</div>`)}</div>`
            : `<div class="grid grid-cols-2 gap-4 ${ratio === "1:2" ? "md:col-span-2" : ""}">${times(4, () => box(`h-32 ${SPACE}`))}</div>`;
        const cols = ratio === "1:1" ? "md:grid-cols-2" : "md:grid-cols-3";
        return { name: `Split · ${media} ${imageFirst ? "left" : "right"} · ${ratio}`, html: `<section class="grid items-center gap-10 p-4 ${cols}">${imageFirst ? side + copy : copy + side}</section>` };
    },
    features: (r) => {
        const n = int(r, 3, 6), cols = pick(r, [2, 3]), style = pick(r, ["cards", "icons", "rows"]);
        const item = () => style === "rows" ? `<div class="flex gap-4">${box(`h-12 w-12 shrink-0 ${FRAME}`)}<div class="flex-1">${bar("w-1/2", "h-4")}<div class="mt-3">${text(r, 2)}</div></div></div>`
            : `<div class="flex flex-col gap-3 ${style === "cards" ? "rounded-lg border border-gray-200 p-6" : ""}">${box(`h-10 w-10 ${FRAME}`)}${bar("w-2/3", "h-4")}${text(r, 2)}</div>`;
        return { name: `Features · ${n} ${style}`, html: `<section class="flex flex-col gap-10 p-4"><div class="flex flex-col items-center gap-3">${heading("w-1/3")}${bar("w-1/2")}</div><div class="grid gap-8 md:grid-cols-${cols}">${times(n, item)}</div></section>` };
    },
    stats: (r) => {
        const n = int(r, 2, 5), framed = r() < 0.5;
        return { name: `Stats · ${n}`, html: `<section class="grid gap-4 p-4 sm:grid-cols-2 md:grid-cols-${n}">${times(n, () => `<div class="flex flex-col gap-2 ${framed ? "rounded-lg border border-gray-200 p-6" : "p-2"}">${box(`h-10 w-24 ${FRAME}`)}${bar("w-2/3")}</div>`)}</section>` };
    },
    pricing: (r) => {
        const n = int(r, 2, 4), featured = int(r, 0, n - 1), toggle = r() < 0.5;
        const plan = (i) => `<div class="flex flex-col gap-4 rounded-xl border ${i === featured ? "border-gray-400 bg-gray-100" : "border-gray-200"} p-6">${bar("w-1/3", "h-4")}${box(`h-10 w-1/2 ${FRAME}`)}<div class="flex flex-col gap-2">${times(int(r, 3, 5), () => bar("w-5/6"))}</div><div class="mt-auto pt-4">${box(`h-10 w-full ${i === featured ? FRAME : SPACE}`)}</div></div>`;
        return { name: `Pricing · ${n} plans`, html: `<section class="flex flex-col gap-8 p-4"><div class="flex flex-col items-center gap-3">${heading("w-1/3")}${toggle ? box(`h-9 w-48 ${SPACE}`) : bar("w-1/2")}</div><div class="grid gap-6 md:grid-cols-${n}">${times(n, plan)}</div></section>` };
    },
    testimonials: (r) => {
        const n = int(r, 1, 3);
        const card = () => `<figure class="flex flex-col gap-4 rounded-xl border border-gray-200 p-6">${text(r, int(r, 3, 4))}<div class="mt-2 flex items-center gap-3">${box(`h-10 w-10 rounded-full bg-gray-300`)}<div class="flex flex-1 flex-col gap-2">${bar("w-1/3", "h-3")}${bar("w-1/4", "h-2")}</div></div></figure>`;
        return { name: n === 1 ? "Testimonial · one" : `Testimonials · ${n}`, html: `<section class="grid gap-6 p-4 ${n === 1 ? "mx-auto max-w-2xl" : `md:grid-cols-${n}`}">${times(n, card)}</section>` };
    },
    faq: (r) => {
        const n = int(r, 4, 7), two = r() < 0.4;
        const rows = (k) => `<div class="flex flex-col gap-3">${times(k, () => `<div class="flex items-center justify-between rounded-lg border border-gray-200 px-5 py-4">${bar("w-2/3", "h-4")}${box("h-4 w-4 rounded bg-gray-300")}</div>`)}</div>`;
        return { name: `FAQ · ${n} questions${two ? " · two columns" : ""}`, html: two
            ? `<section class="grid gap-10 p-4 md:grid-cols-3"><div class="flex flex-col gap-3">${heading("w-2/3")}${text(r, 2)}</div><div class="md:col-span-2">${rows(n)}</div></section>`
            : `<section class="mx-auto flex max-w-3xl flex-col gap-6 p-4">${heading("w-1/3")}${rows(n)}</section>` };
    },
    logos: (r) => {
        const n = int(r, 4, 8), title = r() < 0.6;
        return { name: `Logos · ${n}`, html: `<section class="flex flex-col items-center gap-6 p-4">${title ? bar("w-1/4") : ""}<div class="flex w-full flex-wrap items-center justify-center gap-8 md:justify-between">${times(n, () => box(`h-8 w-24 ${SPACE}`))}</div></section>` };
    },
    cta: (r) => {
        const v = pick(r, ["center", "split", "band"]);
        const html = v === "center" ? `<section class="flex flex-col items-center gap-4 rounded-xl bg-gray-100 px-6 py-16">${heading("w-1/2")}${bar("w-1/3")}<div class="mt-2 flex gap-3">${button("w-32")}${button("w-32", false)}</div></section>`
            : v === "split" ? `<section class="flex flex-col gap-6 rounded-xl bg-gray-100 px-8 py-10 md:flex-row md:items-center md:justify-between"><div class="flex flex-1 flex-col gap-3">${heading("w-2/3")}${bar("w-1/2")}</div>${button("w-36")}</section>`
            : `<section class="flex flex-col gap-4 rounded-xl ${FRAME} px-8 py-12 md:flex-row md:items-center md:justify-between">${box("h-8 w-1/2 rounded bg-gray-200")}${box("h-10 w-32 rounded-lg bg-gray-200")}</section>`;
        return { name: `Call to action · ${v}`, html };
    },
    footer: (r) => {
        const cols = int(r, 3, 5), brand = r() < 0.7;
        const col = () => `<div class="flex flex-col gap-3">${bar("w-1/2", "h-4")}${times(int(r, 3, 5), () => bar("w-2/3", "h-2.5"))}</div>`;
        return { name: `Footer · ${cols} columns`, html: `<footer class="flex flex-col gap-10 rounded-lg bg-gray-100 p-8"><div class="grid gap-8 md:grid-cols-${cols + (brand ? 1 : 0)}">${brand ? `<div class="flex flex-col gap-3">${box(`h-8 w-28 ${FRAME}`)}${text(r, 2)}</div>` : ""}${times(cols, col)}</div><div class="flex items-center justify-between border-t border-gray-200 pt-6">${bar("w-40")}<div class="flex gap-3">${times(3, () => box("h-6 w-6 rounded bg-gray-300"))}</div></div></footer>` };
    },
};

/** Whole pages: a navbar, a hero, two to four sections from the others, and a footer (or an app or docs frame). */
const PAGE_MIDDLE = ["grid", "bento", "split", "features", "stats", "pricing", "testimonials", "faq", "logos", "cta"];
function page(r) {
    const frame = pick(r, ["site", "site", "site", "app", "docs"]);
    if (frame !== "site") {
        const inner = [...Array(int(r, 2, 3))].map(() => KINDS[pick(r, ["grid", "stats", "split", "bento", "features"])](r));
        const side = box(`hidden w-${pick(r, ["52", "56", "60", "64"])} shrink-0 md:block ${FRAME}`).replace("<div", frame === "docs" ? "<nav" : "<aside").replace("</div>", frame === "docs" ? "</nav>" : "</aside>");
        return { name: `${frame === "app" ? "App" : "Docs"} · ${inner.map((p) => p.name.split(" · ")[0].toLowerCase()).join(" + ")}`, html: `<div class="flex min-h-screen gap-4 p-4">${side}<main class="flex min-w-0 flex-1 flex-col gap-4">${frame === "app" ? box(`h-14 ${FRAME}`).replace("<div", "<header").replace("</div>", "</header>") : ""}${inner.map((p) => p.html).join("")}</main></div>` };
    }
    const parts = [KINDS.navbar(r), KINDS.hero(r)];
    const used = new Set();
    for (let k = int(r, 2, 4); k > 0;) { const kind = pick(r, PAGE_MIDDLE); if (used.has(kind)) continue; used.add(kind); parts.push(KINDS[kind](r)); k--; }
    parts.push(KINDS.footer(r));
    return { name: `Page · ${parts.slice(2, -1).map((p) => p.name.split(" · ")[0].toLowerCase()).join(" + ")}`, html: `<div class="flex flex-col gap-6 p-4">${parts.map((p) => p.html).join("")}</div>` };
}

/** The kinds, as the list's filters show them. */
export const KIND_NAMES = { pages: "Pages", hero: "Hero", navbar: "Navbar", grid: "Grid", bento: "Bento", split: "Split", features: "Features", stats: "Stats", pricing: "Pricing", testimonials: "Testimonials", faq: "FAQ", logos: "Logos", cta: "Call to action", footer: "Footer" };
const ALL = Object.keys(KIND_NAMES);

/** The n-th wireframe of a kind ("all" goes round the kinds): { id, kind, name, html }, always the same for the same kind and n. */
export function wireframe(kind, n) {
    const k = kind === "all" ? ALL[n % ALL.length] : kind;
    const r = rng(hash(k) ^ Math.imul(n + 1, 0x9e3779b1));
    const w = k === "pages" ? page(r) : KINDS[k](r);
    return { id: `${k}-${n}`, kind: k, name: w.name, html: w.html };
}
