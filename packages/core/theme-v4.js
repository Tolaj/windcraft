// The theme as Tailwind 4 wants it: CSS (`@theme` variables, `@keyframes`, `@custom-variant`) inside a `<style type="text/tailwindcss">` block, because the v4
// browser build reads no config object. themeCss4() turns the same choices (brand, gray, font, corners, the extra config) that tailwindConfig() makes for v3.

/** `extend` from the project's config as v4 CSS: { css, skipped: [top-level sections that have no v4 variable] }. */
export function configToV4(extend) {
    const vars = [], blocks = [], skipped = [];
    const safe = (s) => String(s).replace(/[^A-Za-z0-9_.%/-]/g, "").replace(/\./g, "_") || "x";
    for (const [section, value] of Object.entries(extend || {})) {
        if (!value || typeof value !== "object") { skipped.push(section); continue; }
        if (section === "colors") {
            const walk = (name, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v).forEach(([k, x]) => walk(k === "DEFAULT" ? name : `${name}-${safe(k)}`, x)) : vars.push(`--color-${name}: ${v};`));
            Object.entries(value).forEach(([name, v]) => walk(safe(name), v));
        }
        else if (section === "fontFamily") Object.entries(value).forEach(([k, v]) => vars.push(`--font-${safe(k)}: ${Array.isArray(v) ? v.join(", ") : v};`));
        else if (section === "borderRadius") Object.entries(value).forEach(([k, v]) => { if (!["DEFAULT", "none", "full"].includes(k)) vars.push(`--radius-${safe(k)}: ${v};`); }); // v4 has rounded-none and rounded-full built in
        else if (section === "screens") Object.entries(value).forEach(([k, v]) => vars.push(`--breakpoint-${safe(k)}: ${v};`));
        else if (section === "boxShadow") Object.entries(value).forEach(([k, v]) => { if (k !== "DEFAULT") vars.push(`--shadow-${safe(k)}: ${v};`); });
        else if (section === "spacing") Object.entries(value).forEach(([k, v]) => vars.push(`--spacing-${safe(k)}: ${v};`));
        else if (section === "fontSize") Object.entries(value).forEach(([k, v]) => { const [size, extra] = Array.isArray(v) ? v : [v]; vars.push(`--text-${safe(k)}: ${size};`); if (extra && extra.lineHeight) vars.push(`--text-${safe(k)}--line-height: ${extra.lineHeight};`); });
        else if (section === "animation") Object.entries(value).forEach(([k, v]) => vars.push(`--animate-${safe(k)}: ${v};`));
        else if (section === "keyframes") Object.entries(value).forEach(([k, frames]) => blocks.push(`@keyframes ${safe(k)} {\n${Object.entries(frames || {}).map(([at, props]) => `  ${at} { ${Object.entries(props || {}).map(([p, val]) => `${p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${val};`).join(" ")} }`).join("\n")}\n}`));
        else skipped.push(section);
    }
    return { css: [vars.length ? `@theme {\n  ${vars.join("\n  ")}\n}` : "", ...blocks].filter(Boolean).join("\n"), skipped };
}

/** The whole v4 CSS for a theme: dark mode by class, then the theme's config (brand and gray scales, font, corners and the project's extras) as variables, then the recipes' own CSS. */
export function themeCss4(extend, recipeCss = "") {
    const { css, skipped } = configToV4(extend);
    const imports = recipeCss.match(/@import\s[^;]+;/g) || []; // CSS wants every @import before anything else
    const rest = imports.reduce((t, i) => t.replace(i, ""), recipeCss).trim();
    return { css: [...imports, `@custom-variant dark (&:where(.dark, .dark *));`, css, rest].filter(Boolean).join("\n"), skipped };
}
