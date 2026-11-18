# Recipes

Copy, paste, change the names. They assume the package is served at `/windcraft` (see [Getting started](getting-started.md)) and use the [`host`](host.md) objects from the other pages.

- [A form field that holds the HTML](#a-form-field-that-holds-the-html)
- [A code box and the canvas that follow each other](#a-code-box-and-the-canvas-that-follow-each-other)
- [An editor for your customers: fewer tools, no panels](#an-editor-for-your-customers)
- [A themed editor](#a-themed-editor)
- [Several editors on one page](#several-editors-on-one-page)
- [AI generated pages](#ai-generated-pages)
- [Show the saved HTML on your own site](#show-the-saved-html-on-your-own-site)
- [Email templates](#email-templates)

## A form field that holds the HTML

An editor inside a form (a CMS entry, a landing page builder). The page's own Save button submits the form, so the editor needs a host that keeps nothing.

```html
<form method="post" action="/pages/42">
  <div id="box" style="height: 640px"></div>
  <input type="hidden" name="html" id="html">
  <button>Save page</button>
</form>

<script type="module">
  import { embedEditor } from "/windcraft/editor/index.js";

  const noop = {
    async createComponent(f) { return { ...f, _id: "x", version: 1 }; },
    async updateComponent(id, f) { return { ...f, _id: id }; },
    async createProject(name) { return { id: "p", name }; },
    async saveLayout() {}, saveLayoutOnExit() {}, showDesign() {}, openDesign() {},
  };

  const input = document.getElementById("html");
  input.value = window.initialHtml || "";        // the HTML you stored last time
  const ed = embedEditor(document.getElementById("box"), {
    host: noop,
    data: { htmlCode: input.value },
    ui: { nav: false },
  });
  ed.onChange(({ html }) => { input.value = html; });
</script>
```

Read `input.value` on the server like any other field. To warn about unsaved work on your own terms, use `ed.isDirty()` and call `ed.release()` once you have submitted.

## A code box and the canvas that follow each other

```js
const ed = embedEditor(document.getElementById("host"), { host: noop, data: { htmlCode: box.value }, ui: { panels: false, nav: false } });

ed.onChange(({ html, source }) => {
  if (source !== "host" && document.activeElement !== box) box.value = html;   // an edit on the canvas fills the box
});
box.addEventListener("input", () => ed.setHtml(box.value));                    // typing in the box redraws the canvas
```

Checking `source` is what stops the two from echoing each other.

## An editor for your customers

You want people to change text and colours without breaking the layout or seeing the code.

```js
embedEditor(el, {
  host,
  data: { htmlCode: template },
  ui: { panels: false, nav: false, tools: ["move", "text"] },   // only move things and edit text
});
```

`tools` takes any of `move hand interact frame shape text add`. Leave `add` out and the Add menu (new elements, wireframes, the gallery) is gone too.

## A themed editor

Make the canvas use your brand, grays, font and corner radius, so the designs look like your product from the first click.

```js
startEditor(root, {
  html: '<button class="rounded-lg bg-brand-600 px-4 py-2 text-white">Buy</button>',
  theme: { brand: "#0f766e", gray: "zinc", font: "DM Sans", radius: "lg" },
});
```

The theme becomes Tailwind classes the designs can use: `bg-brand-600`, `text-brand-50 ... brand-950`, the `gray-*` scale, `font-sans` and the `rounded-*` sizes. Your own site must define the same `brand` colours, grays and font (see [Show the saved HTML](#show-the-saved-html-on-your-own-site)), or the classes have nothing to resolve to.

## Several editors on one page

Only one full-page editor (`startEditor` or `mountEditor`) can run per page, but `embedEditor` runs in an iframe, so as many as you like can share a page.

```js
document.querySelectorAll("[data-editor]").forEach((el) => {
  const ed = embedEditor(el, { host: noop, data: { htmlCode: el.dataset.html }, ui: { panels: false, nav: false } });
  ed.onChange(({ html }) => { el.dataset.html = html; });
});
```

Each one is heavy (it is a whole editor), so mount the ones that are in view and call `destroy()` on the rest.

## AI generated pages

Give the host a `generate` function and the editor shows an AI box on an empty page and an AI tab for the selected element. The function receives `{ prompt, useLibrary, currentHtml? }` and must resolve to a string of HTML that starts with `<`. Keep your API key on your server and call it from there.

Browser:

```js
const host = {
  /* ...the required functions... */
  async generate(body) {
    const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error("The AI is not available right now");
    return (await res.json()).html;
  },
};
```

Server (Express with the Anthropic SDK; any model API works the same way):

```js
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();   // reads ANTHROPIC_API_KEY

app.post("/api/generate", async (req, res) => {
  const { prompt, currentHtml } = req.body;
  const msg = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 8000,
    system: "You write HTML styled with Tailwind CSS classes. Reply with the HTML only: no explanation and no code fences.",
    messages: [{ role: "user", content: currentHtml ? `${prompt}\n\nCurrent HTML:\n${currentHtml}` : prompt }],
  });
  res.json({ html: msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim() });
});
```

If the answer does not start with `<`, the editor shows "The AI didn't return HTML" and nothing changes, so keep the system prompt strict about that.

## Show the saved HTML on your own site

The editor writes ordinary Tailwind classes, so a page that shows the saved HTML needs Tailwind CSS too. Two ways:

1. **Play CDN** (simple, fine for internal tools and prototypes):

   ```html
   <script src="https://cdn.tailwindcss.com"></script>
   <script>
     tailwind.config = { theme: { extend: { colors: { brand: { 600: "#0f766e" /* ...the scale */ } } } } };
   </script>
   <main>{{ saved html }}</main>
   ```

2. **Your own Tailwind build** (production): add the folder or database field that holds the saved HTML to Tailwind's `content` so its classes are generated, and copy the theme into your `tailwind.config.js`. To read the exact config a theme produces, call `tailwindConfig(theme)` from `windcraft-editor/core/theme.js`.

Always treat saved HTML as untrusted input if other people can edit it: sanitize it (for example with DOMPurify) before you put it on a page that other visitors see.

## Email templates

Email clients ignore most `<style>` blocks, so inline the CSS after you get the HTML back. Build the page with the editor, take `getHtml()`, compile Tailwind over it with your own build, then run the result through an inliner such as `juice`. Stick to simple layouts (tables for columns) in the design itself; the editor will not stop you from using grid or flex, which many email clients do not render.
