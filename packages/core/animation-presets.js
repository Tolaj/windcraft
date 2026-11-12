// The animation library: each preset is a name, a group, what it does (keyframes) and how it is usually played (time, easing, repeat). Used by the editor's animation
// browser; the keyframes go into the project's Tailwind config under the chosen name, and the page uses the animate-<name> class (hover presets: hover:animate-<name>).
//   on: "load" plays when the frame shows · "loop" plays for ever · "hover" plays while the pointer is over it · "scrub" / "scrub-page": progress follows the scroll
//   (as the element passes through the screen / along the whole page); `range` is the part of that passage it spans
// Keyframes are written for properties that animate cheaply (opacity, transform, filter, box-shadow, clip-path): the browser does not have to re-lay out the page.

const T = (o) => o; // keyframes as { "0%": { prop: value } }
const k = (from, to) => T({ "0%": from, "100%": to });

export const GROUPS = Object.freeze([["entrance", "Entrances"], ["attention", "Attention"], ["exit", "Exits"], ["loop", "Loops"], ["hover", "Hover"], ["scroll", "Scroll"], ["effect", "Effects"]]);

const P = (id, label, group, dur, ease, repeat, kf, extra = {}) => ({ id, label, group, dur, ease, repeat, kf, on: group === "loop" ? "loop" : group === "hover" ? "hover" : "load", delay: 0, dir: "normal", fill: repeat === "once" ? "both" : "none", ...extra });

