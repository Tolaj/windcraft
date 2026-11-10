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
