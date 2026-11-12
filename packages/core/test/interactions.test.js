import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRules, writeRules, freshId, INTERACT_SCRIPT, hasInteractScript, changeParts, changeFrom, hidingClasses } from "../interactions.js";

test("rules are read and written, and anything that is not a rule is left out", () => {
    assert.deepEqual(parseRules("click toggle menu-1;hover show tip"), [{ when: "click", do: "toggle", to: "menu-1" }, { when: "hover", do: "show", to: "tip" }]);
    assert.deepEqual(parseRules("tap toggle x;click fly x;click toggle;click toggle a b;click toggle 9x"), []);
    assert.equal(writeRules([{ when: "click", do: "hide", to: "m" }, { when: "click", do: "hide", to: "" }, { when: "x", do: "hide", to: "m" }]), "click hide m");
    assert.equal(writeRules(parseRules("click toggle a;load show b")), "click toggle a;load show b");
});

test("a new id is one the page does not have", () => {
    assert.equal(freshId("div", ["a"]), "div-1");
    assert.equal(freshId("div", ["div-1", "div-2"]), "div-3");
});

test("the script parses and the page can tell it is there", () => {
    assert.doesNotThrow(() => new Function(INTERACT_SCRIPT));
    assert.equal(hasInteractScript([{ src: "", text: INTERACT_SCRIPT }]), true);
    assert.equal(hasInteractScript([{ src: "", text: "x()" }, { src: "https://a/b.js", text: "" }]), false);
});

test("the script wires click, hover and load rules to a fake page", () => {
    const classes = (initial) => { const s = new Set(initial); return { toggle: (c, force) => { const on = force === undefined ? !s.has(c) : force; on ? s.add(c) : s.delete(c); }, contains: (c) => s.has(c), add: (c) => s.add(c), has: (c) => s.has(c) }; };
    const handlers = {};
    const target = { classList: classes([]), scrolled: 0, scrollIntoView() { this.scrolled++; } };
    const late = { classList: classes([]) };
    const trig = { tagName: "BUTTON", getAttribute: (n) => (n === "data-wc-do" ? "click toggle menu;hover show late;load hide late" : null), addEventListener: (ev, fn) => { handlers[ev] = fn; } };
    const starts = [{ classList: classes([]) }];
    const doc = { getElementById: (i) => ({ menu: target, late }[i]), querySelectorAll: (q) => (q === "[data-wc-start=hidden]" ? starts : [trig]) };
    new Function("document", "navigator", INTERACT_SCRIPT)(doc, {});
    assert.equal(starts[0].classList.contains("hidden"), true, "a target that starts hidden is hidden");
    assert.equal(late.classList.contains("hidden"), true, "load: hide");
    handlers.click({ preventDefault() {} });
    assert.equal(target.classList.contains("hidden"), true, "toggle hides a visible target");
    handlers.click({ preventDefault() {} });
    assert.equal(target.classList.contains("hidden"), false, "and shows it again");
    handlers.mouseenter();
    assert.equal(late.classList.contains("hidden"), false, "hover: shown while over it");
    handlers.mouseleave();
    assert.equal(late.classList.contains("hidden"), true, "and hidden again after");
});

test("a rule that changes classes carries them: add, remove and toggle", () => {
    const v = "click classes menu +max-md:w-full|-max-md:w-0|~open";
    const [r] = parseRules(v);
    assert.deepEqual(r, { when: "click", do: "classes", to: "menu", change: ["+max-md:w-full", "-max-md:w-0", "~open"] });
    assert.equal(writeRules([r]), v);
    assert.deepEqual(changeParts(r.change), { add: ["max-md:w-full"], remove: ["max-md:w-0"], toggle: ["open"] });
    assert.deepEqual(changeFrom({ add: ["a"], remove: ["b c", "d"], toggle: ["e"] }), ["+a", "-d", "~e"], "a name with a space can't be one class");
    assert.deepEqual(parseRules("click classes menu;click classes menu x;click classes menu +"), [], "no classes, or not a change: not a rule");
    assert.equal(writeRules([{ when: "click", do: "classes", to: "menu", change: [] }]), "", "nothing to change: not written");
    assert.deepEqual(parseRules("click toggle menu +a"), [], "only a classes rule has a fourth part");
});

