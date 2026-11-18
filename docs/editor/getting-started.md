# Getting started

Pick the way that matches how you build your site. All of them end with the same call: `startEditor`, `mountEditor` or `embedEditor` on an element.

- [1. One HTML file from a CDN](#1-one-html-file-from-a-cdn)
- [2. npm and a static route](#2-npm-and-a-static-route)
- [3. Copy the files into your public folder](#3-copy-the-files-into-your-public-folder)
- [4. React and Next.js](#4-react-and-nextjs)
- [5. Vue and Nuxt](#5-vue-and-nuxt)
- [6. Vite, Svelte, Astro and the rest](#6-vite-svelte-astro-and-the-rest)
- [7. Older pages](#7-older-pages)

## How it loads

The package is `editor/` (the editor) and `core/` (shared code) side by side. `editor/index.js` imports what it needs with relative paths, loads its own `styles.css`, and adds Tailwind's play CDN to the page. So all you need is for those files to be reachable by URL from the browser. You do not bundle them.

## 1. One HTML file from a CDN

```html
<div id="root"></div>
<script type="module">
  import { startEditor } from "https://cdn.jsdelivr.net/npm/windcraft-editor@0.3.1/editor/index.js";
  startEditor(document.getElementById("root"), {
    html: '<h1 class="p-10 text-4xl font-bold">Hello</h1>',
  });
</script>
```

Run `npx serve` next to the file and open the address it prints (a module script does not run from a `file://` address). `https://unpkg.com/windcraft-editor@0.3.1/editor/index.js` works the same. Pin a version so an update does not change your page.

## 2. npm and a static route

```bash
npm install windcraft-editor
```

Express:

```js
app.use("/windcraft", express.static("node_modules/windcraft-editor"));
```

Page:

```html
<script type="module">
  import { startEditor } from "/windcraft/editor/index.js";
  startEditor(document.getElementById("root"), { html: "<h1>Hello</h1>" });
</script>
```

The same idea works in any server: Fastify (`@fastify/static`), Koa (`koa-static`), nginx (`alias /app/node_modules/windcraft-editor/;`), Caddy (`file_server`).

## 3. Copy the files into your public folder

If your site is static (Netlify, GitHub Pages, S3, Cloudflare Pages), copy the package once and commit or deploy it with the rest:

```bash
npm install windcraft-editor
cp -r node_modules/windcraft-editor public/windcraft
```

Add the copy to your build script so it follows upgrades: `"postinstall": "cp -r node_modules/windcraft-editor public/windcraft"`.

## 4. React and Next.js

The editor touches the DOM, so load it on the client, in an effect, by URL. `webpackIgnore` and `@vite-ignore` tell the bundler to leave the import alone.

```jsx
"use client";
import { useEffect, useRef } from "react";

export default function Editor({ html }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    import(/* webpackIgnore: true */ /* @vite-ignore */ "/windcraft/editor/index.js").then(({ startEditor }) => {
      if (alive) startEditor(ref.current, { html });
    });
    return () => { alive = false; };
  }, []);
  return <div ref={ref} style={{ height: "100vh" }} />;
}
```

With Next.js, copy the package to `public/windcraft` (step 3). In React Strict Mode an effect runs twice in development; the `alive` flag above keeps the first run from mounting. A full-page editor can only be mounted once per page load, so for a component that mounts and unmounts as you navigate, use [`embedEditor`](api.md#embededitorcontainer-options) and call `destroy()` in the cleanup:

```jsx
useEffect(() => {
  let ed;
  import(/* webpackIgnore: true */ "/windcraft/editor/index.js").then(({ embedEditor }) => {
    ed = embedEditor(ref.current, { host, data: { htmlCode: html }, ui: { panels: false, nav: false } });
    ed.onChange(({ html }) => setValue(html));
  });
  return () => ed && ed.destroy();
}, []);
```

## 5. Vue and Nuxt

```vue
<template><div ref="root" style="height: 100vh" /></template>

<script setup>
import { ref, onMounted } from "vue";
const root = ref(null);
onMounted(async () => {
  const { startEditor } = await import(/* @vite-ignore */ "/windcraft/editor/index.js");
  startEditor(root.value, { html: "<h1>Hello</h1>" });
});
</script>
```

In Nuxt put the files in `public/windcraft` and wrap the component in `<ClientOnly>`.

## 6. Vite, Svelte, Astro and the rest

The rule is the same everywhere: files in the public (static) folder, import by URL on the client.

- **Vite / SvelteKit / Astro**: copy to `public/windcraft`, use `import(/* @vite-ignore */ "/windcraft/editor/index.js")` in a client-only script.
- **Webpack / Parcel**: copy with `copy-webpack-plugin` (or your tool's equivalent) and use `import(/* webpackIgnore: true */ ...)`.
- **Server-rendered pages** (Rails, Django, Laravel, PHP, .NET): serve the folder as static files and use the plain `<script type="module">` from step 2.

Why not `import "windcraft-editor"` through the bundler? The editor finds its stylesheet and its own files by URL next to `index.js`, so they must sit together on a server. Bundlers move and rename files, which breaks that.

## 7. Older pages

`<script type="module">` is required (every current browser has it). If your page cannot use modules, put the editor on its own page and show it in an iframe, or use [`embedEditor`](api.md#embededitorcontainer-options) from a small module script that your page calls.

## First run checklist

1. The page shows the editor, not a blank box: give the root element a height (the full-page editor does this itself when its parent is `<body>`).
2. A design you edit and reload is still there (`startEditor` stores it in localStorage under `key`).
3. Copy the code from the Code panel, or call `getHtml()` from `mountEditor`/`embedEditor`.

Next: the [API reference](api.md), or [save to your own server](host.md).
