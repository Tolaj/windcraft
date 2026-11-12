import { checkTags } from "../code-view.js";
import { parseComponentSource } from "../../playground/component-source.js";
import { createCodeEditor, tagProblems } from "../code-editor.js";
import { $, S, data, model } from "./base.js";
import { pref } from "./color-ui.js";
import { assembleDoc, commit, loadFrame } from "./docs.js";
import { cssText, jsText, withCss, withJs, withOwnFrom, withoutOwn } from "../../../core/code-parts.js";
import { layout } from "./plane.js";
import { showConfigIn } from "./config-dialog.js";
import { openBehaviourForm, openBehaviourMenu } from "./behaviour-dialog.js";
import { appendScript } from "../../../core/behaviours.js";

// ── Code panel (two-way with the canvas) ─────────────────────────────────────
// The editor itself is design/code-editor.js (CodeMirror); this part keeps it and the canvas in step.
let ed = null;          // the code editor, once the panel has been opened
let starting = false;
const codeOpen = () => !$("codePanel").classList.contains("hidden");
export const codeFocused = () => Boolean(ed && ed.hasFocus());
const codeValue = () => (ed ? ed.getValue() : "");
// ── The tabs: HTML (markup, links, anything that is not the page's own CSS or JS), CSS and JS ─────────────
let tab = "html";
const TABS = ["html", "css", "js", "config"]; // config: the Tailwind config workspace (config-file-editor.js) instead of the code editor
/** What a tab shows, from the page as it is now. */
function textFor(t) {
    if (t === "config") return "";
    if (t === "css") return cssText(S.parsed);
    if (t === "js") return jsText(S.parsed);
    return model.markup.trim() ? assembleDoc(withoutOwn(S.parsed), model.markup) : "";
}
const lineCount = (text) => (text ? text.split("\n").length : 0);
let jsSeq = 0;
/** Where a script has a syntax error: { line, message } or null (Prettier's parser knows the place; nothing in the script runs). */
async function jsProblem(text) {
    if (!text.trim()) return null;
    try { const { formatSource } = await import("../../vendor/prettier.js"); await formatSource(text, { parser: "babel" }); return null; }
    catch (err) { const loc = err && err.loc && err.loc.start; return { line: loc ? loc.line : 1, message: String(err && err.message ? err.message : err).split("\n")[0].replace(/\s*\(\d+:\d+\)$/, "") }; }
}
/** The counts on the tabs, and the red dot on JS while the script has an error. */
async function refreshTabs() {
    document.querySelectorAll("#codeTabs [data-ctab]").forEach((b) => {
        const t = b.dataset.ctab, n = t === "config" ? 0 : lineCount(t === tab && ed ? ed.getValue() : textFor(t));
        b.querySelector(".ck").textContent = n ? String(n) : "";
        b.classList.toggle("is-on", t === tab);
        b.setAttribute("aria-selected", String(t === tab));
    });
    const seq = ++jsSeq;
    const bad = await jsProblem(jsText(S.parsed));
    if (seq === jsSeq) $("codeJsDot").classList.toggle("hidden", !bad);
}
/** Copies text and says so on the button for a moment. */
function copyText(text, btn) {
    const done = (msg) => { if (!btn) return; const was = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = was; }, 1200); };
    navigator.clipboard.writeText(text).then(() => done("Copied"), () => done("Copy failed"));
}

// ── The selected element, highlighted in the code ───────────────────────────
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
/** Where the element at `path` (element indices from the body down) sits in the markup text: its whole source, and just its opening tag. */
export function elementRange(markup, path) {
    const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    const key = path.join(".");
    const root = { kids: 0, path: [] }, stack = [];
    let m;
    while ((m = re.exec(markup))) {
        if (m[0].startsWith("<!--")) continue;
        const tag = m[2].toLowerCase();
        const end = m.index + m[0].length;
        if (m[1]) {
            const i = stack.map((n) => n.tag).lastIndexOf(tag);
            if (i < 0) continue;
            const node = stack[i];
            stack.length = i;
            if (node.path.join(".") === key) return { start: node.start, openEnd: node.openEnd, end };
            continue;
        }
        const parent = stack[stack.length - 1] || root;
        const node = { tag, start: m.index, openEnd: end, kids: 0, path: [...parent.path, parent.kids++] };
        const lone = VOID_TAGS.has(tag) || m[3].trim().endsWith("/");
        if (lone) { if (node.path.join(".") === key) return { start: node.start, openEnd: end, end }; continue; }
        if (["script", "style", "textarea", "title"].includes(tag)) { const close = markup.toLowerCase().indexOf(`</${tag}`, end); if (close >= 0) re.lastIndex = close; }
        stack.push(node);
    }
    return null;
}
/** Paints the selected element's source in the code (its opening tag darker), and when the selection just changed, scrolls to it. */
export function updateCodeHighlight(reveal) {
    if (!codeOpen() || !ed || tab === "config") return;
    if (tab !== "html") { ed.setMarks([]); return refreshTabs(); }
    const text = ed.getValue();
    const base = model.markup ? text.indexOf(model.markup) : -1;
    const r = S.selected && S.selected.path && S.selected.path.length && base >= 0 ? elementRange(model.markup, S.selected.path) : null;
    ed.setMarks(r ? [[base + r.start, base + r.end, "sel"], [base + r.start, base + r.openEnd, "selt"]] : []);
    refreshTabs();
    if (reveal && r) ed.reveal(base + r.start);
}