test("the script swaps classes like the drawer menu: open adds w-full and removes w-0, close does the reverse", () => {
    const set = (init) => { const s = new Set(init); return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c) => (s.has(c) ? s.delete(c) : s.add(c)), has: (c) => s.has(c), contains: (c) => s.has(c) }; };
    const menu = { classList: set(["max-md:w-0", "flex"]) };
    const handlers = {};
    const mk = (v) => ({ tagName: "BUTTON", getAttribute: (n) => (n === "data-wc-do" ? v : null), addEventListener: (ev, fn) => { (handlers[v] ||= {})[ev] = fn; } });
    const open = mk("click classes menu +max-md:w-full|-max-md:w-0"), close = mk("click classes menu +max-md:w-0|-max-md:w-full"), tog = mk("hover classes menu ~glow");
    const doc = { getElementById: (i) => (i === "menu" ? menu : null), querySelectorAll: (q) => (q === "[data-wc-do]" ? [open, close, tog] : []) };
    new Function("document", "navigator", INTERACT_SCRIPT)(doc, {});
    handlers[open.getAttribute("data-wc-do")].click({});
    assert.deepEqual([menu.classList.has("max-md:w-full"), menu.classList.has("max-md:w-0"), menu.classList.has("flex")], [true, false, true]);
    handlers[close.getAttribute("data-wc-do")].click({});
    assert.deepEqual([menu.classList.has("max-md:w-full"), menu.classList.has("max-md:w-0")], [false, true]);
    handlers[tog.getAttribute("data-wc-do")].mouseenter();
    assert.equal(menu.classList.has("glow"), true, "toggle on");
    handlers[tog.getAttribute("data-wc-do")].mouseleave();
    assert.equal(menu.classList.has("glow"), false, "and off when the pointer leaves");
});

test("classes that hide an element the way a drawer or a fade does are found, with what undoes them", () => {
    assert.deepEqual(hidingClasses("flex max-md:w-0 max-md:overflow-hidden"), [{ cls: "max-md:w-0", opposite: "max-md:w-full" }]);
    assert.deepEqual(hidingClasses("opacity-0 scale-0 -translate-x-full invisible h-0").map((h) => h.opposite), ["opacity-100", "scale-100", "translate-x-0", "visible", "h-full"]);
    assert.deepEqual(hidingClasses("hover:opacity-0").map((h) => h.opposite), ["hover:opacity-100"]);
    assert.deepEqual(hidingClasses("w-10 hidden opacity-50 w-0.5 p-0"), [], "other zeros and `hidden` itself are not these");
    assert.deepEqual(hidingClasses(""), []);
});

test("Go to page: the target is a page id, and the script asks the player to switch", () => {
    const id = "6ae22d6509f0e37b410d6c2d";
    assert.deepEqual(parseRules(`click goto ${id}`), [{ when: "click", do: "goto", to: id }]);
    assert.equal(writeRules([{ when: "click", do: "goto", to: id }]), `click goto ${id}`);
    assert.deepEqual(parseRules("click goto menu"), [], "an element id is not a page");
    assert.deepEqual(parseRules(`click toggle ${id}`), [], "and a page id is not an element");
    const asked = [];
    const el = { tagName: "A", getAttribute: (n) => (n === "data-wc-do" ? `click goto ${id}` : "/real-link"), addEventListener: (ev, fn) => { el.fn = fn; } };
    let prevented = 0;
    new Function("document", "window", "navigator", INTERACT_SCRIPT)({ getElementById: () => null, querySelectorAll: (q) => (q === "[data-wc-do]" ? [el] : []) }, { __wcGoto: (k) => asked.push(k) }, {});
    el.fn({ preventDefault: () => prevented++ });
    assert.deepEqual(asked, [id]);
    assert.equal(prevented, 1, "a link with a real href does not also navigate");
});

test("a rule can wait for a click on the element itself (its backdrop)", () => {
    const classes = (init) => { const s = new Set(init); return { toggle: (c, f) => { const on = f === undefined ? !s.has(c) : f; on ? s.add(c) : s.delete(c); }, contains: (c) => s.has(c), add: (c) => s.add(c) }; };
    const modal = { tagName: "DIV", classList: classes([]), handlers: {}, getAttribute: (n) => (n === "data-wc-do" ? "backdrop hide modal" : null), addEventListener(ev, fn) { this.handlers[ev] = fn; } };
    const doc = { getElementById: (i) => (i === "modal" ? modal : null), querySelectorAll: (q) => (q === "[data-wc-do]" ? [modal] : []) };
    new Function("document", "navigator", INTERACT_SCRIPT)(doc, {});
    modal.handlers.click({ target: { not: "the modal" } }); // a click inside its content
    assert.equal(modal.classList.contains("hidden"), false, "a click on what is inside does not close it");
    modal.handlers.click({ target: modal });
    assert.equal(modal.classList.contains("hidden"), true, "a click on the backdrop itself does");
    assert.deepEqual(parseRules("backdrop hide modal").map((r) => r.when), ["backdrop"]);
});
