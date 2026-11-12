// WHEN an animation plays. The animation itself is keyframes in the Tailwind config (animation-presets.js, keyframe-model.js); this is how an element is wired to it:
//   load            animate-<name>                              plays when the page shows
//   hover / focus   hover:animate-<name> / focus:animate-<name> plays while the pointer is over it / it has focus
//   scroll          animate-<name> held paused, released when it scrolls into view  (data-reveal)
//   scroll-repeat   the same, and again every time it comes back into view          (data-reveal data-reveal-repeat)
//   click           plays each time it is clicked                                   (data-click-anim)
//   scrub           progress follows the scroll: as the element passes through the screen (animation-timeline: view()), or along the whole page (scroll(root)). Chrome, Edge
//                   and Safari 26 do this in CSS; elsewhere the animation plays once when the page shows.
// Scroll and click need a few lines of script: MOTION_SCRIPT, which the editor adds to the page once. Everything else is only Tailwind classes. Pure functions.

export const TRIGGERS = Object.freeze([["load", "When the frame shows"], ["hover", "When hovered"], ["focus", "When focused"], ["scroll", "When scrolled into view"], ["scroll-repeat", "Every time it scrolls into view"], ["click", "When clicked"], ["scrub", "Follows the scroll, as it passes"], ["scrub-page", "Follows the frame scroll"]]);
export const MOTION_MARK = "/*wc-motion*/";
export const MOTION_SCRIPT = `${MOTION_MARK}(function(){var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;var els=[].slice.call(document.querySelectorAll("[data-reveal]"));if(reduce||!("IntersectionObserver" in window)){els.forEach(function(e){e.setAttribute("data-reveal","in")})}else{var io=new IntersectionObserver(function(es){es.forEach(function(en){var t=en.target,rep=t.hasAttribute("data-reveal-repeat");if(en.isIntersecting){t.setAttribute("data-reveal","in");if(!rep)io.unobserve(t)}else if(rep){t.setAttribute("data-reveal","out")}})},{threshold:.15});els.forEach(function(e){io.observe(e)})}document.addEventListener("click",function(ev){var t=ev.target.closest&&ev.target.closest("[data-click-anim]");if(!t)return;t.setAttribute("data-play","off");void t.offsetWidth;t.setAttribute("data-play","on")})})();`;
/** Whether a design's scripts (as parseComponentSource lists them) already have the motion script. */
export const hasMotionScript = (scripts) => (scripts || []).some((s) => !s.src && String(s.text || "").includes(MOTION_MARK));
export const ATTRS = Object.freeze(["data-reveal", "data-reveal-repeat", "data-click-anim", "data-play"]);

const NAME = /^[a-z][a-z0-9-]*$/;
/** What an element needs to play `name` on a trigger: { classes: [...], attrs: { name: value }, needsScript }. */
export function triggerPlan(name, trigger, { reducedMotion = true, range = "" } = {}) {
    if (!NAME.test(name)) throw new Error("bad animation name");
    const rng = /^(?:entry|exit|cover|contain|entry-crossing|exit-crossing)_\d+%_(?:entry|exit|cover|contain|entry-crossing|exit-crossing)_\d+%$/.test(range) ? range : "entry_0%_cover_60%"; // the part of the passage a scrub spans
    const rm = (cls) => (reducedMotion ? [cls] : []);
    switch (trigger) {
        case "hover": return { classes: [`hover:animate-${name}`, ...rm("motion-reduce:hover:animate-none")], attrs: {}, needsScript: false };
        case "focus": return { classes: [`focus:animate-${name}`, ...rm("motion-reduce:focus:animate-none")], attrs: {}, needsScript: false };
        case "scroll": return { classes: [`animate-${name}`, "[animation-play-state:paused]", "data-[reveal=in]:[animation-play-state:running]", ...rm("motion-reduce:animate-none")], attrs: { "data-reveal": "" }, needsScript: true };
        case "scroll-repeat": return { classes: [`animate-${name}`, "[animation-play-state:paused]", "data-[reveal=in]:[animation-play-state:running]", "data-[reveal=out]:animate-none", ...rm("motion-reduce:animate-none")], attrs: { "data-reveal": "", "data-reveal-repeat": "" }, needsScript: true };
        case "click": return { classes: [`data-[play=on]:animate-${name}`, ...rm("motion-reduce:data-[play=on]:animate-none")], attrs: { "data-click-anim": "" }, needsScript: true };
        case "scrub": return { classes: [`animate-${name}`, "[animation-timeline:view()]", `[animation-range:${rng}]`, "[animation-duration:auto]", "[animation-timing-function:linear]", ...rm("motion-reduce:animate-none")], attrs: {}, needsScript: false };
        case "scrub-page": return { classes: [`animate-${name}`, "[animation-timeline:scroll(root)]", "[animation-duration:auto]", "[animation-timing-function:linear]", ...rm("motion-reduce:animate-none")], attrs: {}, needsScript: false };
        default: return { classes: [`animate-${name}`, ...rm("motion-reduce:animate-none")], attrs: {}, needsScript: false };
    }
}

