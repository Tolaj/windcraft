// Which frames of a project board get a live preview, and in what order. A preview is an iframe that loads Tailwind, which is heavy: a board
// with hundreds of frames can only have a few dozen at a time, and the ones the person is looking for must not wait behind the others.

/**
 * @param {{ id: string, d: number, priority?: boolean }[]} candidates   the frames in or near view: d is the distance from the middle of the screen,
 *   priority is true for the ones that match the search or the selected tag or category
 * @param {{ max?: number, now?: number }} [opts]   max: most previews at once; now: how many load straight away when nothing is picked out
 * @returns {{ now: string[], later: string[], keep: string[] }}   `now` load at once, `later` follow in small batches; `keep` is both (all the others are dropped)
 */
export function mountPlan(candidates, { max = 40, now = 8 } = {}) {
    const sorted = [...candidates].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || a.d - b.d).slice(0, max);
    const picked = candidates.some((c) => c.priority) && candidates.some((c) => !c.priority); // some are picked out and some are not
    const first = picked ? sorted.filter((c) => c.priority) : sorted.slice(0, now);
    const rest = sorted.filter((c) => !first.includes(c));
    return { now: first.map((c) => c.id), later: rest.map((c) => c.id), keep: sorted.map((c) => c.id) };
}
