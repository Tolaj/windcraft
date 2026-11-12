# Getting Started

Pick the way in that fits what you want to do.

| I want to... | Use |
|---|---|
| Try it now, nothing to install | The live editor: <https://windcraft.swapniljadhav.com/> |
| Put the editor in my own site or app | `npm install windcraft-editor`, see [Embedding the Editor (npm)](Embedding-the-Editor-npm) |
| Let Claude, Claude Code or Cursor build and save pages | The MCP server, see [MCP Server](MCP-Server) |
| Turn a Figma design into HTML and Tailwind | The plugin, see [Figma Plugin](Figma-Plugin) |
| Run my own copy with accounts, projects and AI | See [Self-Hosting](Self-Hosting) |
| Work on the editor itself | The demo below |

## Run the editor locally (no database)

You need Node.js 18 or newer.

```bash
git clone https://github.com/Tolaj/windcraft.git
cd windcraft
npm install
npm run demo
```

Open <http://localhost:4000/editor/demo/>. Add `?theme` to the address to see a project theme applied.

## Your first five minutes

1. **Click** an element: the Properties panel shows its Tailwind values and the code panel highlights its exact source.
2. **Change a value**, for example padding. The class changes (`p-4` becomes `p-6`).
3. **Drag** the element to another place. See [Using the Editor](Using-the-Editor) for how dragging works.
4. **Switch to Tablet or Mobile** and edit again: the change lands in the right breakpoint (`md:`).
5. **Open the code panel** and edit the HTML: the design follows. Undo covers both. Its other tabs hold your CSS, your scripts and your Tailwind config.
6. **Make it respond.** Select a button, open **Interactions** in the panel, and say what it does when clicked: show a menu, change classes, go to another frame. Try it with the Interact tool (`P`).
7. **Press Preview** (the play button) to click through the saved frames.
