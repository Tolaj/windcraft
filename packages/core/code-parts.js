// The Code panel's tabs. A page is its markup plus <style> blocks, <script> blocks and links (the parsed source, see parseComponentSource);
// the tabs show it in parts: HTML (markup, links, and everything that is not the page's own CSS or JS), CSS (the page's own styles) and
// JS (the page's own inline scripts, then the ones the editor adds for its features, in a marked region). Pure functions on the parsed source, so they are easy to test.
import { withModelScript } from "./model3d.js";

/** A style the page wrote itself (a typed one, such as Tailwind 4's text/tailwindcss, stays in the HTML tab). */
export const isOwnStyle = (s) => !s.type;
/** An inline script the page wrote itself. Scripts with a src, a Tailwind config (`tailwind.config = …`), a data type, or one the editor manages (it begins with a wc-motion or wc-interact comment) stay in the HTML tab. */
export const isOwnScript = (s) => !s.src && (!s.type || /^(module|text\/javascript|application\/javascript)$/i.test(s.type)) && !/\btailwind\.config\s*=/.test(s.text) && !/^\s*\/\*wc-[a-z]+\*\//.test(s.text);

/** A script the editor keeps in the page for a feature (animation, interactions, 3D models): it begins with a wc-… comment, is the editor's to update, and is never the page's own code. */
export const isManagedScript = (s) => !s.src && /^\s*\/\*wc-[a-z]+\*\//.test(s.text);

const join = (list) => list.map((s) => s.text.trim()).filter(Boolean).join("\n\n");

/** The page's own CSS as one text. */
export const cssText = (p) => join(p.styles.filter(isOwnStyle));
/** The page's own JavaScript as one text. */
export const ownJsText = (p) => join(p.scripts.filter(isOwnScript));

// The JS tab shows all the page's JavaScript, so it can be copied and run elsewhere: the page's own code, then what the editor adds for its
// features (animation, interactions, 3D models) between these two lines. That part is the editor's: it is put back as the current version
// whatever is typed in it, so write your own code above it.
export const REGION_START = "/* ──── Added by the editor for its features (animation, interactions, 3D models). Changes between these lines are replaced: write your own code above. ──── */";
export const REGION_END = "/* ──── End of what the editor adds ──── */";
const REGION = new RegExp(`\\n*${REGION_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${REGION_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n*`, "g");
/** The scripts the editor adds to a page whose markup is `markup` (a 3D model needs its runtime only while the page has one). */
export const managedScripts = (p, markup = p.markup) => withModelScript(p.scripts, markup).filter(isManagedScript);
/** The JS tab: the page's own JavaScript, then the editor's region (only when the page has any). */
export function jsText(p, markup = p.markup) {
    const own = ownJsText(p), managed = join(managedScripts(p, markup));
    return managed ? `${own ? `${own}\n\n` : ""}${REGION_START}\n\n${managed}\n\n${REGION_END}` : own;
}
/** What the JS tab's text holds that is the page's own: the editor's region taken out. */
export const withoutRegion = (text) => String(text || "").replace(REGION, "\n").trim();

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
export const withJs = (p, text) => ({ ...p, scripts: replaceOwn(p.scripts, isOwnScript, withoutRegion(text), (t) => ({ src: "", type: "", defer: false, text: `\n${t.trim()}\n` })) });
/**
 * The parsed source as the HTML tab shows it: without its own CSS and JavaScript, and without the editor's own scripts (the 3D model's runtime
 * alone is hundreds of lines nobody wrote or edits: the editor keeps it up to date and saves and exports it with the page). `keepManaged`: those
 * scripts stay (for copying the page whole).
 */
export const withoutOwn = (p, keepManaged = false) => ({ ...p, styles: p.styles.filter((s) => !isOwnStyle(s)), scripts: p.scripts.filter((s) => !isOwnScript(s) && (keepManaged || !isManagedScript(s))) });
/** `edited` (the HTML tab's text, parsed) with the page's own CSS and JavaScript, and the editor's scripts, from `p` put back: the tab did not show them. */
export const withOwnFrom = (edited, p) => ({ ...edited, styles: [...edited.styles, ...p.styles.filter(isOwnStyle)], scripts: [...edited.scripts, ...p.scripts.filter((s) => isOwnScript(s) || isManagedScript(s))] });
