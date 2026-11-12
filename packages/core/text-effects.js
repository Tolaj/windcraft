// Effects that need a little more than a keyframe: they change the markup (split a heading into letters), or add per-element numbers (how many characters to type, how long a line is).
// The keyframes they use go into the Tailwind config like any animation; the rest is Tailwind classes. Pure functions.
import { PRESETS, animationValue } from "./animation-presets.js";

const preset = (id) => PRESETS.find((p) => p.id === id);

/** The config entries each effect needs: keyframes, and the animate-* value where the effect has one. `animation: null` is keyframes only (a caret another animation refers to). */
export const EFFECT_ENTRIES = Object.freeze({
    typewriter: { name: "typewriter", kf: { "0%": { width: "0" }, "100%": { width: "var(--chars, 20ch)" } }, animation: "typewriter 3s steps(30, end) 0s 1 normal both, blink-caret 0.8s step-end 0s infinite normal none" },
    "blink-caret": { name: "blink-caret", kf: { "0%, 100%": { "border-color": "transparent" }, "50%": { "border-color": "currentColor" } }, animation: null },
    "draw-line": { name: "draw-line", kf: preset("draw-line").kf, animation: animationValue("draw-line", preset("draw-line")) },
});
/** The entrance animations a text reveal can use, with their ready config entries. */
export const REVEALS = Object.freeze(PRESETS.filter((p) => p.group === "entrance" && p.kf["0%"] && Object.keys(p.kf).length === 2 && !/perspective|clip-path/.test(JSON.stringify(p.kf))).map((p) => ({ id: p.id, label: p.label, entry: { name: p.id, kf: p.kf, animation: animationValue(p.id, p) } })));

/** Classes for a typewriter over `chars` characters taking `secs` seconds (a line that is typed, then a caret that blinks). */
export function typewriterClasses(chars, secs) {
    const n = Math.max(1, Math.min(400, Math.round(Number(chars) || 1))), s = Math.max(0.5, Math.min(60, Number(secs) || 3));
    return ["inline-block", "overflow-hidden", "whitespace-nowrap", "border-r-2", "border-current", `[--chars:${n}ch]`, `[animation-timing-function:steps(${n},end),step-end]`, `[animation-duration:${s}s,0.8s]`];
}
/** A sensible time for typing `chars` characters: about 14 per second, between 1 and 8 seconds. */
export const typingSeconds = (chars) => Math.round(Math.max(1, Math.min(8, (Number(chars) || 0) / 14)) * 10) / 10;
