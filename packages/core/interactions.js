// Interactions: "when this is clicked, show that". A rule lives on the trigger element as one attribute, data-wc-do, and the page carries one small script
// (INTERACT_SCRIPT, added once, like the animation script) that reads the attributes and wires them up. The editor shows designs at rest: rules run in Interact,
// Preview, and the saved or exported page. Pure functions.
//
//   data-wc-do="click toggle menu-1;hover show tip-2"     "<when> <do> <target id>", rules separated by ;
//   data-wc-do="click classes menu +w-full|-w-0"          "classes" has a fourth part: +name adds a class, -name removes it, ~name toggles it (joined by |)
//   data-wc-start="hidden"                                on a target: it starts hidden (it gets the Tailwind class "hidden" when the page loads)

export const ATTR = "data-wc-do";
export const START_ATTR = "data-wc-start";
export const INTERACT_MARK = "/*wc-interact*/";

export const WHEN = Object.freeze([["click", "Clicked"], ["hover", "Hovered"], ["load", "Page loads"]]);
/** `target`: the action needs another element to act on. */
export const DO = Object.freeze([
    ["toggle", "Show or hide"],
    ["show", "Show"],
    ["hide", "Hide"],
    ["scroll", "Scroll to"],
    ["copy", "Copy text of"],
    ["classes", "Change classes of"],
]);
const WHENS = WHEN.map(([v]) => v), DOS = DO.map(([v]) => v);
const ID = /^[A-Za-z_][\w:.-]*$/;
const CHANGE = /^[+\-~][^\s;|]+$/;

/** The rules in an attribute value: [{ when, do, to, change? }] (`change`: ["+max-md:w-full", "-max-md:w-0"] for "classes"). Anything that isn't a known rule is left out. */
export function parseRules(value) {
    const out = [];
    String(value || "").split(";").forEach((r) => {
        const p = r.trim().split(/\s+/);
        if (p.length < 3 || p.length > 4 || !WHENS.includes(p[0]) || !DOS.includes(p[1]) || !ID.test(p[2])) return;
        if (p[1] === "classes") {
            const change = (p[3] || "").split("|").filter(Boolean);
            if (!change.length || !change.every((c) => CHANGE.test(c))) return;
            out.push({ when: p[0], do: p[1], to: p[2], change });
        } else if (p.length === 3) out.push({ when: p[0], do: p[1], to: p[2] });
    });
    return out;
}
/** The attribute value for some rules (empty when there are none). A rule without a target (or, for "classes", without a change) is not written. */
export function writeRules(rules) {
    return (rules || []).filter((r) => r && WHENS.includes(r.when) && DOS.includes(r.do) && ID.test(r.to || "") && (r.do !== "classes" || ((r.change || []).length && r.change.every((c) => CHANGE.test(c)))))
        .map((r) => `${r.when} ${r.do} ${r.to}${r.do === "classes" ? ` ${r.change.join("|")}` : ""}`).join(";");
}
/** The classes of a "classes" rule by what is done to them: { add: [], remove: [], toggle: [] }. */
export function changeParts(change) {
    const out = { add: [], remove: [], toggle: [] };
    (change || []).forEach((c) => { const k = c[0] === "+" ? "add" : c[0] === "-" ? "remove" : "toggle"; out[k].push(c.slice(1)); });
    return out;
}
/** The other way: the tokens for { add, remove, toggle } (class names with whitespace, ; or | are dropped). */
export const changeFrom = ({ add = [], remove = [], toggle = [] }) => [...add.map((c) => `+${c}`), ...remove.map((c) => `-${c}`), ...toggle.map((c) => `~${c}`)].filter((c) => CHANGE.test(c));

// Classes that hide an element without display:none, and what undoes each. "Show or hide" only adds or removes Tailwind's `hidden` class, so it cannot bring such an element back: it needs "Change classes".
const HIDERS = [[/^(w|h|size|max-w|max-h)-0$/, (m) => `${m[1]}-full`], [/^opacity-0$/, () => "opacity-100"], [/^scale-(x-|y-)?0$/, (m) => `scale-${m[1] || ""}100`], [/^-?translate-(x|y)-full$/, (m) => `translate-${m[1]}-0`], [/^invisible$/, () => "visible"]];
/** The classes in a class list that hide an element in a way "Show or hide" cannot undo: [{ cls: "max-md:w-0", opposite: "max-md:w-full" }]. A variant in front (md:, max-md:, hover:) carries over to the opposite. */
export function hidingClasses(classList) {
    const out = [];
    String(classList || "").split(/\s+/).filter(Boolean).forEach((token) => {
        const colon = token.lastIndexOf(":"), pre = colon >= 0 ? token.slice(0, colon + 1) : "", base = token.slice(pre.length);
        for (const [re, opp] of HIDERS) { const m = re.exec(base); if (m) { out.push({ cls: token, opposite: pre + opp(m) }); break; } }
    });
    return out;
}

/** An id for an element that has none: "div-1", "ul-2"... not one of `taken`. */
export function freshId(tag, taken) {
    const used = new Set(taken);
    let n = 1;
    while (used.has(`${tag}-${n}`)) n++;
    return `${tag}-${n}`;
}

// The runtime. Click: the action runs. Hover: show/hide/toggle apply while the pointer is over the element and are undone when it leaves. Page loads: once.
// Scroll and copy only act (nothing to undo). A click on a link that goes nowhere (href="#") does not jump to the top of the page.
export const INTERACT_SCRIPT = `${INTERACT_MARK}(function(){function by(i){return document.getElementById(i)}function vis(t,s){if(!t)return;t.classList.toggle("hidden",!s)}function cls(t,l,rev){l.split("|").forEach(function(k){var o=k.charAt(0),c=k.slice(1);if(!c)return;if(rev)o=o==="+"?"-":o==="-"?"+":o;if(o==="+")t.classList.add(c);else if(o==="-")t.classList.remove(c);else t.classList.toggle(c)})}function run(a,t,rev,x){if(!t)return;if(a==="classes"){if(x)cls(t,x,rev);return}if(a==="toggle")vis(t,t.classList.contains("hidden")!==!!rev);else if(a==="show")vis(t,!rev);else if(a==="hide")vis(t,!!rev);else if(a==="scroll"&&!rev)t.scrollIntoView({behavior:"smooth",block:"start"});else if(a==="copy"&&!rev){var x=(t.value!==undefined?t.value:t.textContent||"").trim();if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(x).catch(function(){});}}var s=document.querySelectorAll("[data-wc-start=hidden]");for(var i=0;i<s.length;i++)s[i].classList.add("hidden");var els=document.querySelectorAll("[data-wc-do]");for(var j=0;j<els.length;j++)(function(el){(el.getAttribute("data-wc-do")||"").split(";").forEach(function(r){var p=r.trim().split(/\\s+/);if(p.length<3||p.length>4)return;var w=p[0],a=p[1],id=p[2],x=p[3];if(w==="click")el.addEventListener("click",function(e){if(el.tagName==="A"&&(el.getAttribute("href")||"#")==="#")e.preventDefault();run(a,by(id),false,x)});else if(w==="hover"){el.addEventListener("mouseenter",function(){run(a,by(id),false,x)});el.addEventListener("mouseleave",function(){run(a,by(id),true,x)})}else if(w==="load")run(a,by(id),false,x)})})(els[j])})();`;
/** Whether a design's scripts (as parseComponentSource lists them) already carry the interactions script. */
export const hasInteractScript = (scripts) => (scripts || []).some((s) => !s.src && String(s.text || "").includes(INTERACT_MARK));
