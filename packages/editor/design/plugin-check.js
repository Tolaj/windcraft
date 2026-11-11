import { tailwindTag, cleanEngine } from "../../core/plugins.js";
import { themeHead, normalizeTheme } from "../../core/theme.js";

// The sandbox test: a recipe is loaded in a hidden, sandboxed page of its own (its engine, only that recipe, a probe element), and what happens is reported:
// did every file load, did anything throw, did Tailwind itself compile. Nothing is switched on in a project until this has said so.
//   verdict: "works" | "notes" (it runs, with something to read) | "fails" (a file did not load, or Tailwind did not start) | "build" (it needs more than a page can give)

const COLLECT = `<script>window.__e=[];window.addEventListener("error",function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href))__e.push({kind:"load",url:t.src||t.href});else __e.push({kind:"error",msg:String(e.message||e.error)})},true);window.addEventListener("unhandledrejection",function(e){__e.push({kind:"error",msg:String(e.reason&&e.reason.message||e.reason)})});var ce=console.error;console.error=function(){__e.push({kind:"error",msg:[].slice.call(arguments).join(" ")});ce.apply(console,arguments)};<\/script>`;
const REPORT = (id) => `<script>setTimeout(function(){var p=document.getElementById("p"),ok=false;try{ok=getComputedStyle(p).paddingTop==="13px"}catch(e){}parent.postMessage({wcCheck:${JSON.stringify(id)},errors:window.__e,tw:ok},"*")},3500)<\/script>`;

/** The page the test runs in, for a recipe (exported so it can be looked at). */
export function checkDocument(recipe, id) {
    const theme = normalizeTheme({ engine: recipe.engine, recipes: [{ ...recipe, id: "draft", on: true }] });
    return `<!doctype html><html><head><meta charset="utf-8">${COLLECT}${tailwindTag(theme)}${themeHead(theme)}</head><body><div id="p" class="p-[13px]">probe</div>${REPORT(id)}</body></html>`;
}

/** What the page reported, as a verdict. Pure: separate from the iframe so it can be tested. */
export function judge(report, engine) {
    const messages = [];
    const errors = report.errors || [];
    const loads = errors.filter((e) => e.kind === "load");
    const others = errors.filter((e) => e.kind !== "load").map((e) => e.msg);
    if (!report.tw) {
        messages.push(`Tailwind ${cleanEngine(engine)} did not compile with this recipe: a step's link or CSS is probably wrong, or you are offline.`);
        loads.forEach((e) => messages.push(`Couldn't load ${e.url}`));
        return { verdict: "fails", messages };
    }
    const needsBuild = others.find((m) => /can only need|does not support plugins|browser build does not support/i.test(m));
    if (needsBuild) return { verdict: "build", messages: [needsBuild.replace(/^Uncaught (Error: )?/, "")] };
    if (loads.length) { loads.forEach((e) => messages.push(`Couldn't load ${e.url}`)); return { verdict: "fails", messages }; }
    if (others.length) { [...new Set(others)].slice(0, 3).forEach((m) => messages.push(m.slice(0, 160))); return { verdict: "notes", messages }; }
    return { verdict: "works", messages: ["Loaded without errors and Tailwind compiled."] };
}

let seq = 0;
/** Runs the test: resolves { verdict, messages }. */
export function checkRecipe(recipe) {
    return new Promise((resolve) => {
        const id = `chk${++seq}`;
        const f = document.createElement("iframe");
        f.setAttribute("sandbox", "allow-scripts");
        f.style.cssText = "position:fixed;left:-9999px;top:0;width:600px;height:300px;border:0;visibility:hidden";
        let done = false;
        const finish = (r) => { if (done) return; done = true; window.removeEventListener("message", onMsg); clearTimeout(timer); f.remove(); resolve(r); };
        const onMsg = (e) => { if (e.source === f.contentWindow && e.data && e.data.wcCheck === id) finish(judge(e.data, recipe.engine)); };
        const timer = setTimeout(() => finish({ verdict: "fails", messages: ["It didn't finish loading in 12 seconds."] }), 12000);
        window.addEventListener("message", onMsg);
        f.srcdoc = checkDocument(recipe, id);
        document.body.appendChild(f);
    });
}
