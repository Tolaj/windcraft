// The Code panel's tabs. A page is its markup plus <style> blocks, <script> blocks and links (the parsed source, see parseComponentSource);
// the tabs show it in parts: HTML (markup, links, and everything that is not the page's own CSS or JS), CSS (the page's own styles) and
// JS (the page's own inline scripts). Pure functions on the parsed source, so they are easy to test.

/** A style the page wrote itself (a typed one, such as Tailwind 4's text/tailwindcss, stays in the HTML tab). */
export const isOwnStyle = (s) => !s.type;
/** An inline script the page wrote itself. Scripts with a src, a Tailwind config (`tailwind.config = …`), a data type, or one the editor manages (it begins with a wc-motion or wc-interact comment) stay in the HTML tab. */
export const isOwnScript = (s) => !s.src && (!s.type || /^(module|text\/javascript|application\/javascript)$/i.test(s.type)) && !/\btailwind\.config\s*=/.test(s.text) && !/^\s*\/\*wc-[a-z]+\*\//.test(s.text);

const join = (list) => list.map((s) => s.text.trim()).filter(Boolean).join("\n\n");

/** The page's own CSS as one text. */
export const cssText = (p) => join(p.styles.filter(isOwnStyle));
/** The page's own JavaScript as one text. */
export const jsText = (p) => join(p.scripts.filter(isOwnScript));

/** Puts `text` where the first matching block was and removes the other matching blocks (the text is all of them, joined); no text: none left. */
function replaceOwn(list, own, text, make) {
    const out = [];
    let placed = false;
    for (const item of list) {
        if (!own(item)) { out.push(item); continue; }
        if (!placed && text.trim()) { out.push(make(text)); placed = true; }
    }
    if (!placed && text.trim()) out.push(make(text));
    return out;
}

/** The parsed source with its own CSS replaced by `text`. */
export const withCss = (p, text) => ({ ...p, styles: replaceOwn(p.styles, isOwnStyle, text, (t) => ({ type: "", text: `\n${t.trim()}\n` })) });
/** The parsed source with its own JavaScript replaced by `text`. */
export const withJs = (p, text) => ({ ...p, scripts: replaceOwn(p.scripts, isOwnScript, text, (t) => ({ src: "", type: "", defer: false, text: `\n${t.trim()}\n` })) });
/** The parsed source as the HTML tab shows it: without its own CSS and JavaScript. */
export const withoutOwn = (p) => ({ ...p, styles: p.styles.filter((s) => !isOwnStyle(s)), scripts: p.scripts.filter((s) => !isOwnScript(s)) });
/** `edited` (the HTML tab's text, parsed) with the page's own CSS and JavaScript from `p` put back: the tab did not show them. */
export const withOwnFrom = (edited, p) => ({ ...edited, styles: [...edited.styles, ...p.styles.filter(isOwnStyle)], scripts: [...edited.scripts, ...p.scripts.filter(isOwnScript)] });
