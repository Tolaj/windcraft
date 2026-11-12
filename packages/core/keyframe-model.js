// The keyframe editor's model: an animation as a list of STOPS (a position from 0 to 100 and what is set there), turned into CSS keyframes and back, so any preset
// can be opened in the editor and anything made there is plain keyframes in the Tailwind config. A stop sets some of these properties; what it leaves out the browser
// carries over from the neighbouring stops (or the element's own look), which is how keyframes work.
//   opacity (0-1) · translateX / translateY (px, % or any CSS length) · scale, or scaleX + scaleY · rotate, rotateX, rotateY (deg) · skewX, skewY (deg)
//   blur (px) · brightness (%) · hueRotate (deg) · and any other CSS property as `raw` ({ "box-shadow": "…", "clip-path": "…", color: "#f00" })
// Pure functions: no page.

export const STRUCTURED = Object.freeze([
    { key: "opacity", label: "Opacity", unit: "", min: 0, max: 1, step: 0.05, def: 1, group: "Look" },
    { key: "translateX", label: "Move across", unit: "px", min: -400, max: 400, step: 1, def: 0, group: "Move" },
    { key: "translateY", label: "Move down", unit: "px", min: -400, max: 400, step: 1, def: 0, group: "Move" },
    { key: "scale", label: "Scale", unit: "", min: 0, max: 3, step: 0.05, def: 1, group: "Size" },
    { key: "rotate", label: "Rotate", unit: "deg", min: -360, max: 360, step: 1, def: 0, group: "Turn" },
    { key: "rotateX", label: "Flip (top to bottom)", unit: "deg", min: -180, max: 180, step: 1, def: 0, group: "Turn" },
    { key: "rotateY", label: "Flip (side to side)", unit: "deg", min: -180, max: 180, step: 1, def: 0, group: "Turn" },
    { key: "skewX", label: "Skew across", unit: "deg", min: -60, max: 60, step: 1, def: 0, group: "Turn" },
    { key: "skewY", label: "Skew down", unit: "deg", min: -60, max: 60, step: 1, def: 0, group: "Turn" },
    { key: "blur", label: "Blur", unit: "px", min: 0, max: 40, step: 1, def: 0, group: "Effects" },
    { key: "brightness", label: "Brightness", unit: "%", min: 0, max: 300, step: 5, def: 100, group: "Effects" },
    { key: "hueRotate", label: "Hue turn", unit: "deg", min: 0, max: 360, step: 5, def: 0, group: "Effects" },
]);
export const COMMON_RAW = Object.freeze(["background-color", "color", "border-radius", "box-shadow", "clip-path", "background-position", "letter-spacing", "width", "height"]);

const NUM = "-?\\d*\\.?\\d+";
const num = (s) => { const n = Number(s); return Number.isFinite(n) ? n : null; };
const len = (v) => (typeof v === "number" ? `${v}px` : String(v));
const SAFE_VALUE = /^[^;{}<>\\]{1,200}$/;
const SAFE_PROP = /^[a-z][a-z-]{0,40}$/;

