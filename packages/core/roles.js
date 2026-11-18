// What a piece of a page IS: its role (a sidebar, a navbar, a hero, a card, a form...).
//
// Two sides use the same words. The editor works out the role of the element that is selected (`roleOfElement`, from its tag, its
// classes, its size and where it sits), and every published design carries roles of its own (`rolesOfDesign`, from its code, its category
// and its title), so "designs suited to this element" is a simple match. Pure functions, no DOM: tested in test/roles.test.js.
// A guess, never a hard rule: the dialog lets the person remove the filter.

/** The roles, with the name shown for each. */
export const ROLES = {
    sidebar: "Sidebar", navbar: "Navbar", hero: "Hero", features: "Features", pricing: "Pricing", testimonials: "Testimonials", faq: "FAQ", stats: "Stats",
    cta: "Call to action", footer: "Footer", card: "Card", form: "Form", button: "Button", field: "Field", table: "Table", list: "List", modal: "Modal",
    dropdown: "Dropdown", banner: "Banner", gallery: "Gallery", logos: "Logos", section: "Section",
};

/** Bump it when the rules change: every design is looked at again. */
export const ROLES_VERSION = 1;

/** The wireframe kinds (core/wireframes.js) that suit a role. A role with none has no layouts to narrow to. */
export const KINDS_FOR_ROLE = {
    sidebar: ["split"], navbar: ["navbar"], hero: ["hero"], features: ["features", "grid", "bento"], pricing: ["pricing"], testimonials: ["testimonials"],
    faq: ["faq"], stats: ["stats"], cta: ["cta"], footer: ["footer"], card: ["grid", "bento"], gallery: ["grid", "bento"], logos: ["logos"],
    section: ["hero", "features", "split", "grid", "cta"],
};

// The other roles worth offering next to a guess.
const ALTS = { sidebar: ["navbar"], navbar: ["banner", "sidebar"], hero: ["features", "cta"], section: ["features", "cta", "testimonials"], card: ["features", "stats"], footer: ["navbar"], banner: ["navbar", "cta"], features: ["card", "stats"], button: ["field"], form: ["field", "card"], list: ["card", "table"], table: ["list", "stats"] };

// ── A selected element ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The role of a selected element, and up to three others that could also fit; { role: null } for something with no design to swap in (plain text).
 * @param {{ tag?: string, classes?: string, rect?: { x?: number, y?: number, w?: number, h?: number } | null, pageW?: number, parentLayout?: string | null, index?: number, siblings?: number }} el
 */
export function roleOfElement(el = {}) {
    const tag = String(el.tag || "").toLowerCase();
    const classes = String(el.classes || "");
    const w = (el.rect && el.rect.w) || 0, h = (el.rect && el.rect.h) || 0, y = (el.rect && el.rect.y) || 0;
    const pw = el.pageW || 1280;
    const last = el.siblings > 1 && el.index === el.siblings - 1;
    const first = el.index === 0;
    const tall = h > 1.6 * w && w > 0 && w <= 0.3 * pw;
    const wide = w >= 0.75 * pw;
    const pick = (role) => ({ role, alts: (ALTS[role] || []).filter((r) => r !== role).slice(0, 3) });
    if (/^(h[1-6]|p|span|strong|em|small|label|blockquote|figcaption|td|th|li|br|hr)$/.test(tag)) return { role: null, alts: [] }; // text: nothing to swap
    if (tag === "img" || tag === "svg" || tag === "video") return { role: null, alts: [] };
    if (tag === "aside") return pick("sidebar");
    if (tag === "header") return pick(tall ? "sidebar" : "navbar");
    if (tag === "nav") return pick(tall ? "sidebar" : "navbar");
    if (tag === "footer") return pick("footer");
    if (tag === "form") return pick("form");
    if (tag === "table") return pick("table");
    if (tag === "ul" || tag === "ol") return pick("list");
    if (tag === "button" || (tag === "a" && /\b(rounded|px-\d|py-\d|bg-)/.test(classes))) return pick("button");
    if (tag === "input" || tag === "select" || tag === "textarea") return pick("field");
    if (tag === "dialog") return pick("modal");
    // a plain box: by its shape and where it sits
    if (tall && (el.parentLayout === "flex row" || el.parentLayout === "grid" || first || last)) return pick("sidebar");
    if (wide && h > 0 && h <= 140) return pick(first || y < 90 ? "navbar" : last ? "footer" : "banner");
    if (wide) return pick(last ? "footer" : first || y < 260 ? "hero" : "section");
    if (w > 0 && w <= 0.45 * pw && h <= 360) return pick("card");
    return pick("section");
}

// ── A published design ──────────────────────────────────────────────────────────────────────────────────────────────

