// Ready-made starting messages. A client shows them as commands ("/" in Claude, Cursor and others); each one tells the model which of
// Windcraft's tools to use and in what order, so a short request gets a result that matches the user's own designs.
const arg = (name, description, required = false) => ({ name, description, required });

export const PROMPTS = [
    {
        name: "build-page",
        title: "Build a page",
        description: "Design a new page that matches your project, and save it there.",
        arguments: [arg("description", "What the page is, e.g. a pricing page for a SaaS", true), arg("project", "Project name (default: the active one)")],
        text: ({ description, project }) => [
            `Build this page in my Windcraft${project ? ` project "${project}"` : " active project"}: ${description}`,
            "",
            "1. Call get_context, then get_design_guide, so you know the brief, the tokens and the pages that exist.",
            "2. Call search_components for parts you can reuse (navbar, footer, cards) and get_component for the ones you will use. Match them instead of inventing new styles.",
            "3. Write the page as HTML with Tailwind utility classes and the project's brand, gray, font and radius. It must be responsive and work in dark mode if the project does.",
            "4. Save it with save_design (project and a clear title), then render_design to look at it. Fix anything that looks off with apply_design_patch.",
            "5. Reply with the link to the saved page and one sentence on what you matched from my existing designs.",
        ].join("\n"),
    },
    {
        name: "restyle-to-my-guide",
        title: "Restyle a design to my guide",
        description: "Bring a saved design in line with your design guide without changing its content.",
        arguments: [arg("id", "The design's id (from search_components or get_project)", true)],
        text: ({ id }) => [
            `Restyle my Windcraft design ${id} so it follows my design guide. Keep its content and structure.`,
            "",
            "1. get_design_guide and get_context for the tokens and the brief.",
            "2. get_design_spec for the design. List what departs from the guide (colours, type, spacing, radius, button and card styles).",
            "3. apply_design_patch with small operations on those elements only (pass the spec's baseVersion). Do not rewrite the HTML.",
            "4. render_design before and after, and tell me what changed.",
        ].join("\n"),
    },
    {
        name: "audit-design",
        title: "Audit a design",
        description: "Check a saved design for accessibility, responsiveness and consistency, and fix what is clearly wrong.",
        arguments: [arg("id", "The design's id", true), arg("fix", "Say yes to apply the fixes, otherwise only report")],
        text: ({ id, fix }) => [
            `Audit my Windcraft design ${id}${/^y/i.test(fix || "") ? " and fix what is clearly wrong" : " and report what you find"}.`,
            "",
            "Look at: colour contrast, headings in order, buttons and links with a clear name, images with alt text, form labels, tap targets, a layout that holds at phone width, and consistency with my design guide.",
            "Use get_design_spec to read it and render_design at widths 390 and 1280 to see it. For each problem give the element id, why it matters and the exact fix.",
            /^y/i.test(fix || "") ? "Then apply the fixes with apply_design_patch (baseVersion from the spec) and render it again." : "Do not change anything unless I say so.",
        ].join("\n"),
    },
    {
        name: "make-variations",
        title: "Make variations",
        description: "Save two or three alternative versions of a design next to the original.",
        arguments: [arg("id", "The design's id", true), arg("count", "How many (2 to 4, default 3)"), arg("direction", "What should differ, e.g. bolder, calmer, denser")],
        text: ({ id, count, direction }) => [
            `Make ${Math.min(4, Math.max(2, Number(count) || 3))} variations of my Windcraft design ${id}${direction ? `, going ${direction}` : ""}.`,
            "",
            "Read it with get_component, keep the content and the project's brand, and change the layout, hierarchy and emphasis. Save each as its own page with save_pages in the same project, titled with the original's name plus Variation A, B, C. Render each one and tell me which you would pick and why.",
        ].join("\n"),
    },
    {
        name: "new-section",
        title: "Add a section",
        description: "Design one section (hero, pricing, FAQ...) that fits an existing page.",
        arguments: [arg("kind", "The section, e.g. a pricing table", true), arg("page", "Id of the page it goes on")],
        text: ({ kind, page }) => [
            `Design ${kind} for my Windcraft project${page ? `, to sit on page ${page}` : ""}.`,
            "",
            "Read get_context and get_design_guide, look at the existing pages' sections with get_project and get_component, then write a section that uses the same spacing, widths and components. Save it with save_component in the project and render it.",
        ].join("\n"),
    },
];

export const prompts = {
    list: () => PROMPTS.map(({ text, ...p }) => p),
    async get(userId, name, args = {}) {
        const p = PROMPTS.find((x) => x.name === name);
        if (!p) return null;
        const missing = (p.arguments || []).filter((a) => a.required && !String(args[a.name] || "").trim()).map((a) => a.name);
        if (missing.length) throw Object.assign(new Error(`Missing: ${missing.join(", ")}`), { invalid: true });
        const clean = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v).slice(0, 500)]));
        return { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.text(clean) } }] };
    },
};
