# Troubleshooting

## The editor is blank or tiny

The root element needs a height. A full-page editor sets `100vh` itself only when its parent is `<body>`. Anywhere else give the element one: `style="height: 100vh"` or a fixed pixel height.

## "Failed to load module" / 404 on `/windcraft/editor/index.js`

Open that URL in the browser. If it is a 404, the folder is not served where you think. The URL must reach the package's `editor/` folder, with `core/` next to it (the editor imports `../core/...`). Serve the whole package folder, not just `editor/`.

## Nothing happens when I open the HTML file

Module scripts do not run from `file://`. Serve the folder: `npx serve`, `python3 -m http.server`, or your dev server.

## CORS errors for `index.js`

Modules loaded from another origin need `Access-Control-Allow-Origin`. unpkg and jsDelivr send it. If you serve the package from a different domain than the page, add the header on that server, or serve it from the same origin.

## "The editor is already mounted on this page"

`startEditor` and `mountEditor` allow one editor per page load. Common causes: React Strict Mode or hot reload running your effect twice, or calling it again after navigating inside a single-page app. Guard it (a flag or `alive` check, see [React](getting-started.md#4-react-and-nextjs)) or use [`embedEditor`](api.md#embededitorcontainer-options), which can be created and destroyed freely. A full reload of the page always clears it.

## `document is not defined` / window errors on the server

The editor needs a browser. In Next.js, Nuxt, SvelteKit and Astro load it inside `useEffect`, `onMounted` or a client-only component, never during server rendering.

## It fails to load Tailwind

The editor adds `https://cdn.tailwindcss.com` to the page. If your site's Content-Security-Policy blocks it, or the machine is offline, the editor cannot style anything. Allow `https://cdn.tailwindcss.com` and `https://fonts.googleapis.com` in `script-src` and `style-src`, or add Tailwind's play CDN script yourself and pass `tailwind: false`.

## My designs disappeared

`startEditor` keeps designs in this browser's localStorage under `key` (default `windcraft`). Another browser, a private window, cleared site data or a different `key` shows none of them. To keep them on a server use `mountEditor` with a [host](host.md).

## Saving does nothing, or says "Could not save"

Your host's function rejected or never resolved. `createComponent` and `updateComponent` must resolve to the saved record (`{ _id, version, ... }`); reject with an `Error` whose message you want the user to see. Check the browser's network tab and console.

## A required host function is missing

Errors like `host.saveLayout is not a function` mean a required function is not on your host. Add all seven (see the [host reference](host.md#required)); a function that does nothing is enough.

## `embedEditor` shows nothing

- The iframe loads `embed.html` from next to `index.js`. If that is not reachable, pass `src` with its URL.
- The host's functions are called through messages. Results must be plain data (JSON-like).
- If the page that embeds the editor already loads Tailwind, pass `tailwind: false`.

## The keys or the zoom in my page act strangely

A full-page editor takes over the page's keyboard and stops the browser's pinch and Ctrl/Cmd zoom, because the canvas has its own zoom. If your page needs those back, use `embedEditor`: it runs in an iframe with its own keys.

## Still stuck

Open an issue with the browser, the console output and what you tried: <https://github.com/Tolaj/windcraft/issues>.
