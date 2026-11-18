# Host reference

The editor never talks to a server itself. It calls a **host**: an object of functions that you write (or `startEditor`'s built-in one, which uses localStorage). Pass it to `mountEditor` or `embedEditor` as `host`.

```js
await mountEditor(root, { host, data: { id, title, htmlCode } });
```

A function that does nothing is a fine answer when you have no use for it. The **required** group below is called by the editor, so supply every one of them. The **optional** functions switch parts of the editor on: leave one out and that part is simply not there.

## Required

| Function | Called when | Resolve to |
|---|---|---|
| `createComponent(fields)` | The first save of a new design | The saved record: `{ _id, version, ... }`. Reject with an `Error` to show its message |
| `updateComponent(id, fields)` | A later save | The saved record. Bump `version` when `fields.htmlCode` changed |
| `createProject(name)` | The editor groups designs on one canvas and needs a project | `{ id, name }` |
| `saveLayout(projectId, positions)` | Frames were moved on the canvas | nothing |
| `saveLayoutOnExit(projectId, positions)` | The same, while the page closes. Synchronous: use `navigator.sendBeacon` if you keep it | nothing |
| `showDesign(id)` | The editor now shows this saved design (`null`: an unsaved one). Update the address if you like | nothing |
| `openDesign(id)` | The user opens another design. Usually `location.href = ...` | nothing |

`fields` carries `title`, `htmlCode`, `category`, `description`, `tags` and the like, as the details form filled them in.

## Optional

| Function | What it switches on | Leave it out and |
|---|---|---|
| `deleteComponent(id)` | A Delete page action | there is no Delete |
| `generate(body, onText)` | The AI box and the AI tab. Resolve to the HTML | there is no AI |
| `saveProjectTheme(projectId, theme)` | Editing the project's theme and Tailwind config. Resolve to the theme as kept | the config is shown but cannot be changed |
| `saveProjectSettings(projectId, patch)` | The "Auto-create elements" switch (`patch.autoParts`) | no such switch |
| `loadFrames(projectId, group)` | A group switcher for big projects | the editor opens with the frames you gave it |
| `projectUrl(projectId)` | The project name becomes a link | it is plain text |
| `previewUrl({ projectId, designId })` | The play button opens that page in its own tab | Preview opens over the editor |
| `listGallery(params)` | A Designs tab in the wireframe popup, listing published designs to add | the popup has Layouts only |
| `updateFromFigma(id)` | A button that converts again from Figma data | no such button |

`generate(body)` receives `{ prompt, useLibrary }`, and for an edit to one element also `currentHtml`. It must resolve to a string of HTML that starts with `<`. See the [AI recipe](recipes.md#ai-generated-pages).

`listGallery({ q, category, kind, sort, role, page })` resolves to `{ items, hasMore, page }`, where each item is `{ id, title, description, category, tags, kind, html, twConfig, likes, author }`.

## The smallest host

```js
const host = {
  async createComponent(f) { return { ...f, _id: "1", version: 1 }; },
  async updateComponent(id, f) { return { ...f, _id: id, version: 2 }; },
  async createProject(name) { return { id: "p", name }; },
  async saveLayout() {}, saveLayoutOnExit() {},
  showDesign() {}, openDesign() {},
};
```

This keeps nothing. It is enough when you only read the HTML back with `getHtml()` or `onChange`. [`local-host.js`](../../packages/editor/local-host.js) is a complete host that stores designs in localStorage.

## A host that talks to your server

Browser side:

```js
const call = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not save");
  return res.json();
};

const host = {
  createComponent: (fields) => call("POST", "/api/designs", fields),
  updateComponent: (id, fields) => call("PUT", `/api/designs/${id}`, fields),
  deleteComponent: (id) => call("DELETE", `/api/designs/${id}`),
  createProject: async (name) => ({ id: "main", name }),
  saveLayout: async () => {}, saveLayoutOnExit: () => {},
  showDesign: (id) => history.replaceState({}, "", id ? `/editor/${id}` : "/editor"),
  openDesign: (id) => { location.href = `/editor/${id}`; },
};
```

Server side (Express, storing designs in a JSON file; swap the two helpers for your database):

```js
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";

const FILE = "designs.json";
const load = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {});
const store = (all) => fs.writeFileSync(FILE, JSON.stringify(all));

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/designs/:id", (req, res) => {
  const d = load()[req.params.id];
  d ? res.json(d) : res.status(404).json({ message: "Not found" });
});
app.post("/api/designs", (req, res) => {
  const all = load(), _id = crypto.randomUUID();
  all[_id] = { ...req.body, _id, version: 1 };
  store(all);
  res.status(201).json(all[_id]);
});
app.put("/api/designs/:id", (req, res) => {
  const all = load(), old = all[req.params.id];
  if (!old) return res.status(404).json({ message: "Not found" });
  const next = { ...old, ...req.body, _id: old._id };
  if (req.body.htmlCode !== undefined && req.body.htmlCode !== old.htmlCode) next.version = (old.version || 1) + 1;
  all[old._id] = next;
  store(all);
  res.json(next);
});
app.delete("/api/designs/:id", (req, res) => {
  const all = load();
  delete all[req.params.id];
  store(all);
  res.json({});
});

app.use("/windcraft", express.static("node_modules/windcraft-editor"));
app.use(express.static("public"));
app.listen(3000);
```

Open a saved design by passing it as `data`:

```js
const saved = await fetch(`/api/designs/${id}`).then((r) => r.json());
await mountEditor(root, {
  host,
  data: { id: saved._id, title: saved.title, htmlCode: saved.htmlCode, version: saved.version, category: saved.category },
});
```

## With `embedEditor`

The host runs in your page and the editor in an iframe, so each call is a message. That has two effects: arguments and results must be plain data (no functions or DOM nodes), and only the functions that exist when you call `embedEditor` are offered to the editor.
