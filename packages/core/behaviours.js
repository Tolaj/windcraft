// "Add a behaviour": ready-made scripts for the JS tab. Each one is a template: the editor asks which elements it works on (CSS selectors, usually an #id), and
// the result is an ordinary script put in the page's JavaScript, where it can be read and edited like any other. Pure functions, so they are easy to test.
//   behaviour.fields   what to ask: { key, label, hint, many }   (many: a selector that may match several elements, such as ".tab")
//   behaviour.script(values) -> the JavaScript text (it begins with a comment naming the behaviour)

const q = (s) => JSON.stringify(String(s).trim());
/** A selector that is safe to put in a script: any text, but never empty. */
const sel = (v) => q(v || "#missing");
/** Text for a comment: one line, so nothing in it can end the comment and start code. */
const one = (s) => String(s).replace(/[\r\n\u2028\u2029]+/g, " ");

export const BEHAVIOURS = [
    {
        id: "toggle-menu", name: "Toggle menu", hint: "Show and hide an element with a button",
        fields: [
            { key: "button", label: "Button", hint: "The one you click, for example #menu-btn" },
            { key: "menu", label: "Menu", hint: "What it shows and hides, for example #menu" },
        ],
        script: (v) => `// Toggle menu: ${one(v.button)} shows and hides ${one(v.menu)}
(function () {
  const button = document.querySelector(${sel(v.button)});
  const menu = document.querySelector(${sel(v.menu)});
  if (!button || !menu) return;
  const set = (open) => {
    menu.classList.toggle("hidden", !open);
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => set(menu.classList.contains("hidden")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
})();`,
    },
    {
        id: "modal", name: "Modal", hint: "Open and close a dialog",
        fields: [
            { key: "open", label: "Open button", hint: "For example #open-modal" },
            { key: "modal", label: "Modal", hint: "The dialog, hidden at first: for example #modal" },
            { key: "close", label: "Close button", hint: "Inside the modal: for example #close-modal" },
        ],
        script: (v) => `// Modal: ${one(v.open)} opens ${one(v.modal)}, ${one(v.close)} (or the backdrop, or Esc) closes it
(function () {
  const openBtn = document.querySelector(${sel(v.open)});
  const modal = document.querySelector(${sel(v.modal)});
  const closeBtn = document.querySelector(${sel(v.close)});
  if (!openBtn || !modal) return;
  const show = (on) => modal.classList.toggle("hidden", !on);
  openBtn.addEventListener("click", () => show(true));
  if (closeBtn) closeBtn.addEventListener("click", () => show(false));
  modal.addEventListener("click", (e) => { if (e.target === modal) show(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") show(false); });
})();`,
    },
    {
        id: "tabs", name: "Tabs", hint: "Click a tab, show its panel",
        fields: [
            { key: "tabs", label: "Tab buttons", hint: "Every tab, for example .tab or #tabs > *", many: true },
            { key: "panels", label: "Panels", hint: "The same number, in the same order, for example .panel", many: true },
        ],
        script: (v) => `// Tabs: ${one(v.tabs)} each show the panel in the same place in ${one(v.panels)}
(function () {
  const tabs = Array.from(document.querySelectorAll(${sel(v.tabs)}));
  const panels = Array.from(document.querySelectorAll(${sel(v.panels)}));
  if (!tabs.length || tabs.length !== panels.length) return;
  const show = (n) => {
    panels.forEach((p, i) => p.classList.toggle("hidden", i !== n));
    tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === n)));
  };
  tabs.forEach((t, i) => t.addEventListener("click", () => show(i)));
  show(0);
})();`,
    },
];

export const behaviourById = (id) => BEHAVIOURS.find((b) => b.id === id) || null;

/** The behaviour's script for these values; the field values are trimmed, and empty ones are an error to report (the names of the fields left blank). */
export function buildBehaviour(id, values) {
    const b = behaviourById(id);
    if (!b) return { ok: false, missing: [], text: "" };
    const v = Object.fromEntries(b.fields.map((f) => [f.key, String(values[f.key] || "").trim()]));
    const missing = b.fields.filter((f) => !v[f.key] && !(id === "modal" && f.key === "close")).map((f) => f.label);
    return missing.length ? { ok: false, missing, text: "" } : { ok: true, missing: [], text: b.script(v) };
}

/** `existing` JavaScript with the behaviour's script added after it, a blank line between. */
export const appendScript = (existing, text) => [String(existing || "").trim(), text.trim()].filter(Boolean).join("\n\n");

/** The ids written in some markup, for suggestions: ["menu", "menu-btn"]. */
export function idsIn(markup) {
    const out = [];
    String(markup || "").replace(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/g, (_, a, b) => { const id = a || b; if (id && !out.includes(id)) out.push(id); return ""; });
    return out;
}