const CATEGORY_ROLES = {
    "marketing-hero": ["hero"], "marketing-hero-forms": ["hero", "form"], "marketing-icons": ["features"], "marketing-pricing": ["pricing"], "marketing-faq": ["faq"],
    "marketing-blog": ["section"], "marketing-testimonials": ["testimonials"], "marketing-team": ["section"], "marketing-features": ["features"],
    "marketing-announcements": ["banner"], "marketing-cards": ["card"], "marketing-clients": ["logos"], "marketing-galleries": ["gallery"], "marketing-timeline": ["section"],
    "ui-dropdowns": ["dropdown"], "ui-selects": ["dropdown", "field"], "ui-buttons": ["button"], "ui-modals": ["modal"], "ui-cookie-banners": ["banner"],
    "navigation-navbars": ["navbar"], "navigation-mega-menu": ["navbar"], "layout-basic": ["section"],
    "forms-authentication": ["form"], "forms-feedback": ["form"], "forms-subscribe": ["form"], "forms-textarea": ["field"], "pages-pricing": ["pricing"],
    "ecommerce-products": ["card"], "apps-invoice": ["section"], "apps-tables": ["table"], "apps-stats": ["stats"], "apps-charts": ["card"], "apps-ai-prompt": ["form"],
    "footer-contact": ["footer"], "footer-footers": ["footer"],
    "navigation-sidebars": ["sidebar"], "marketing-cta": ["cta"], "marketing-stats": ["stats"], "ui-alerts": ["banner"], "ui-accordions": ["list", "faq"],
    "navigation-pagination": ["list"], "forms-controls": ["field"], "ui-empty-states": ["section"],
};

// Words in a title or a tag. The first words listed for a role are the ones a person would search for.
const WORDS = [
    ["sidebar", /\b(side ?bar|side ?nav|side menu|drawer|app shell)\b/i], ["navbar", /\b(nav ?bar|top ?bar|header|navigation|mega ?menu|menu bar)\b/i], ["hero", /\bhero\b/i],
    ["footer", /\bfooter\b/i], ["pricing", /\bpric(e|ing)\b/i], ["faq", /\bfaq\b/i], ["testimonials", /\btestimonial/i], ["stats", /\bstats?\b/i], ["cta", /\b(cta|call to action)\b/i],
    ["card", /\bcards?\b/i], ["form", /\b(form|login|log in|sign ?in|sign ?up|subscribe|contact)\b/i], ["button", /\bbuttons?\b/i], ["table", /\btables?\b/i], ["modal", /\b(modal|dialog)\b/i],
    ["dropdown", /\b(dropdown|select|menu)\b/i], ["banner", /\b(banner|announcement|cookie)\b/i], ["gallery", /\bgallery\b/i], ["logos", /\b(logos?|clients)\b/i], ["features", /\bfeatures?\b/i],
];

/** The first element of a design's markup: its tag and classes (no DOM: a scan of the text). */
function rootOf(html) {
    let s = String(html || "");
    const body = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (body) s = body[1];
    s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script|template)\b[\s\S]*?<\/\1>/gi, "").replace(/<link\b[^>]*>/gi, "");
    const m = s.match(/<([a-z][a-z0-9-]*)\b([^>]*)>/i);
    if (!m) return { tag: "", classes: "" };
    const c = m[2].match(/\bclass\s*=\s*"([^"]*)"|\bclass\s*=\s*'([^']*)'/i);
    return { tag: m[1].toLowerCase(), classes: (c && (c[1] || c[2])) || "" };
}

/**
 * The roles of a published design, most likely first (at most four): what its own code says, the title and tags, and its category.
 * @param {{ html?: string, htmlCode?: string, category?: string, title?: string, tags?: string[] }} d
 */
export function rolesOfDesign(d = {}) {
    const html = d.html ?? d.htmlCode ?? "";
    const out = [];
    const add = (r) => { if (r && ROLES[r] && !out.includes(r)) out.push(r); };
    // 1. its own root: an <aside>, a tall narrow box that fills the screen, a bar fixed to the top
    const { tag, classes } = rootOf(html);
    if (tag === "aside") add("sidebar");
    else if (/(^|\s)(h-screen|min-h-screen|h-full|h-dvh)(\s|$)/.test(classes) && /(^|\s)w-(4[89]|5\d|6\d|7\d|80|\[\d{3}px\])(\s|$)/.test(classes)) add("sidebar");
    if (tag === "header" || (tag === "nav" && !out.includes("sidebar"))) add("navbar");
    if (tag === "footer") add("footer");
    if (tag === "form") add("form");
    if (tag === "table") add("table");
    if (tag === "dialog") add("modal");
    if (tag === "button") add("button");
    if (/(^|\s)(fixed|sticky)(\s|$)/.test(classes) && /(^|\s)top-0(\s|$)/.test(classes) && /(^|\s)(w-full|inset-x-0)(\s|$)/.test(classes)) add("navbar");
    // 2. the words in its title and tags
    const text = [d.title || "", ...(d.tags || [])].join(" ");
    WORDS.forEach(([role, rx]) => { if (rx.test(text)) add(role); });
    // 3. its category
    (CATEGORY_ROLES[d.category] || []).forEach(add);
    return out.slice(0, 4);
}
