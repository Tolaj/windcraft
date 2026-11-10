<div align="center">

<img src="docs/media/logo.png#gh-light-mode-only" alt="Windcraft" height="72">
<img src="docs/media/logo-light.png#gh-dark-mode-only" alt="Windcraft" height="72">

### Design in Tailwind. Keep it as code.

**A visual design editor where every click writes real Tailwind HTML.**

[![npm](https://img.shields.io/npm/v/windcraft-editor?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/windcraft-editor)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3_%26_4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![MCP](https://img.shields.io/badge/MCP-server-8A2BE2)](docs/mcp.md)
[![Figma plugin](https://img.shields.io/badge/Figma-plugin-F24E1E?logo=figma&logoColor=white)](https://www.figma.com/community/plugin/1697363010304569719)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**Try it live**](https://windcraft.swapniljadhav.com/) · [Watch the demo](docs/media/windcraft-demo.mp4) · [Get started](#get-started) · [Contribute](#contributing)

<br>

[![Windcraft: click anything, edit it visually, and the code changes with it](docs/media/windcraft-demo.gif)](docs/media/windcraft-demo.mp4)

</div>

## Contents

[What it is](#what-it-is) · [Screenshots](#screenshots) · [What you can do](#what-you-can-do) · [Get started](#get-started) · [How it is built](#how-it-is-built) · [Status](#status) · [Roadmap](#roadmap) · [Contributing](#contributing) · [License](#license)

## What it is

Windcraft is an editor for web pages where the page is plain HTML with Tailwind classes, and every control reads and writes those classes. Make the padding bigger and `p-4` becomes `p-6`. Pick a colour and `bg-rose-500` changes. Edit the code and the design follows; edit the design and the code follows.

There is no export step and no Windcraft-only format. What you see in the editor is the HTML you ship, so you can paste it into a codebase or hand it to a coding agent as it is.

You can start from a blank page, from a Figma design (with a plugin that runs on your computer), or from a description (with Claude or a local model).

## Screenshots

<p align="center">
  <img src="docs/media/editor.png" alt="The Windcraft editor: a selected card with its Tailwind properties on the right and the live code below" width="760">
  <br><sub><b>Select a card</b> and the Properties panel shows its Tailwind values, while the code below highlights the exact element.</sub>
</p>

<table>
  <tr>
    <td valign="top">
      <img src="docs/media/selection.png" alt="Selecting a container shows its children as dashed outlines" width="420">
      <br><b>Selection like Figma.</b> Click picks the top box, double-click goes one level in. The box you picked shows what it holds as dashed outlines.
    </td>
    <td valign="top">
      <img src="docs/media/code.png" alt="The code panel open beside the design" width="420">
      <br><b>Code and canvas in step.</b> Edit the HTML and the design follows. Edit the design and the code follows. Undo covers both.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="docs/media/layers.png" alt="Layers panel listing every element of the page" width="420">
      <br><b>Layers and pages.</b> Every element in a tree, every page on one infinite canvas.
    </td>
    <td valign="top">
      <img src="docs/media/responsive.png" alt="The same page at mobile width, the cards stacked in one column" width="420">
      <br><b>Responsive by design.</b> Switch to Tablet or Mobile, or drag to any width. Edits land in the right breakpoint (<code>md:p-8</code>).
    </td>
  </tr>
</table>

## What you can do

**Edit visually**
- Select, move, resize, rotate, align, group, lock, hide, copy and paste, nudge with the arrow keys.
- Draw frames, rectangles, ovals, lines, arrows, text, images and buttons.
- **Drag to rearrange.** Inside its own box an element follows your pointer and the page shows the layout the drop will make. Drag it out and a copy follows the pointer while a blue outline shows where it will land; <kbd>Tab</kbd> tries the next placement and <kbd>Esc</kbd> cancels.
- **Edits are written for the device you are editing** (Mobile plain, Tablet `md:`, Desktop `lg:`), and a small bar lets you choose "this size and up", "only this size" or "all sizes".

**Work with the code**
- A Properties panel where every field is a Tailwind class, edited at its source. Breakpoints `sm` to `2xl` and states (`hover`, `focus`). `16px` becomes `p-4`; an off-scale value becomes `rounded-[10px]`.
- A live code panel: click an element and its code lights up; edit the HTML and the canvas follows. Paste HTML from anywhere.

**Bring things in**
- **Figma:** a free plugin turns a selection into HTML and Tailwind on your computer, with no LLM, no network and no picture fallback. Auto Layout becomes flex. See [packages/figma](packages/figma/README.md).
- **AI:** describe a page and **Anthropic Claude** or any **OpenAI-compatible local model** (Ollama, LM Studio, vLLM) drafts it with your project's tokens and best-matching components.

**Connect and share**
- **MCP server:** Claude, Claude Code and Cursor can read your design system and save pages into your projects. [Setup guide](docs/mcp.md).
- **Projects:** one look per project (brand scale, gray, font, radius), a share link, a full-screen prototype view, export to HTML, React, Vue or Svelte, version history and a gallery.

## Get started

**Just look:** [open Windcraft live](https://windcraft.swapniljadhav.com/), nothing to install.

**Run the editor locally, no database** (about 30 seconds):

```bash
git clone https://github.com/Tolaj/windcraft.git
cd windcraft
npm install
npm run demo
```

Open <http://localhost:4000/editor/demo/> (add `?theme` to see a project theme applied).

**Run the full app** (accounts, projects, gallery, AI, MCP). You need Node.js 18+ and a MongoDB database (local or Atlas):

```bash
cp .env.example .env     # then fill in the values below
npm run dev              # http://localhost:3000
```

| Variable | What it is | Needed |
|---|---|---|
| `MONGO_URI` | MongoDB connection string | Yes |
| `SESSION_SECRET` | Secret that signs session cookies | Yes |
| `PORT` | Server port (default `3000`) | No |
| `PUBLIC_URL` | Public HTTPS address of the server. Needed for Claude on the web to connect over MCP; leave empty for local work | For MCP on the web |
| `ANTHROPIC_API_KEY` | Server-side key for Claude (people can also add their own in Settings) | For AI |
| `LLM_URL` | Endpoint of a local OpenAI-compatible model | For a local model |
| `ADMIN_EMAILS` | Who can open the admin pages | No |
| `GMAIL_ID`, `EMAIL_*` | Gmail OAuth, used to send sign-in verification codes | For sign-up emails |

For production, `npm start`. A `vercel.json` is included for Vercel.

**Put the editor in your own app.** It is on npm as [**`windcraft-editor`**](https://www.npmjs.com/package/windcraft-editor), with no backend and no build step. Save this as `index.html`, run `npx serve` next to it, and open the address it prints:

```html
<div id="root"></div>
<script type="module">
  import { startEditor } from "https://unpkg.com/windcraft-editor/editor/index.js";
  startEditor(document.getElementById("root"), {
    html: '<h1 class="p-10 text-4xl font-bold">Hello</h1>',
  });
</script>
```

Designs are saved in the browser. To use npm instead, save to your own server, or put the editor in just one part of a page, see the [full guide](packages/editor/README.md).

**Build the Figma plugin:**

```bash
npm run build -w @windcraft/figma
```

In **Figma desktop**: *Plugins → Development → Import plugin from manifest…* and choose `packages/figma/dist/manifest.json`. Or install the published plugin from the [Figma Community](https://www.figma.com/community/plugin/1697363010304569719).

**Connect Claude, Claude Code or Cursor:** see the [MCP guide](docs/mcp.md).

## How it is built

A monorepo of small packages around a Node app.

| Package | What it does |
|---|---|
| [`windcraft-editor`](packages/editor) | The visual editor (on npm): canvas, layers, Properties panel, code panel, pages. Host-agnostic. |
| [`@windcraft/core`](packages/core) | The Tailwind logic: class groups, property-to-class mapping, layout inference, board layout, themes. Pure functions with tests. Bundled into `windcraft-editor` when it is published. |
| [`@windcraft/figma`](packages/figma) | The Figma to Tailwind converter and plugin. Fixed rules, no LLM. |
| [`@windcraft/mcp`](packages/mcp) | The MCP protocol for Express, with nothing about what the tools do. |
| [`@windcraft/ai`](packages/ai) | Provider-neutral AI generation (Anthropic and OpenAI-compatible). |
| `src/` | The app: Express 5, Handlebars, MongoDB. Accounts, projects, the gallery, sharing, the MCP tools. |

**Stack:** Node.js · Express 5 · Handlebars · MongoDB (Mongoose) · Tailwind CSS · CodeMirror 6 · Anthropic SDK.

One thing worth knowing before you read `packages/editor/design/agent.js`: it runs inside the sandboxed canvas frame and cannot import anything, so the rest of the editor talks to it with messages. [CONTRIBUTING.md](CONTRIBUTING.md) has the repo map, and [docs/PROJECT.md](docs/PROJECT.md) describes how the editor's parts work.

```bash
npm test            # unit tests for core, editor, ai, mcp and the Figma converter
npm run typecheck   # tsc over the whole repo
```

## Status

Windcraft is under active development. Honest notes on where things stand:

- **Solid:** the Properties panel, the code panel, selection and layers, the Figma converter's basic rules, projects and sharing.
- **Newer:** dragging elements around (rearranging and device-scoped edits). It has been tried in Chrome only; Safari, Firefox and touch are untried ([#8](https://github.com/Tolaj/windcraft/issues/8)), and it has not been timed on very large pages ([#9](https://github.com/Tolaj/windcraft/issues/9)).
- **Known gaps:** see the [open bugs](https://github.com/Tolaj/windcraft/labels/bug) and the Roadmap below.

## Roadmap

- Figma converter: constraints, lists, image crop, and responsive output.
- Components and variants as first-class Windcraft components.
- A steadier drag in more browsers and on large pages (see [Contributing](#contributing)).

## Contributing

Windcraft is MIT licensed and open to everyone. You do not need to ask first.

**Where to start**

| If you like... | Try |
|---|---|
| Writing docs | [#7](https://github.com/Tolaj/windcraft/issues/7): update the README and document how dragging works |
| Testing, no code | [#8](https://github.com/Tolaj/windcraft/issues/8): try the drag in Safari, Firefox and on touch and report |
| Performance | [#9](https://github.com/Tolaj/windcraft/issues/9): time the drag on pages with hundreds of elements |
| Fixing a bug | [#10](https://github.com/Tolaj/windcraft/issues/10): a card dropped on a bigger card lands inside a small row; [#6](https://github.com/Tolaj/windcraft/issues/6): the W/H field shows a rounded size |
| Refactoring with tests | [#11](https://github.com/Tolaj/windcraft/issues/11): move the drop-target rules into `packages/core` |
| Something else | Browse [`good first issue`](https://github.com/Tolaj/windcraft/labels/good%20first%20issue) and [`help wanted`](https://github.com/Tolaj/windcraft/labels/help%20wanted) |

**How**
1. **Fork** the repo, `npm install`, and `npm run demo` to see your change.
2. **Branch** (`git switch -c fix/thing`) and make it. Keep the pull request small and about one thing.
3. **Check:** `npm test` and `npm run typecheck`. A bug fix in `packages/core` or the Figma converter should come with a test that fails without it.
4. **Open a pull request** into `main` and say what you changed and how you checked it.

A first-time pull request gets a reply and a decision with reasons, including when the answer is "not now". [CONTRIBUTING.md](CONTRIBUTING.md) has the setup, the repo layout and the project's principles (the output stays real HTML and Tailwind; the Figma converter uses fixed rules, no LLM).

**Questions, bugs, ideas:** [open an issue](https://github.com/Tolaj/windcraft/issues/new). Steps, what you expected, what happened and your browser; a screenshot or a short recording helps a lot.

## License

[MIT](LICENSE) © 2026 Swapnil Jadhav. Third-party code keeps its own licenses: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

<div align="center">
<br>
<sub>Built by <a href="https://github.com/Tolaj">Swapnil Jadhav</a>.</sub>
</div>