export const PRESETS = Object.freeze([
    // entrances
    P("fade-in", "Fade in", "entrance", 0.6, "ease-out", "once", k({ opacity: "0" }, { opacity: "1" })),
    P("fade-up", "Fade up", "entrance", 0.7, "ease-out", "once", k({ opacity: "0", transform: "translateY(24px)" }, { opacity: "1", transform: "translateY(0)" })),
    P("fade-down", "Fade down", "entrance", 0.7, "ease-out", "once", k({ opacity: "0", transform: "translateY(-24px)" }, { opacity: "1", transform: "translateY(0)" })),
    P("fade-left", "Fade from left", "entrance", 0.7, "ease-out", "once", k({ opacity: "0", transform: "translateX(-32px)" }, { opacity: "1", transform: "translateX(0)" })),
    P("fade-right", "Fade from right", "entrance", 0.7, "ease-out", "once", k({ opacity: "0", transform: "translateX(32px)" }, { opacity: "1", transform: "translateX(0)" })),
    P("slide-in-left", "Slide in left", "entrance", 0.6, "ease-out", "once", k({ transform: "translateX(-100%)" }, { transform: "translateX(0)" })),
    P("slide-in-right", "Slide in right", "entrance", 0.6, "ease-out", "once", k({ transform: "translateX(100%)" }, { transform: "translateX(0)" })),
    P("zoom-in", "Zoom in", "entrance", 0.4, "ease-out", "once", k({ opacity: "0", transform: "scale(0.9)" }, { opacity: "1", transform: "scale(1)" })),
    P("pop-in", "Pop in", "entrance", 0.5, "cubic-bezier(0.34, 1.56, 0.64, 1)", "once", k({ opacity: "0", transform: "scale(0.6)" }, { opacity: "1", transform: "scale(1)" })),
    P("bounce-in", "Bounce in", "entrance", 0.9, "ease-out", "once", T({ "0%": { opacity: "0", transform: "scale(0.3)" }, "50%": { opacity: "1", transform: "scale(1.08)" }, "70%": { transform: "scale(0.95)" }, "100%": { opacity: "1", transform: "scale(1)" } })),
    P("flip-in-x", "Flip in (horizontal)", "entrance", 0.7, "ease-out", "once", T({ "0%": { opacity: "0", transform: "perspective(600px) rotateX(70deg)" }, "100%": { opacity: "1", transform: "perspective(600px) rotateX(0)" } })),
    P("flip-in-y", "Flip in (vertical)", "entrance", 0.7, "ease-out", "once", T({ "0%": { opacity: "0", transform: "perspective(600px) rotateY(70deg)" }, "100%": { opacity: "1", transform: "perspective(600px) rotateY(0)" } })),
    P("rotate-in", "Rotate in", "entrance", 0.6, "ease-out", "once", k({ opacity: "0", transform: "rotate(-12deg) scale(0.9)" }, { opacity: "1", transform: "rotate(0) scale(1)" })),
    P("blur-in", "Blur in", "entrance", 0.8, "ease-out", "once", k({ opacity: "0", filter: "blur(12px)" }, { opacity: "1", filter: "blur(0)" })),
    P("drop-in", "Drop in", "entrance", 0.7, "cubic-bezier(0.22, 1, 0.36, 1)", "once", k({ opacity: "0", transform: "translateY(-40px) scale(0.98)" }, { opacity: "1", transform: "translateY(0) scale(1)" })),
    P("wipe-in", "Wipe in", "entrance", 0.8, "ease-out", "once", k({ "clip-path": "inset(0 100% 0 0)" }, { "clip-path": "inset(0 0 0 0)" })),
    P("skew-in", "Skew in", "entrance", 0.6, "ease-out", "once", k({ opacity: "0", transform: "translateX(-24px) skewX(-12deg)" }, { opacity: "1", transform: "translateX(0) skewX(0)" })),
    // attention
    P("pulse-soft", "Soft pulse", "attention", 1.6, "ease-in-out", "infinite", T({ "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.55" } })),
    P("shake", "Shake", "attention", 0.6, "ease-in-out", "once", T({ "0%, 100%": { transform: "translateX(0)" }, "20%": { transform: "translateX(-8px)" }, "40%": { transform: "translateX(8px)" }, "60%": { transform: "translateX(-6px)" }, "80%": { transform: "translateX(6px)" } })),
    P("wiggle", "Wiggle", "attention", 1, "ease-in-out", "infinite", T({ "0%, 100%": { transform: "rotate(-3deg)" }, "50%": { transform: "rotate(3deg)" } })),
    P("heartbeat", "Heartbeat", "attention", 1.3, "ease-in-out", "infinite", T({ "0%, 100%": { transform: "scale(1)" }, "14%": { transform: "scale(1.15)" }, "28%": { transform: "scale(1)" }, "42%": { transform: "scale(1.15)" }, "70%": { transform: "scale(1)" } })),
    P("tada", "Tada", "attention", 1, "ease-in-out", "once", T({ "0%": { transform: "scale(1)" }, "10%, 20%": { transform: "scale(0.9) rotate(-3deg)" }, "30%, 50%, 70%, 90%": { transform: "scale(1.1) rotate(3deg)" }, "40%, 60%, 80%": { transform: "scale(1.1) rotate(-3deg)" }, "100%": { transform: "scale(1) rotate(0)" } })),
    P("swing", "Swing", "attention", 1, "ease-in-out", "once", T({ "20%": { transform: "rotate(15deg)" }, "40%": { transform: "rotate(-10deg)" }, "60%": { transform: "rotate(5deg)" }, "80%": { transform: "rotate(-5deg)" }, "100%": { transform: "rotate(0)" } }), { fill: "none" }),
    P("jello", "Jello", "attention", 0.9, "ease-in-out", "once", T({ "0%, 100%": { transform: "skew(0)" }, "30%": { transform: "skew(-12deg, -12deg)" }, "50%": { transform: "skew(6deg, 6deg)" }, "70%": { transform: "skew(-3deg, -3deg)" } }), { fill: "none" }),
    P("rubber-band", "Rubber band", "attention", 0.9, "ease-in-out", "once", T({ "0%": { transform: "scale(1)" }, "30%": { transform: "scale(1.25, 0.75)" }, "40%": { transform: "scale(0.75, 1.25)" }, "50%": { transform: "scale(1.15, 0.85)" }, "65%": { transform: "scale(0.95, 1.05)" }, "100%": { transform: "scale(1)" } }), { fill: "none" }),
    P("flash", "Flash", "attention", 1, "linear", "once", T({ "0%, 50%, 100%": { opacity: "1" }, "25%, 75%": { opacity: "0" } }), { fill: "none" }),
    // exits
    P("fade-out", "Fade out", "exit", 0.5, "ease-in", "once", k({ opacity: "1" }, { opacity: "0" })),
    P("fade-out-down", "Fade out down", "exit", 0.6, "ease-in", "once", k({ opacity: "1", transform: "translateY(0)" }, { opacity: "0", transform: "translateY(24px)" })),
    P("slide-out-right", "Slide out right", "exit", 0.5, "ease-in", "once", k({ transform: "translateX(0)" }, { transform: "translateX(100%)" })),
    P("zoom-out", "Zoom out", "exit", 0.4, "ease-in", "once", k({ opacity: "1", transform: "scale(1)" }, { opacity: "0", transform: "scale(0.8)" })),
    P("spin-out", "Spin out", "exit", 0.6, "ease-in", "once", k({ opacity: "1", transform: "rotate(0) scale(1)" }, { opacity: "0", transform: "rotate(180deg) scale(0.4)" })),
    // loops
    P("float", "Float", "loop", 3, "ease-in-out", "infinite", T({ "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } })),
    P("bob", "Bob", "loop", 1.4, "ease-in-out", "infinite", T({ "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } })),
    P("breathe", "Breathe", "loop", 4, "ease-in-out", "infinite", T({ "0%, 100%": { transform: "scale(1)" }, "50%": { transform: "scale(1.04)" } })),
    P("spin-slow", "Spin slowly", "loop", 12, "linear", "infinite", k({ transform: "rotate(0)" }, { transform: "rotate(360deg)" })),
    P("glow", "Glow", "loop", 2.4, "ease-in-out", "infinite", T({ "0%, 100%": { "box-shadow": "0 0 0 0 rgba(99, 102, 241, 0.0)" }, "50%": { "box-shadow": "0 0 24px 6px rgba(99, 102, 241, 0.45)" } })),
    P("ripple", "Ripple ring", "loop", 1.8, "ease-out", "infinite", k({ "box-shadow": "0 0 0 0 rgba(99, 102, 241, 0.45)" }, { "box-shadow": "0 0 0 16px rgba(99, 102, 241, 0)" })),
    P("blink", "Blink", "loop", 1, "steps(2, jump-none)", "infinite", T({ "0%": { opacity: "1" }, "100%": { opacity: "0" } })),
    P("gradient-shift", "Gradient shift", "loop", 6, "ease-in-out", "infinite", T({ "0%, 100%": { "background-position": "0% 50%" }, "50%": { "background-position": "100% 50%" } }), { note: "Give the element a gradient background that is wider than it (bg-[length:200%_200%])." }),
    P("marquee", "Marquee", "loop", 20, "linear", "infinite", k({ transform: "translateX(0)" }, { transform: "translateX(-50%)" }), { note: "Put the content twice in a row so it loops without a gap." }),
    // hover
    P("lift", "Lift", "hover", 0.25, "ease-out", "once", k({ transform: "translateY(0)", "box-shadow": "0 0 0 rgba(0,0,0,0)" }, { transform: "translateY(-4px)", "box-shadow": "0 12px 24px rgba(0,0,0,0.15)" })),
    P("grow", "Grow", "hover", 0.2, "ease-out", "once", k({ transform: "scale(1)" }, { transform: "scale(1.06)" })),
    P("tilt", "Tilt", "hover", 0.2, "ease-out", "once", k({ transform: "rotate(0)" }, { transform: "rotate(-3deg)" })),
    P("nudge", "Nudge", "hover", 0.2, "ease-out", "once", k({ transform: "translateX(0)" }, { transform: "translateX(6px)" })),

    // scroll: progress follows the scroll (CSS scroll-driven animation; where the browser can't, it plays once when the page shows)
    P("parallax-up", "Parallax up", "scroll", 1, "linear", "once", k({ transform: "translateY(70px)" }, { transform: "translateY(-70px)" }), { on: "scrub", range: "cover_0%_cover_100%", fill: "both", note: "Slower than the frame: it drifts as it passes." }),
    P("parallax-down", "Parallax down", "scroll", 1, "linear", "once", k({ transform: "translateY(-70px)" }, { transform: "translateY(70px)" }), { on: "scrub", range: "cover_0%_cover_100%", fill: "both" }),
    P("fade-on-scroll", "Fade in on scroll", "scroll", 1, "linear", "once", k({ opacity: "0", transform: "translateY(40px)" }, { opacity: "1", transform: "translateY(0)" }), { on: "scrub", range: "entry_0%_entry_70%", fill: "both" }),
    P("grow-on-scroll", "Grow on scroll", "scroll", 1, "linear", "once", k({ transform: "scale(0.8)", opacity: "0.4" }, { transform: "scale(1)", opacity: "1" }), { on: "scrub", range: "entry_0%_cover_50%", fill: "both" }),
    P("tilt-on-scroll", "Tilt on scroll", "scroll", 1, "linear", "once", k({ transform: "perspective(800px) rotateX(25deg)" }, { transform: "perspective(800px) rotateX(0)" }), { on: "scrub", range: "entry_0%_cover_50%", fill: "both" }),
    P("read-progress", "Reading progress bar", "scroll", 1, "linear", "once", k({ transform: "scaleX(0)" }, { transform: "scaleX(1)" }), { on: "scrub-page", fill: "both", note: "For a thin bar fixed to the top: give it origin-left, fixed, inset-x-0 top-0 and a height." }),
    // effects
    P("draw-line", "Draw a line", "effect", 1.6, "ease-in-out", "once", k({ "stroke-dashoffset": "var(--len, 1000)" }, { "stroke-dashoffset": "0" }), { note: "For SVG outlines: use Effects, Draw the lines, on the SVG." }),
    P("shimmer-text", "Shimmer", "effect", 2.4, "linear", "infinite", k({ "background-position": "200% 0" }, { "background-position": "-200% 0" }), { note: "For text with a gradient: bg-gradient-to-r, bg-clip-text, text-transparent and bg-[length:200%_100%]." }),
]);

export const EASINGS = Object.freeze(["ease-out", "ease-in", "ease-in-out", "linear", "cubic-bezier(0.34, 1.56, 0.64, 1)", "cubic-bezier(0.22, 1, 0.36, 1)"]);
export const EASING_LABEL = Object.freeze({ "ease-out": "Ease out", "ease-in": "Ease in", "ease-in-out": "Ease in and out", linear: "Linear", "cubic-bezier(0.34, 1.56, 0.64, 1)": "Overshoot", "cubic-bezier(0.22, 1, 0.36, 1)": "Smooth stop" });
const EASE_OK = /^(ease|ease-in|ease-out|ease-in-out|linear|steps\(\s*\d+\s*(,\s*[a-z-]+\s*)?\)|cubic-bezier\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\))$/;
export const isEasing = (e) => EASE_OK.test(String(e).trim());
export const REPEATS = Object.freeze([["once", "Once"], ["2", "Twice"], ["3", "3 times"], ["infinite", "For ever"]]);
export const DIRECTIONS = Object.freeze([["normal", "Forward"], ["reverse", "Backward"], ["alternate", "Back and forth"], ["alternate-reverse", "Back and forth, backward first"]]);
export const FILLS = Object.freeze([["none", "Not held"], ["forwards", "Hold the end"], ["backwards", "Hold the start"], ["both", "Hold both"]]);

/** The `animation` value for a preset with the user's settings: `name 0.6s ease-out 0s 1 normal both`. Anything invalid falls back to the preset's own. */
export function animationValue(name, p, o = {}) {
    const dur = Number.isFinite(Number(o.dur)) && Number(o.dur) > 0 && Number(o.dur) <= 60 ? Number(o.dur) : p.dur;
    const delay = Number.isFinite(Number(o.delay)) && Number(o.delay) >= 0 && Number(o.delay) <= 60 ? Number(o.delay) : p.delay || 0;
    const ease = isEasing(o.ease || p.ease) ? String(o.ease || p.ease).trim() : p.ease;
    const rep = o.repeat || p.repeat;
    const iter = rep === "infinite" ? "infinite" : rep === "once" || !/^\d+$/.test(String(rep)) ? "1" : String(Math.min(20, Math.max(1, Number(rep))));
    const dir = DIRECTIONS.some(([v]) => v === (o.dir || p.dir)) ? o.dir || p.dir : "normal";
    const fill = FILLS.some(([v]) => v === (o.fill ?? p.fill)) ? o.fill ?? p.fill : "none";
    return `${name} ${dur}s ${ease}${delay ? ` ${delay}s` : " 0s"} ${iter} ${dir} ${fill}`;
}

/** The classes that play a preset on an element: animate-<name>, or hover:animate-<name> for a hover preset, with reduced motion respected when asked. */
export function classesFor(name, p, { reducedMotion = true } = {}) {
    const hover = p.on === "hover";
    return [hover ? `hover:animate-${name}` : `animate-${name}`, ...(reducedMotion ? [hover ? "motion-reduce:hover:animate-none" : "motion-reduce:animate-none"] : [])];
}

/** The CSS of a preset's keyframes, for previews. */
export const keyframesCss = (id, kf) => `@keyframes ${id}{${Object.entries(kf).map(([at, props]) => `${at}{${Object.entries(props).map(([p, v]) => `${p}:${v}`).join(";")}}`).join("")}}`;
