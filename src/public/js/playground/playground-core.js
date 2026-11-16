// The Add component dialog's code, loaded the first time the dialog is wanted (see playground.js): the design editor's modules, CodeMirror and the AI panel
// are a lot to fetch, and nothing on the page needs them until then.
import { handleChangeEditor, clearEditor } from "./playground-editor.js";
import { handleBack, handleClose, handleSave, openFullEditor } from "./playground-dialog.js";
import { handleAIGenerate } from "./playground-ai.js";
import { formatCode } from "./playground-code.js";

// ── Expose to inline HTML handlers (onclick="...") ───────────────────────────
window.handleChangeEditor = handleChangeEditor;
window.clearEditor = clearEditor;
window.handleBack = handleBack;
window.handleClose = handleClose;
window.handleSave = handleSave;
window.openFullEditor = openFullEditor;
window.handleAIGenerate = handleAIGenerate;
const formatCodeButton = async (btn) => {
    const r = await formatCode();
    const was = btn.dataset.label || btn.textContent;
    btn.dataset.label = was;
    btn.textContent = !r.ok ? "Fix the errors first" : r.changed ? "Formatted" : "Already tidy";
    setTimeout(() => { btn.textContent = was; }, 1400);
};
window.formatCode = formatCodeButton;

// ── AI prompt: Enter key to submit ────────────────────────────────────────────
const hookPrompt = () => {
    const input = document.getElementById("aiPromptInput");
    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAIGenerate();
            }
        });
    }
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hookPrompt); else hookPrompt();

// what playground.js's stand-ins call once this has loaded
export { handleChangeEditor, clearEditor, handleBack, handleClose, handleSave, openFullEditor, handleAIGenerate, formatCodeButton as formatCode };