/** `translateX(10px) scale(1.1, 0.9)` into stop fields; what can't be read stays as a raw `transform`. Returns { fields, rest } where rest is "" when everything was understood. */
function parseTransform(t) {
    const fields = {}; let rest = String(t).trim(), ok = true;
    const take = (re, fn) => { rest = rest.replace(re, (...m) => { fn(m); return " "; }); };
    take(new RegExp(`perspective\\(\\s*${NUM}px\\s*\\)`, "g"), () => {}); // implied by a flip
    take(new RegExp(`translateX\\(\\s*(${NUM}(?:px|%|rem|em)?)\\s*\\)`, "g"), (m) => { fields.translateX = m[1]; });
    take(new RegExp(`translateY\\(\\s*(${NUM}(?:px|%|rem|em)?)\\s*\\)`, "g"), (m) => { fields.translateY = m[1]; });
    take(new RegExp(`translate\\(\\s*(${NUM}(?:px|%|rem|em)?)\\s*,\\s*(${NUM}(?:px|%|rem|em)?)\\s*\\)`, "g"), (m) => { fields.translateX = m[1]; fields.translateY = m[2]; });
    take(new RegExp(`rotateX\\(\\s*(${NUM})deg\\s*\\)`, "g"), (m) => { fields.rotateX = num(m[1]); });
    take(new RegExp(`rotateY\\(\\s*(${NUM})deg\\s*\\)`, "g"), (m) => { fields.rotateY = num(m[1]); });
    take(new RegExp(`rotate\\(\\s*(${NUM})deg\\s*\\)`, "g"), (m) => { fields.rotate = num(m[1]); });
    take(new RegExp(`scale\\(\\s*(${NUM})\\s*\\)`, "g"), (m) => { fields.scale = num(m[1]); });
    take(new RegExp(`scale\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)`, "g"), (m) => { fields.scaleX = num(m[1]); fields.scaleY = num(m[2]); });
    take(new RegExp(`skewX\\(\\s*(${NUM})deg\\s*\\)`, "g"), (m) => { fields.skewX = num(m[1]); });
    take(new RegExp(`skewY\\(\\s*(${NUM})deg\\s*\\)`, "g"), (m) => { fields.skewY = num(m[1]); });
    take(new RegExp(`skew\\(\\s*(${NUM})deg\\s*,\\s*(${NUM})deg\\s*\\)`, "g"), (m) => { fields.skewX = num(m[1]); fields.skewY = num(m[2]); });
    take(new RegExp(`(?:translateX|translateY|rotate|scale|skew)\\([^)]*\\)`, "g"), () => { ok = false; }); // a function in a form this editor does not read
    rest = rest.replace(/\s+/g, " ").trim();
    return { fields, rest: ok ? rest : String(t).trim(), understood: ok && rest === "" };
}
function parseFilter(f) {
    const fields = {}; let rest = String(f).trim();
    const take = (re, fn) => { rest = rest.replace(re, (...m) => { fn(m); return " "; }); };
    take(new RegExp(`blur\\(\\s*(${NUM})px\\s*\\)`, "g"), (m) => { fields.blur = num(m[1]); });
    take(new RegExp(`brightness\\(\\s*(${NUM})(%?)\\s*\\)`, "g"), (m) => { fields.brightness = m[2] ? num(m[1]) : Math.round(num(m[1]) * 100); });
    take(new RegExp(`hue-rotate\\(\\s*(${NUM})deg\\s*\\)`, "g"), (m) => { fields.hueRotate = num(m[1]); });
    rest = rest.replace(/\s+/g, " ").trim();
    return { fields, understood: rest === "" };
}

/** Keyframes ({ "0%": {...}, "50%, 100%": {...} }) as stops: [{ at, set: { opacity, translateY, ... }, raw: { prop: value }, ease }], sorted, one per position. */
export function stopsFromKeyframes(kf) {
    const byAt = new Map();
    for (const [key, props] of Object.entries(kf || {})) {
        for (const part of String(key).split(",")) {
            const m = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(part) || (/^\s*from\s*$/.test(part) ? [0, "0"] : /^\s*to\s*$/.test(part) ? [0, "100"] : null);
            if (!m) continue;
            const at = Math.min(100, Math.max(0, Number(m[1])));
            const stop = byAt.get(at) || { at, set: {}, raw: {}, ease: "" };
            for (const [p, v] of Object.entries(props || {})) {
                const prop = String(p).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), val = String(v);
                if (prop === "opacity" && num(val) !== null) stop.set.opacity = num(val);
                else if (prop === "transform") { const t = parseTransform(val); if (t.understood) Object.assign(stop.set, t.fields); else stop.raw.transform = val; }
                else if (prop === "filter") { const f = parseFilter(val); if (f.understood) Object.assign(stop.set, f.fields); else stop.raw.filter = val; }
                else if (prop === "animation-timing-function") stop.ease = val;
                else if (SAFE_PROP.test(prop) && SAFE_VALUE.test(val)) stop.raw[prop] = val;
            }
            byAt.set(at, stop);
        }
    }
    return [...byAt.values()].sort((a, b) => a.at - b.at);
}

