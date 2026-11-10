import { themeHead } from "../../core/theme.js";
import { tailwindTag } from "../../core/plugins.js";
const TAILWIND_RE = /tailwindcss|@tailwindcss\/browser/i;

const isTailwindScript = (s) => s.src && TAILWIND_RE.test(s.src);

/**
 * Splits whatever the user pasted (fragment, full document, with <style>,
 * <link>, <script>, body attributes) into separately usable parts.
 */
export function parseComponentSource(code) {
    const hasBodyTag = /<body[\s>]/i.test(code || "");
    // A fragment (no <html>, <head> or <body>) is parsed as what the body holds: parsed as a whole document, a comment before the
    // first element (<!-- component --> on a copied snippet) would go before <html> and be lost from the code.
    const fragment = !/<(?:html|head|body)[\s>]/i.test(code || "") && !/^\s*<!doctype/i.test(code || "");
    const dom = new DOMParser().parseFromString(fragment ? `<body>${code || ""}` : code || "", "text/html");
    // what a document parse would have moved into <head> (and so out of the markup) stays out of it, as before
    if (fragment) dom.body.querySelectorAll(":scope > meta, :scope > title, :scope > base").forEach((el) => el.remove());

    const styles = [];
    const links = [];
    const scripts = [];

    dom.querySelectorAll("style").forEach((el) => {
        styles.push({ type: el.getAttribute("type") || "", text: el.textContent });
        el.remove();
    });

    dom.querySelectorAll("link").forEach((el) => {
        const rel = (el.getAttribute("rel") || "").toLowerCase();
        if (rel === "stylesheet" || rel === "preconnect" || rel === "preload") {
            links.push(el.outerHTML);
        }
        el.remove();
    });

    dom.querySelectorAll("script").forEach((el) => {
        scripts.push({
            src: el.getAttribute("src") || "",
            type: el.getAttribute("type") || "",
            defer: el.hasAttribute("defer"),
            text: el.textContent,
        });
        el.remove();
    });

    const bodyAttrs = {};
    if (hasBodyTag) {
        Array.from(dom.body.attributes).forEach((a) => (bodyAttrs[a.name] = a.value));
    }

    return {
        markup: dom.body.innerHTML.trim(),
        styles,
        links,
        scripts,
        bodyAttrs,
        hasTailwindScript: scripts.some(isTailwindScript),
        hasCss: styles.length > 0 || links.length > 0,
        hasJs: scripts.some((s) => !isTailwindScript(s)),
    };
}

/**
 * Content sized by the screen (min-h-screen, h-screen, 100vh...) in a frame that follows its content's height: the frame is the
 * screen, so it is as tall as the content, which is as tall as the frame... Two of them (or one plus a header) grow without end.
 * Where a frame follows its content (the editor's canvas), a screen is the device's for that width instead (as the wireframe tiles
 * and the Interact tool show it): 800 tall on a desktop, 1024 on a tablet, 844 on a phone.
 */
export const screenHeightFor = (w) => (w >= 1024 ? 800 : w >= 768 ? 1024 : 844);
const SCREEN_SIZED = ["h-screen", "min-h-screen", "max-h-screen", "h-dvh", "min-h-dvh", "max-h-dvh", "h-svh", "min-h-svh", "max-h-svh", "h-lvh", "min-h-lvh", "max-h-lvh", "h-[100vh]", "min-h-[100vh]", "h-[100dvh]", "min-h-[100dvh]"];
export function screenHeightCss(px) {
    return SCREEN_SIZED.map((c) => `.${c.replace(/[[\]]/g, "\\$&")}{${c.startsWith("min-") ? "min-height" : c.startsWith("max-") ? "max-height" : "height"}:${px}px !important}`).join("");
}

const escapeAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeScript = (t) => t.replace(/<\/script/gi, "<\\/script");

const HEIGHT_REPORTER = `
(function () {
    var last = 0;
    function report() {
        var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
        if (h && h !== last) { last = h; parent.postMessage({ type: "preview-height", height: h }, "*"); }
    }
    new ResizeObserver(report).observe(document.documentElement);
    window.addEventListener("load", report);
    // Esc in the live page goes back to editing (the editor's Interact tool listens for it)
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") parent.postMessage({ type: "key", key: "escape" }, "*"); });
})();`;

// The project's theme for every document built here (set by the page that shows designs; see core/theme.js).
// The theme's Tailwind config is added only where this adds Tailwind itself: a design that brings its own script keeps its own config.
let previewTheme = null;
export const setPreviewTheme = (theme) => { previewTheme = theme || null; };
/** The Tailwind script tag for the open design: the play CDN with the project's official plugins. */
export const tailwindMarkup = () => tailwindTag(previewTheme);
/** The head markup for the theme (the font and the config), or nothing without one. */
export const themeMarkup = () => (previewTheme ? themeHead(previewTheme) : "");

/** Builds a complete, standalone document for an iframe's srcdoc. */
/** `fixedScreen`: the frame follows its content's height, so screen-sized content gets the device's screen height (screenHeightCss). */
export function buildPreviewDocument(parsed, { width, fixedScreen = false, theme = null } = {}) {
    const head = [
        '<meta charset="utf-8">',
        `<meta name="viewport" content="width=${width || "device-width"}, initial-scale=1">`,
    ];

    if (!parsed.hasTailwindScript) {
        head.push(tailwindTag(theme || previewTheme));
        if (theme || previewTheme) head.push(theme ? themeHead(theme) : themeMarkup()); // `theme`: this one page's own (the project's with the page's config over it)
    }
    head.push(...parsed.links);
    parsed.styles.forEach((s) => {
        const type = s.type ? ` type="${escapeAttr(s.type)}"` : "";
        head.push(`<style${type}>${s.text.replace(/<\/style/gi, "<\\/style")}</style>`);
    });

    const bodyAttrs = Object.entries(parsed.bodyAttrs)
        .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
        .join("");

    const scripts = parsed.scripts
        .map((s) => {
            const attrs =
                (s.src ? ` src="${escapeAttr(s.src)}"` : "") +
                (s.type ? ` type="${escapeAttr(s.type)}"` : "") +
                (s.defer ? " defer" : "");
            return `<script${attrs}>${s.src ? "" : escapeScript(s.text)}<\/script>`;
        })
        .join("\n");

    return `<!DOCTYPE html>
<html>
<head>
${head.join("\n")}
<style>html,body{margin:0}${fixedScreen ? screenHeightCss(screenHeightFor(width || 1280)) : ""}</style>
</head>
<body${bodyAttrs}>
${parsed.markup}
${scripts}
<script>${HEIGHT_REPORTER}<\/script>
</body>
</html>`;
}
