import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRules, writeRules, freshId, INTERACT_SCRIPT, hasInteractScript } from "../interactions.js";

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
