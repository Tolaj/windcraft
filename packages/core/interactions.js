// Interactions: "when this is clicked, show that". A rule lives on the trigger element as one attribute, data-wc-do, and the page carries one small script
// (INTERACT_SCRIPT, added once, like the animation script) that reads the attributes and wires them up. The editor shows designs at rest: rules run in Interact,
// Preview, and the saved or exported page. Pure functions.
//
//   data-wc-do="click toggle menu-1;hover show tip-2"     "<when> <do> <target id>", rules separated by ;
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
]);
const WHENS = WHEN.map(([v]) => v), DOS = DO.map(([v]) => v);
const ID = /^[A-Za-z_][\w:.-]*$/;

/** The rules in an attribute value: [{ when, do, to }]. Anything that isn't a known rule is left out. */
export function parseRules(value) {
    return String(value || "").split(";").map((r) => r.trim().split(/\s+/)).filter((p) => p.length === 3 && WHENS.includes(p[0]) && DOS.includes(p[1]) && ID.test(p[2])).map(([w, d, t]) => ({ when: w, do: d, to: t }));
}
/** The attribute value for some rules (empty when there are none). A rule without a target is not written. */
export const writeRules = (rules) => (rules || []).filter((r) => r && WHENS.includes(r.when) && DOS.includes(r.do) && ID.test(r.to || "")).map((r) => `${r.when} ${r.do} ${r.to}`).join(";");

/** An id for an element that has none: "div-1", "ul-2"... not one of `taken`. */
export function freshId(tag, taken) {
    const used = new Set(taken);
    let n = 1;
    while (used.has(`${tag}-${n}`)) n++;
    return `${tag}-${n}`;
}

// The runtime. Click: the action runs. Hover: show/hide/toggle apply while the pointer is over the element and are undone when it leaves. Page loads: once.
// Scroll and copy only act (nothing to undo). A click on a link that goes nowhere (href="#") does not jump to the top of the page.
export const INTERACT_SCRIPT = `${INTERACT_MARK}(function(){function by(i){return document.getElementById(i)}function vis(t,s){if(!t)return;t.classList.toggle("hidden",!s)}function run(a,t,rev){if(!t)return;if(a==="toggle")vis(t,t.classList.contains("hidden")!==!!rev);else if(a==="show")vis(t,!rev);else if(a==="hide")vis(t,!!rev);else if(a==="scroll"&&!rev)t.scrollIntoView({behavior:"smooth",block:"start"});else if(a==="copy"&&!rev){var x=(t.value!==undefined?t.value:t.textContent||"").trim();if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(x).catch(function(){});}}var s=document.querySelectorAll("[data-wc-start=hidden]");for(var i=0;i<s.length;i++)s[i].classList.add("hidden");var els=document.querySelectorAll("[data-wc-do]");for(var j=0;j<els.length;j++)(function(el){(el.getAttribute("data-wc-do")||"").split(";").forEach(function(r){var p=r.trim().split(/\\s+/);if(p.length!==3)return;var w=p[0],a=p[1],id=p[2];if(w==="click")el.addEventListener("click",function(e){if(el.tagName==="A"&&(el.getAttribute("href")||"#")==="#")e.preventDefault();run(a,by(id),false)});else if(w==="hover"){el.addEventListener("mouseenter",function(){run(a,by(id),false)});el.addEventListener("mouseleave",function(){run(a,by(id),true)})}else if(w==="load")run(a,by(id),false)})})(els[j])})();`;
/** Whether a design's scripts (as parseComponentSource lists them) already carry the interactions script. */
export const hasInteractScript = (scripts) => (scripts || []).some((s) => !s.src && String(s.text || "").includes(INTERACT_MARK));