export function syncCode() {
    if (!codeOpen() || !ed) return;
    if (tab === "config") { showConfigIn($("codeConfig")); return; } // the page or the theme may have changed
    const next = textFor(tab);
    const prev = ed.getValue();
    if (prev === next) return updateCodeHighlight(false);
    ed.setValue(next); // keeps the scroll position and the cursor
    // show what changed: the first place the new code differs from the old
    let i = 0;
    while (i < prev.length && i < next.length && prev[i] === next[i]) i++;
    if (prev) ed.reveal(i);
    updateCodeHighlight(false);
}
/** Closes the code panel if it is open (nothing selected on the canvas: there is no code to show). */
export function closeCodePanel() { if (codeOpen()) setCodePanel(false); }
async function setCodePanel(open) {
    $("codePanel").classList.toggle("hidden", !open);
    $("codePanel").classList.toggle("flex", open);
    $("codeBtn").classList.toggle("on", open);
    if (open && !ed && !starting) {
        starting = true;
        try {
            ed = await createCodeEditor($("codeMount"), {
                value: textFor(tab), onChange: onCodeInput, problems: tagProblems, onSave: () => $("saveBtn").click(),
                wrap: true, // long class lists wrap instead of scrolling sideways (a narrow panel beside the design would cut off the start of the line)
            });
            ed.setLanguage(tab, tab === "html" ? tagProblems : null);
        } finally { starting = false; }
    }
    if (open && ed) { syncCode(); updateCodeHighlight(true); ed.focus(); }
    layout();
}
let codeTimer = null;
/** Shows the first place the code is wrong (and returns it), or hides the warning. HTML: tags that don't match (not applied until fixed). JS: a syntax error (applied, but the script can't run). */
let warnSeq = 0;
function showCodeProblem() {
    const w = $("codeWarn");
    if (tab === "css" || tab === "config") { w.classList.add("hidden"); return null; }
    if (tab === "js") {
        const seq = ++warnSeq;
        jsProblem(codeValue()).then((bad) => {
            if (seq !== warnSeq || tab !== "js") return;
            w.classList.toggle("hidden", !bad);
            if (bad) { w.textContent = `Line ${bad.line}: ${bad.message}. The script can't run until fixed.`; w.dataset.line = String(bad.line); }
            $("codeJsDot").classList.toggle("hidden", !bad);
        });
        return null; // a script with an error is still kept: it only fails when the page runs
    }
    const bad = checkTags(codeValue());
    w.classList.toggle("hidden", !bad);
    if (bad) { w.textContent = `Line ${bad.line}: ${bad.message}. Not applied until fixed.`; w.dataset.line = String(bad.line); }
    return bad;
}
/** Applies the code to the design now (it waits half a second after typing), unless its tags don't match up. */
function applyCode() {
    clearTimeout(codeTimer);
    codeTimer = null;
    if (showCodeProblem()) return false;
    const text = codeValue();
    if (tab === "css") S.parsed = withCss(S.parsed, text);
    else if (tab === "js") S.parsed = withJs(S.parsed, text);
    else S.parsed = withOwnFrom(parseComponentSource(text), S.parsed);
    commit(S.parsed.markup, "code");
    // the canvas shows the page at rest, with no scripts: only Interact (and the saved page) runs them
    if (tab !== "js" || S.mode !== "edit") loadFrame();
    refreshTabs();
    return true;
}
/** Typing in the code: the squiggles and the warning show at once; the canvas follows once typing pauses (broken tags are never sent to it, where the browser would "repair" them its own way). */
function onCodeInput() {
    showCodeProblem();
    refreshTabs();
    clearTimeout(codeTimer);
    codeTimer = setTimeout(applyCode, 500);
}
/** Shows another tab: the same editor, with that part's text and language. */
function setTab(next) {
    if (!TABS.includes(next) || next === tab) return;
    if (codeTimer) applyCode(); // what was typed goes in first
    tab = next;
    const cfg = tab === "config";
    $("codeMount").classList.toggle("hidden", cfg);
    $("codeConfig").classList.toggle("hidden", !cfg);
    ["codeFind", "codeFormat", "codeCopy"].forEach((id) => $(id).classList.toggle("hidden", cfg)); // they act on the code editor
    $("codeBehaviour").classList.toggle("hidden", tab !== "js"); // ready-made scripts are for the JS tab
    if (cfg) {
        const panel = $("codePanel");
        if (panel.style.height && panel.offsetHeight < 340 && panel.style.width === "") { panel.style.height = "340px"; layout(); } // room for the file and its result
        showCodeProblem();
        showConfigIn($("codeConfig"));
        refreshTabs();
        return;
    }
    if (ed) {
        ed.setLanguage(tab, tab === "html" ? tagProblems : null);
        ed.setValue(textFor(tab));
        ed.setMarks([]);
    }
    showCodeProblem();
    updateCodeHighlight(true);
    if (ed) ed.focus();
}
const copyFlash = (btn, msg) => { const was = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = was; }, 1200); };