const fmt = (n) => String(Math.round(n * 1000) / 1000);
/** One stop's CSS declarations as an object. */
export function propsOfStop(stop) {
    const s = stop.set || {}, out = {};
    if (s.opacity !== undefined) out.opacity = fmt(s.opacity);
    const t = [];
    if (s.rotateX !== undefined || s.rotateY !== undefined) t.push("perspective(600px)"); // a flip needs depth
    if (s.translateX !== undefined && s.translateY !== undefined) t.push(`translate(${len(s.translateX)}, ${len(s.translateY)})`);
    else if (s.translateX !== undefined) t.push(`translateX(${len(s.translateX)})`);
    else if (s.translateY !== undefined) t.push(`translateY(${len(s.translateY)})`);
    if (s.rotate !== undefined) t.push(`rotate(${fmt(s.rotate)}deg)`);
    if (s.rotateX !== undefined) t.push(`rotateX(${fmt(s.rotateX)}deg)`);
    if (s.rotateY !== undefined) t.push(`rotateY(${fmt(s.rotateY)}deg)`);
    if (s.scaleX !== undefined || s.scaleY !== undefined) t.push(`scale(${fmt(s.scaleX ?? 1)}, ${fmt(s.scaleY ?? 1)})`);
    else if (s.scale !== undefined) t.push(`scale(${fmt(s.scale)})`);
    if (s.skewX !== undefined || s.skewY !== undefined) t.push(s.skewY === undefined ? `skewX(${fmt(s.skewX)}deg)` : s.skewX === undefined ? `skewY(${fmt(s.skewY)}deg)` : `skew(${fmt(s.skewX)}deg, ${fmt(s.skewY)}deg)`);
    if (t.length) out.transform = t.join(" "); else if (stop.raw && stop.raw.transform) out.transform = stop.raw.transform;
    const f = [];
    if (s.blur !== undefined) f.push(`blur(${fmt(s.blur)}px)`);
    if (s.brightness !== undefined) f.push(`brightness(${fmt(s.brightness)}%)`);
    if (s.hueRotate !== undefined) f.push(`hue-rotate(${fmt(s.hueRotate)}deg)`);
    if (f.length) out.filter = f.join(" "); else if (stop.raw && stop.raw.filter) out.filter = stop.raw.filter;
    for (const [p, v] of Object.entries(stop.raw || {})) if (p !== "transform" && p !== "filter" && SAFE_PROP.test(p) && SAFE_VALUE.test(String(v))) out[p] = String(v);
    if (stop.ease && /^[a-z0-9(),.\s-]{1,80}$/i.test(stop.ease)) out["animation-timing-function"] = stop.ease;
    return out;
}

/** Stops as keyframes: "0%": { ... }, ... Stops that set nothing are left out, except the ends (an empty 0% or 100% is how "from the element's own look" is written). */
export function keyframesFromStops(stops) {
    const kf = {};
    for (const stop of [...stops].sort((a, b) => a.at - b.at)) {
        const props = propsOfStop(stop);
        if (!Object.keys(props).length && stop.at !== 0 && stop.at !== 100) continue;
        const key = `${fmt(stop.at)}%`;
        kf[key] = { ...(kf[key] || {}), ...props };
    }
    return kf;
}

/** What is wrong with a set of stops, or "". */
export function checkStops(stops) {
    if (!Array.isArray(stops) || stops.length < 2) return "An animation needs at least two stops.";
    const set = stops.filter((s) => Object.keys(propsOfStop(s)).length);
    if (!set.length) return "Set something at one of the stops: opacity, move, scale, rotate…";
    if (set.length < 2 && !(stops.some((s) => s.at === 0) && stops.some((s) => s.at === 100))) return "Set something at two stops, or keep a 0% and a 100% stop so it has somewhere to start and end.";
    return "";
}

/** The first stops of a new animation: a start and an end. */
export const blankStops = () => [{ at: 0, set: { opacity: 0 }, raw: {}, ease: "" }, { at: 100, set: { opacity: 1 }, raw: {}, ease: "" }];
