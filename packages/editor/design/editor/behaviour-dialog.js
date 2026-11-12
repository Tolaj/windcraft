import { BEHAVIOURS, buildBehaviour, idsIn } from "../../../core/behaviours.js";
import { $, S, esc, model, send } from "./base.js";

// "Add a behaviour" (the JS tab): a small menu of ready-made scripts, then a form that asks which elements the script works on. The result is
// ordinary JavaScript, added to the page's script (code-panel.js puts it in the editor). Elements are named by CSS selector, usually an #id;
// the selected element is offered for the first field, and gets an id of its own when it has none.

let menu = null, dlg = null;
const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };

/** The little list under the button; `pick(behaviour)` runs when one is chosen. */
export function openBehaviourMenu(anchor, pick) {
    closeMenu();
    menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.className = "fixed z-50 w-64 rounded-lg border border-neutral-200 bg-white p-1 text-xs shadow-[0_8px_24px_rgba(0,0,0,.14)]";
    menu.innerHTML = BEHAVIOURS.map((b) => `<button type="button" role="menuitem" data-b="${b.id}" class="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-neutral-100"><span class="font-medium text-neutral-900">${esc(b.name)}</span><span class="block text-[11px] text-neutral-500">${esc(b.hint)}</span></button>`).join("");
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect(), h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - 264, r.right - 256))}px`;
    menu.style.top = `${r.top - h - 6 > 8 ? r.top - h - 6 : r.bottom + 6}px`; // above the button when the panel is at the bottom of the window
    menu.addEventListener("click", (e) => { const b = e.target.closest("[data-b]"); if (!b) return; closeMenu(); pick(BEHAVIOURS.find((x) => x.id === b.dataset.b)); });
    setTimeout(() => {
        const off = (e) => { if (menu && !menu.contains(e.target) && e.target !== anchor) { closeMenu(); document.removeEventListener("pointerdown", off, true); } };
        document.addEventListener("pointerdown", off, true);
        document.addEventListener("keydown", function esc1(e) { if (e.key === "Escape") { closeMenu(); document.removeEventListener("keydown", esc1, true); } }, true);
    }, 0);
}

/** The selected element as a selector: its #id, or a new one it will get when the script is added. */
function selectedSelector() {
    const s = S.selected;
    if (!s || !s.path || !s.path.length || !s.tag) return null;
    const have = s.attrs && s.attrs.id;
    if (have) return { selector: `#${have}`, path: null, id: have };
    const taken = new Set(idsIn(model.markup));
    let n = 1;
    while (taken.has(`${s.tag}-${n}`)) n++;
    return { selector: `#${s.tag}-${n}`, path: s.path, id: `${s.tag}-${n}` };
}

/** The form for one behaviour. `add(text)` runs with the finished script, once the selected element (when used) has its id. */
export function openBehaviourForm(b, add) {
    if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "behaviourDlg";
        dlg.className = "m-auto w-[min(520px,94vw)] rounded-xl border border-neutral-200 p-0 shadow-[0_16px_48px_rgba(0,0,0,.2)] backdrop:bg-black/40";
        document.body.appendChild(dlg);
        dlg.addEventListener("keydown", (e) => e.stopPropagation()); // typing here is not an editor shortcut
    }
    const pick = selectedSelector();
    const ids = idsIn(model.markup);
    dlg.innerHTML = `<form method="dialog" class="flex flex-col text-xs" data-form>
        <div class="border-b border-neutral-200 px-5 py-3"><h3 class="text-sm font-semibold text-neutral-900">${esc(b.name)}</h3><p class="mt-0.5 text-[11px] text-neutral-500">${esc(b.hint)}. Name each element by its id (or any CSS selector).</p></div>
        <div class="space-y-3 px-5 py-4">${b.fields.map((f, i) => `<label class="block"><span class="font-medium text-neutral-900">${esc(f.label)}</span><span class="ml-2 text-neutral-500">${esc(f.hint || "")}</span>
            <input name="${f.key}" list="bl-${f.key}" autocomplete="off" spellcheck="false" value="${i === 0 && pick ? esc(pick.selector) : ""}" class="mt-1 block h-8 w-full rounded-md border border-neutral-300 px-2 font-mono text-[12px] outline-none focus:border-neutral-900"><datalist id="bl-${f.key}">${ids.map((id) => `<option value="#${esc(id)}">`).join("")}</datalist></label>`).join("")}
            ${pick ? `<p class="text-neutral-500">${pick.path ? `The selected element has no id: it gets <code>${esc(pick.id)}</code> when you add this.` : `The selected element (<code>${esc(pick.selector)}</code>) is filled in for ${esc(b.fields[0].label)}.`}</p>` : `<p class="text-neutral-500">Tip: select an element on the canvas first and it is filled in for you.</p>`}
            <p class="text-red-700" data-err role="alert"></p></div>
        <div class="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3"><button type="button" data-cancel class="h-8 rounded-md px-3 text-neutral-600 hover:bg-neutral-100">Cancel</button><button type="submit" data-add class="h-8 rounded-md bg-black px-4 font-semibold text-white hover:bg-neutral-800">Add to script</button></div></form>`;
    dlg.querySelector("[data-cancel]").addEventListener("click", () => dlg.close());
    dlg.querySelector("[data-form]").addEventListener("submit", (e) => {
        e.preventDefault();
        const values = Object.fromEntries(b.fields.map((f) => [f.key, dlg.querySelector(`[name="${f.key}"]`).value]));
        const r = buildBehaviour(b.id, values);
        if (!r.ok) { dlg.querySelector("[data-err]").textContent = `Fill in: ${r.missing.join(", ")}.`; return; }
        // the selected element gets its id before the script that names it is added
        if (pick && pick.path && Object.values(values).some((v) => v.trim() === pick.selector)) send({ cmd: "setAttr", path: pick.path, name: "id", value: pick.id, key: "attr-id" });
        dlg.close();
        add(r.text);
    });
    dlg.showModal();
    dlg.querySelector("input").focus();
}
