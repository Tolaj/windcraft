# API reference

```js
import { startEditor, mountEditor, embedEditor } from "/windcraft/editor/index.js";
```

- [`startEditor(root, options)`](#starteditorroot-options)
- [`mountEditor(root, options)`](#mounteditorroot-options)
- [`embedEditor(container, options)`](#embededitorcontainer-options)
- [The editor object](#the-editor-object)
- [`data`: the design to open](#data-the-design-to-open)
- [`ui`: what the editor shows](#ui-what-the-editor-shows)
- [`theme`](#theme)

## `startEditor(root, options)`

The quickest way in: the editor as the whole page, with nothing to set up. Designs are kept in the browser's localStorage. Returns a promise.

| Option | Type | Default | What it does |
|---|---|---|---|
| `html` | string | `""` | The HTML a new design starts with |
| `title` | string | `"My design"` | The design's name |
| `key` | string | `"windcraft"` | The localStorage key. Use different keys so two editors on one site do not share designs |
| `theme` | object | the default theme | [`{ brand, gray, font, radius }`](#theme) for a new design |

When the address has `?design=<id>` and that design is saved under `key`, it is opened instead of a new one.

## `mountEditor(root, options)`

The editor as the whole page, saving through your [host](host.md). Resolves to the [editor object](#the-editor-object). Throws if an editor is already mounted on the page.

| Option | Type | What it does |
|---|---|---|
| `host` | object | **Required.** Your load and save functions: see the [host reference](host.md) |
| `data` | object | The design to open: [`data`](#data-the-design-to-open) |
| `back` | `{ href, title?, label? }` | Shows a Back link to `href`. Leave it out and there is no Back link |
| `ui` | object | [`ui`](#ui-what-the-editor-shows) |
| `tailwind` | boolean | `false` when your page already loads Tailwind's play CDN (v3). Default `true` |

`root` is an element with a height. When its parent is `<body>` and it has no height of its own, the editor makes it `100vh`.

## `embedEditor(container, options)`

The editor inside one element of a page. It runs in an iframe, so it has its own keys, zoom and styles, and several editors can share a page. It returns at once with the [editor object](#the-editor-object) plus `ready`.

| Option | Type | What it does |
|---|---|---|
| `host` | object | **Required.** Your host. Its functions are called from the iframe through messages, so they should take and return plain data |
| `data` | object | The design to open |
| `ui` | object | [`ui`](#ui-what-the-editor-shows) |
| `onDetails` | `(fields) => void` | A first save needs a name: you show your own form, then call `ed.saveDetails(fields)` |
| `src` | string | Where the editor's `embed.html` is served. Default: next to `index.js` |
| `tailwind` | boolean | `false` when the iframe page already has Tailwind |

`ed.ready` is a promise that resolves when the editor has opened the design and painted it. Show your own loading state until then.

`ed.destroy()` removes the iframe and the listeners (call it when your component unmounts).

## The editor object

What `mountEditor` resolves to and `embedEditor` returns.

| Member | What it does |
|---|---|
| `getHtml()` | The design's HTML as it is now |
| `setHtml(html)` | Replaces it. One undo step. `onChange` reports it with `source: "host"` |
| `onChange(fn)` | `fn({ html, dirty, status, source })` after every change. `source` is `"editor"` (the markup changed in the editor), `"host"` (your `setHtml`) or `"status"` (only the save state moved). Returns a function that unsubscribes |
| `isDirty()` | Whether there is anything unsaved |
| `save()` | The editor's own save. A first save that needs a name asks `ui.onDetails` (or `onDetails` for `embedEditor`), or else shows the editor's own dialog |
| `saveDetails(fields)` | Finishes that first save with `{ title, category, description, tags, isPublished, useAsReference, project }`. Rejects with the reason |
| `details()` | What the details form starts from |
| `release()` | You are leaving the page on purpose and have kept the work: no "Leave site?" question |
| `status()` | (`embedEditor`) the save status text |
| `ready` | (`embedEditor`) a promise, see above |
| `destroy()` | (`embedEditor`) remove the editor |

Typical two-way link with your own code box:

```js
ed.onChange(({ html, source }) => { if (source !== "host") codeBox.value = html; });
codeBox.addEventListener("input", () => ed.setHtml(codeBox.value));
```

## `data`: the design to open

| Field | What it is |
|---|---|
| `htmlCode` | The design's HTML |
| `id` | The saved design's id. Leave it out for a new, unsaved design |
| `title`, `description`, `tags` | Details. `tags` is an array |
| `version` | The saved version number |
| `category` | The slug of one of `categories` |
| `categories` | `[{ group: "Designs", items: [{ slug: "design", name: "Design" }] }]`: what the details form offers |
| `project` / `projects` | `{ id, name }` and a list of them, when you use projects |
| `theme` | A [theme](#theme) for a new design |

Anything you leave out has a harmless default.

## `ui`: what the editor shows

| Field | Effect |
|---|---|
| `panels: false` | no Layers, Properties or Code panels: only the canvas and its toolbar |
| `nav: false` | no Back button, page list or project name |
| `tools: ["move","hand","interact","frame","shape","text","add"]` | only these tools. `null` (the default) keeps all |
| `onDetails(fields)` | your own form for a first save (see `saveDetails`) |

## `theme`

```js
theme: { brand: "#e11d48", gray: "stone", font: "Poppins", radius: "xl" }
```

| Key | Values |
|---|---|
| `brand` | any hex colour. The Tailwind `brand` scale (50 to 950) is made from it, with the colour as 600 |
| `gray` | `slate`, `gray`, `zinc`, `neutral` or `stone` |
| `font` | any Google Fonts family name, or `"System"` for the system font |
| `radius` | `none`, `sm`, `md`, `lg` or `xl`: the `rounded-*` sizes follow it |

Values that are not valid fall back to the defaults (`#4f46e5`, `slate`, `Inter`, `md`).
