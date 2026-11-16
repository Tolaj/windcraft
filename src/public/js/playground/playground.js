// The Add component dialog (the code, the design editor, the AI panel) is a lot of code: the editor's modules load one after another, then
// CodeMirror, then a 900-line AI panel. Nothing on the page needs any of it to be read, so it is loaded when the dialog is first wanted
// (playground-core.js), not with every page view: a category page used to fetch about 25 files and 200 KB for a dialog nobody had opened.
//
// It is wanted when: the dialog opens (the page's own buttons open it natively, with command="show-modal"), the pointer or focus reaches
// such a button (so it is usually there by the click), or the user is coming back from the full editor with work to resume.
const dialog = document.getElementById("dialog");
let core = null;
const load = () => (core ||= import("./playground-core.js"));

// What the dialog's markup calls (onclick="…", onsubmit="…"). Until the code has arrived each one waits for it, then runs the real one,
// which replaces it on window. A form submit has to be stopped at once, or the page would navigate while the code loads.
for (const name of ["handleChangeEditor", "clearEditor", "handleBack", "handleClose", "handleSave", "openFullEditor", "handleAIGenerate", "formatCode"]) {
    window[name] = (...args) => {
        const e = args[0];
        if (e && e.type === "submit" && e.preventDefault) e.preventDefault();
        return load().then((m) => m[name](...args));
    };
}

if (dialog) {
    // a message in the editor's place straight away (the editor's own loader takes it over, see showEditorLoader)
    const early = () => {
        const host = document.getElementById("editorHost");
        if (!host || host.querySelector("#editorLoader") || host.childElementCount) return;
        const el = document.createElement("div");
        el.id = "editorLoader";
        el.setAttribute("role", "status");
        el.className = "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-100 text-[13px] text-neutral-500";
        el.innerHTML = '<span class="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800"></span><span>Opening the editor…</span>';
        host.append(el);
    };
    const opened = () => { if (dialog.open) { if (!core) early(); load(); } };
    new MutationObserver(opened).observe(dialog, { attributes: true, attributeFilter: ["open"] });
    opened();
}
// the buttons that open the dialog: start loading as soon as the pointer or the keyboard reaches one
document.querySelectorAll('[commandfor="dialog"]').forEach((button) => {
    for (const type of ["pointerenter", "focus", "touchstart"]) button.addEventListener(type, load, { once: true, passive: true });
});
// coming back from the full editor with work to resume: the dialog opens by itself, so the code is needed at once
try { if (sessionStorage.getItem("wc:resume")) load(); } catch { /* storage unavailable: nothing to resume */ }
