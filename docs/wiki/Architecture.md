# Architecture

Windcraft is a monorepo of small packages around a Node app.

| Package | What it does |
|---|---|
| [`windcraft-editor`](https://github.com/Tolaj/windcraft/tree/main/packages/editor) | The visual editor (on npm): canvas, layers, Properties panel, code panel, pages. Host-agnostic. |
| [`@windcraft/core`](https://github.com/Tolaj/windcraft/tree/main/packages/core) | The Tailwind logic: class groups, property-to-class mapping, layout inference, board layout, themes. Pure functions with tests. Bundled into `windcraft-editor` when published. |
| [`@windcraft/figma`](https://github.com/Tolaj/windcraft/tree/main/packages/figma) | The Figma to Tailwind converter and plugin. Fixed rules, no LLM. |
| [`@windcraft/mcp`](https://github.com/Tolaj/windcraft/tree/main/packages/mcp) | The MCP protocol for Express, with nothing about what the tools do. |
| [`@windcraft/ai`](https://github.com/Tolaj/windcraft/tree/main/packages/ai) | Provider-neutral AI generation (Anthropic and OpenAI-compatible). |
| `src/` | The app: Express 5, Handlebars, MongoDB. Accounts, projects, the gallery, sharing, the MCP tools. |

**Stack:** Node.js · Express 5 · Handlebars · MongoDB (Mongoose) · Tailwind CSS · CodeMirror 6 · Anthropic SDK.

## The editor in two halves

The design is shown in a sandboxed iframe (the canvas). Inside it, `packages/editor/design/agent.js` handles clicks, drags, resizing and drawing. **It runs in the frame and cannot import anything**, so it is passed to the frame as text and the rest of the editor (host page) talks to it with messages. A gesture ends with the frame sending the pixels it produced; the host turns them into Tailwind classes and sends them back.

```
pointer in the frame ──► agent.js (gesture) ──► pixels ──► host: convertGesture ──► classes ──► agent.js applies and saves
```

Principles: the classes are the only source of truth, and nothing Windcraft-only ends up in a design.

## How a drag works

1. **Where does it go?** `targetAt` reads the page as it was when the drag started and decides the box: over its own box, the 24 px gutter around it, or the outer 30% of a sibling stays in the box (a reorder); a sibling's middle goes inside it; further out goes into the deepest box under the pointer that can hold the element. What a box can hold is read from HTML and layout, not from a tag list.
2. **Which half?** Staying in the box is the slot drag (`reorderGesture`); anything else is the ghost drag (`intent*`). A switch needs the other half to hold for 60 ms.
3. **What does it write?** `dropSmart` removes what the old place gave the element and gives it the rhythm of its new neighbours; the host (`packages/core/intent.js`) writes the result for the right screen size.

## The AI connector

`packages/mcp` is the protocol (tools, resources, prompts, image results). The app's side is in `src/mcp`: `tools.js` (what each tool does and what a client is told on connecting), `resources.js` (the design guide, projects, themes and a design's code as documents) and `prompts.js` (the ready-made commands). Around them:

- **Who is calling.** `services/bearer.service.js` accepts a personal token, a Figma sign-in or an OAuth token and says which (`req.actor`), so what a tool changes is recorded as the AI client's.
- **Changes and undo.** `services/change.service.js` writes every new version (`pushVersion`: who made it goes on the history entry and on the design), reverts a design (`revertDesign`) and logs AI activity for the Connect page (30 days). A person's own edit is never undone by an AI.
- **Screenshots.** `services/render.service.js` draws a design in a headless browser (a local Chrome, a browser service, or `@sparticuz/chromium` on Vercel). It runs the page in a fresh context, blocks requests to localhost and private networks, draws one or two pages at a time and limits each person's screenshots.
- **Suited designs.** `core/roles.js` gives every element and every design a role (sidebar, navbar, card...), so the editor's layouts icon can offer the designs that fit the selected element.

## Interactions, animations and the config

- **Interactions** are data on the element and one shared script. A rule is `data-wc-do="click classes menu +w-full|-w-0"` (when, do, target id, and for classes what to add or remove), and `data-wc-start="hidden"` marks an element that starts closed. `packages/core/interactions.js` reads and writes the rules and holds the script (`INTERACT_SCRIPT`, marked `/*wc-interact*/`), which the editor adds to a page once. The script is a copy saved inside the page, so whenever a page is read, an older copy is replaced by the current one.
- **Animations** work the same way: Tailwind classes for load, hover and focus, and a second small script (`/*wc-motion*/`) for scroll and click. The pieces are `animation-presets.js`, `animation-triggers.js`, `keyframe-model.js` and `text-effects.js` in `packages/core`. Keyframes are written into the project's Tailwind config by `config-edit.js`.
- **The Tailwind config** lives on the project (`tailwind.config.js` or `global.css`). `config-file.js` and `config-resolve.js` (in `packages/core`) look up plugins and build what the canvas loads; `design/config-check.js` in the editor runs a file once in a hidden page before it is saved.
- **The code panel's tabs** split a parsed page with `packages/core/code-parts.js`: the editor's own scripts stay in the HTML tab, and the JS tab holds only the page's own.
- **Preview** is the `/prototype` page, which plays the frames of a project in order. A script in a frame asks the player to switch frames (`Go to frame`).

## Tests

```bash
npm test            # unit tests for core, editor, ai, mcp and the Figma converter
npm run e2e         # browser tests with a throwaway MongoDB (needs mongod and Chrome)
npm run typecheck   # tsc over the whole repo
```

Code that runs in the frame has no unit tests; it is checked by dragging in a browser. Moving its decision rules into `packages/core` is on the roadmap.

More detail on individual parts is in [`docs/PROJECT.md`](https://github.com/Tolaj/windcraft/blob/main/docs/PROJECT.md).
