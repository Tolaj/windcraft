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

## Tests

```bash
npm test            # unit tests for core, editor, ai, mcp and the Figma converter
npm run typecheck   # tsc over the whole repo
```

Code that runs in the frame has no unit tests; it is checked by dragging in a browser. Moving its decision rules into `packages/core` is [issue #11](https://github.com/Tolaj/windcraft/issues/11).

More detail on individual parts is in [`docs/PROJECT.md`](https://github.com/Tolaj/windcraft/blob/main/docs/PROJECT.md).