/** Registers this part's listeners and does its first draw (called once, in order, by editor.js). */
export function init() {
    $("codeBtn").addEventListener("click", () => setCodePanel(!codeOpen()));
    document.addEventListener("wc-config-changed", () => { if (tab === "config" && codeOpen()) showConfigIn($("codeConfig")); }); // the page's file changed elsewhere (the Properties panel, the animation dialog)
    // Add a behaviour: pick one, say which elements it works on, and its script goes on the end of the page's JavaScript
    $("codeBehaviour").addEventListener("click", (e) => openBehaviourMenu(e.currentTarget, (b) => openBehaviourForm(b, (text) => {
        if (!ed || tab !== "js") return;
        ed.setValue(appendScript(ed.getValue(), text));
        applyCode();
        ed.reveal(ed.getValue().length);
    })));
    $("codeConfig").addEventListener("keydown", (e) => e.stopPropagation()); // typing in the config file is not an editor shortcut
    $("codeTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-ctab]"); if (b) setTab(b.dataset.ctab); });
    $("codeClose").addEventListener("click", () => setCodePanel(false));
    $("codeWarn").addEventListener("click", () => {
        if (!ed) return;
        const [from, to] = ed.lineRange(Number($("codeWarn").dataset.line) || 1);
        ed.select(from, to);
    });
    $("codeCopy").addEventListener("click", (e) => copyText(codeValue(), e.currentTarget));
    $("codeFind").addEventListener("click", () => ed && ed.openSearch());
    // Format: Prettier tidies what the tab shows (HTML with its tags, or the CSS, or the JavaScript), as one undo step
    $("codeFormat").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        if (!ed) return;
        const r = await ed.format();
        if (!r.ok) { copyFlash(btn, "Fix the errors first"); return; }
        if (!r.changed) { copyFlash(btn, "Already tidy"); return; }
        applyCode();
        syncCode();
    });
// ── Where the code sits: below the design, or to its left (side by side) ──────────────────────────────────────────────────────────────────
// Below the design by default. The choice is remembered; a design opened with `codeDock` starts there.
let dock = "bottom";
const sectionEl = () => $("canvas").parentElement; // the column that holds the design (and the code, when it is below)
const DOCK_ICON = {
    left: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16"/></svg>',
    bottom: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/></svg>',
};
function setDock(side, remember = true) {
    const panel = $("codePanel"), handle = $("codeResize");
    dock = side;
    if (side === "left") {
        sectionEl().parentElement.insertBefore(panel, sectionEl());
        panel.classList.remove("border-t");
        panel.classList.add("border-r");
        panel.style.height = "";
        panel.style.width = `${Number(pref("wc:codeW")) || 440}px`;
        handle.className = "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize";
    } else {
        sectionEl().append(panel);
        panel.classList.add("border-t");
        panel.classList.remove("border-r");
        panel.style.width = "";
        panel.style.height = `${Number(pref("wc:codeH")) || 256}px`;
        handle.className = "absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize";
    }
    // the button shows where the code would go next
    $("codeDock").innerHTML = DOCK_ICON[side === "left" ? "bottom" : "left"];
    $("codeDock").title = side === "left" ? "Dock the code below the design" : "Dock the code beside the design (left)";
    if (remember) pref("wc:codeDock", side);
    layout();
}

// Resize: drag the panel's edge (top when below, right when beside); the size is remembered. The handle keeps the pointer
// (setPointerCapture) so the drag follows it over the design's iframe too, which would otherwise take the pointer and leave it stuck.
(() => {
    const panel = $("codePanel"), handle = $("codeResize");
    let drag = null;
    handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        drag = { x: e.clientX, y: e.clientY, w: panel.offsetWidth, h: panel.offsetHeight, side: dock };
        handle.setPointerCapture(e.pointerId);
        document.body.style.cursor = dock === "left" ? "col-resize" : "row-resize";
    });
    handle.addEventListener("pointermove", (e) => {
        if (!drag) return;
        if (drag.side === "left") panel.style.width = `${Math.round(Math.min(innerWidth * 0.7, Math.max(260, drag.w + e.clientX - drag.x)))}px`;
        else panel.style.height = `${Math.round(Math.min(innerHeight * 0.8, Math.max(120, drag.h + drag.y - e.clientY)))}px`;
        layout();
    });
    const end = (e) => {
        if (!drag) return;
        const side = drag.side;
        drag = null;
        document.body.style.cursor = "";
        try { handle.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        pref(side === "left" ? "wc:codeW" : "wc:codeH", String(side === "left" ? panel.offsetWidth : panel.offsetHeight));
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", end);
    $("codeDock").addEventListener("click", () => setDock(dock === "left" ? "bottom" : "left"));
    setDock(data.codeDock || pref("wc:codeDock") || "bottom", false);
    if (data.codeOpen) setCodePanel(true); // a new component starts with its code open
})();
}
