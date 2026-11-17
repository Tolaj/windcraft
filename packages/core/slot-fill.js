// Filling a wireframe's slot with a real design.
//
// A wireframe's empty regions (the sidebar, the header, the main area) are real elements painted in the placeholder greys. A design put
// in one takes its place, and the slot keeps its ROLE in the layout (how wide it is, whether it shrinks, its grid span, its order, whether
// it is hidden on a small screen) while the design supplies the LOOK (colours, borders, spacing, text). Where the two disagree about size
// or place, the slot wins: a sidebar of w-60 stays w-60 even if the design says w-64. Pure functions, no DOM: tested in test/slot-fill.test.js.

const PLACEHOLDER = /(?:^|\s)bg-gray-(?:200|300)(?:\s|$)/;

/** Whether a selected element is an empty placeholder from a wireframe: no children, no text of its own, painted in the placeholder greys. */
export function isSlot({ kids = 0, ownText = false, classes = "" } = {}) {
    return kids === 0 && !ownText && PLACEHOLDER.test(String(classes));
}

// The utilities that say where an element sits in its layout and how big it is: the slot's, which win.
const ROLES = [
    ["w", /^w-/], ["min-w", /^min-w-/], ["max-w", /^max-w-/], ["h", /^h-/], ["min-h", /^min-h-/], ["max-h", /^max-h-/], ["size", /^size-/],
    ["shrink", /^shrink(?:-|$)/], ["grow", /^grow(?:-|$)/], ["flex", /^flex-(?:1|auto|initial|none)$/], ["basis", /^basis-/],
    ["order", /^order-/], ["col", /^col-/], ["row", /^row-/], ["self", /^self-/], ["justify-self", /^justify-self-/],
];
const DISPLAY = /^(?:hidden|block|flex|grid|inline|inline-block|inline-flex|inline-grid|contents|table)$/;
// What a design written to fill a screen carries on its root, and breaks a slot in a layout: taken off.
const LOOSE = /^(?:fixed|sticky|absolute|inset(?:-[xy])?-.+|top-.+|right-.+|bottom-.+|left-.+|z-.+|h-screen|min-h-screen|w-screen|min-w-screen|h-dvh|min-h-dvh)$/;

const tokens = (c) => String(c || "").split(/\s+/).filter(Boolean);
/** "md:hover:w-60" -> ["md:hover:", "w-60"] (a colon inside brackets, as in [&:hover], is part of the utility) */
function split(token) {
    let depth = 0, cut = -1;
    for (let i = 0; i < token.length; i++) {
        const ch = token[i];
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === ":" && depth === 0) cut = i;
    }
    return cut < 0 ? ["", token] : [token.slice(0, cut + 1), token.slice(cut + 1)];
}
const roleOf = (util) => { const hit = ROLES.find(([, rx]) => rx.test(util)); return hit ? hit[0] : null; };

/**
 * The classes of the element that fills a slot: the design's, with the slot's role laid over them.
 * @param {string} slot     the slot's class attribute
 * @param {string} design   the design root's class attribute
 */
export function fillClasses(slot, design) {
    const mine = tokens(slot).map((t) => ({ t, p: split(t)[0], u: split(t)[1] }));
    const role = mine.filter((x) => roleOf(x.u));
    const taken = new Set(role.map((x) => `${x.p}${roleOf(x.u)}`));
    // "hidden md:block": the slot is gone on a small screen and shown from md up. The design keeps its own way of laying out (flex, grid)
    // from that width: md:flex, not md:block.
    const hides = mine.some((x) => x.p === "" && x.u === "hidden");
    const shows = mine.filter((x) => x.p !== "" && x.p.split(":").length === 2 && DISPLAY.test(x.u) && x.u !== "hidden");
    const own = tokens(design).map((t) => ({ t, p: split(t)[0], u: split(t)[1] }));
    const ownDisplay = own.find((x) => x.p === "" && DISPLAY.test(x.u) && x.u !== "hidden");
    const kept = own.filter((x) => {
        if (LOOSE.test(x.u)) return false;
        const r = roleOf(x.u);
        if (r && taken.has(`${x.p}${r}`)) return false;
        if (hides && shows.length && x.p === "" && DISPLAY.test(x.u)) return false; // the slot decides when it is shown; see below
        return true;
    }).map((x) => x.t);
    const out = [...kept, ...role.map((x) => x.t)];
    if (hides && shows.length) out.push("hidden", ...shows.map((x) => `${x.p}${ownDisplay ? ownDisplay.u : "block"}`));
    return [...new Set(out)].join(" ");
}