/** The class tokens that belong to an animation's wiring (to take off before wiring another): every animate-<name>, the pause and delay helpers. */
export const WIRING = /^(?:motion-reduce:)?(?:(?:hover|focus|data-\[reveal=in\]|data-\[reveal=out\]|data-\[play=on\]):)*animate-[a-z][a-z0-9-]*$|^(?:data-\[reveal=in\]:)?\[animation-play-state:[a-z]+\]$|^\[animation-delay:calc\(var\(--i\)\*\d+ms\)\]$|^\[animation-(?:timeline|range|duration|timing-function):[^\]]*\]$|^\[--(?:chars|len):[\d.]+(?:ch|px)?\]$|^\[stroke-dasharray:var\(--len\)\]$/;
const split = (c) => String(c || "").split(/\s+/).filter(Boolean);
/** The classes without the animation wiring. */
export const stripWiring = (classes) => split(classes).filter((t) => !WIRING.test(t)).join(" ");
/** The classes with `name` wired for `trigger`, replacing what was there. */
export function wire(classes, name, trigger, opts) {
    const plan = triggerPlan(name, trigger, opts);
    return { classes: [stripWiring(classes), ...plan.classes].filter(Boolean).join(" "), attrs: plan.attrs, needsScript: plan.needsScript };
}

/** Which animation an element plays and on what: { name, trigger } or null, read from its classes and attributes. */
export function readTrigger(classes, attrs = {}) {
    const toks = split(classes), has = (a) => attrs[a] !== undefined && attrs[a] !== null;
    const find = (re) => { for (const t of toks) { const m = re.exec(t); if (m) return m[1]; } return null; };
    const click = find(/^data-\[play=on\]:animate-([a-z][a-z0-9-]*)$/); if (click) return { name: click, trigger: "click" };
    const hover = find(/^hover:animate-([a-z][a-z0-9-]*)$/); if (hover) return { name: hover, trigger: "hover" };
    const focus = find(/^focus:animate-([a-z][a-z0-9-]*)$/); if (focus) return { name: focus, trigger: "focus" };
    const base = find(/^animate-([a-z][a-z0-9-]*)$/);
    if (base) return { name: base, trigger: toks.includes("[animation-timeline:view()]") ? "scrub" : toks.includes("[animation-timeline:scroll(root)]") ? "scrub-page" : has("data-reveal") ? (has("data-reveal-repeat") ? "scroll-repeat" : "scroll") : "load" };
    return null;
}

/** The class that delays child `--i` by `ms` for each step: with style="--i:N" on each child, a cascade. */
export const delayClass = (ms) => `[animation-delay:calc(var(--i)*${Math.max(0, Math.min(2000, Math.round(Number(ms) || 0)))}ms)]`;
