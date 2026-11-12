# Embedding the Editor (npm)

The editor is on npm as [`windcraft-editor`](https://www.npmjs.com/package/windcraft-editor). It needs no backend and no build step.

```bash
npm install windcraft-editor
```

Serve `node_modules/windcraft-editor` as static files, for example `app.use("/windcraft", express.static("node_modules/windcraft-editor"))`, and import from it:

```js
import { startEditor } from "/windcraft/editor/index.js";
startEditor(document.getElementById("root"), { html: "<h1>Hello</h1>" });
```

## Without installing

Save this as `index.html`, run `npx serve` next to it and open the address it prints:

```html
<div id="root"></div>
<script type="module">
  import { startEditor } from "https://unpkg.com/windcraft-editor/editor/index.js";
  startEditor(document.getElementById("root"), {
    html: '<h1 class="p-10 text-4xl font-bold">Hello</h1>',
  });
</script>
```

## Which function

| Function | Use it when |
|---|---|
| `startEditor(root, options)` | The editor is the whole page. Designs are saved in the browser. |
| `mountEditor(root, options)` | You want to load and save on your own server. |
| `embedEditor(root, options)` | The editor lives in one box of a page. It runs in an iframe, so several can share a page. |

`startEditor` options:

| Option | What it does |
|---|---|
| `html` | The HTML a new design starts with |
| `title` | The design's name (default `My design`) |
| `key` | The localStorage key, so two editors on one site do not share designs |
| `theme` | `{ brand: "#e11d48", gray: "stone", font: "Poppins", radius: "xl" }` |

## Save to your own server

`mountEditor` takes a **host**: a few functions (`createComponent`, `updateComponent`, ...) that talk to your backend.

```js
import { mountEditor } from "/windcraft/editor/index.js";

await mountEditor(document.getElementById("root"), {
    host,                              // your load and save functions
    data: { id, title, htmlCode },     // the design to open
});
```

The host is an object with these functions. The editor calls the first group, so supply them (a function that does nothing is fine when you have no use for it; `startEditor` does this for you). The optional ones switch parts of the editor on.

| Function | What it does | If you leave it out |
|---|---|---|
| `createComponent(fields)` | Saves a new design and resolves to the saved record (`_id`, `version`, ...) | Required |
| `updateComponent(id, fields)` | Changes a saved design (a new version when its code changes) | Required |
| `deleteComponent(id)` | Deletes a saved design | No Delete button |
| `createProject(name)` | Makes a project, the canvas designs share | Required |
| `saveLayout(projectId, positions)` and `saveLayoutOnExit(...)` | Where each design sits on the project's canvas | Required (positions are not kept if it does nothing) |
| `showDesign(id)` and `openDesign(id)` | The address now shows this design, and go to another design | Required |
| `generate(body, onText)` | The AI drafts a page and resolves to its HTML | No AI box or AI tab |
| `saveProjectTheme(projectId, theme)` | Saves the project's theme and Tailwind config, and resolves to what was kept | The Tailwind config is shown but cannot be changed |
| `projectUrl(projectId)` | Where a project's own page is | The project name is not a link |
| `previewUrl({ projectId, designId })` | The prototype page for a saved design | Preview opens over the editor instead of in its own tab |
| `updateFromFigma(id)` | Converts a design again from its Figma data | No such button |

## Put it inside a part of a page

```js
import { embedEditor } from "/windcraft/editor/index.js";

const ed = embedEditor(document.getElementById("box"), {
    host,
    data: { htmlCode: "<h1>Hello</h1>" },
    ui: { panels: false, nav: false },   // hide parts you do not need
});

ed.onChange(({ html }) => console.log(html));
ed.setHtml("<p>New</p>");   // ed.getHtml(), ed.isDirty(), ed.save(), ed.destroy()
```

The full reference is in [`packages/editor/README.md`](https://github.com/Tolaj/windcraft/blob/main/packages/editor/README.md).
