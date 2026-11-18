# MCP Server

Windcraft runs an [MCP](https://modelcontextprotocol.io) server, so your AI tools can read your design system and save pages into your projects. The server address is your Windcraft address plus `/mcp`:

```
https://your-windcraft-address/mcp          e.g. https://windcraft.swapniljadhav.com/mcp
```

**Claude on the web (claude.ai): no token**
1. Open **Settings → Connectors → Add custom connector**.
2. Paste the address above and press **Connect**.
3. Sign in to Windcraft and press **Allow**.
4. Ask Claude: *"Use my Windcraft projects to build a pricing page."*

**Claude Code: with an access token**
1. In Windcraft open the **Connect** page (`/connect`), choose **Claude Code** and create an access token. It is shown once.
2. Put it in your shell profile: `export TAILWIND_LIBRARY_TOKEN=<your token>`
3. Add the server:

```bash
claude mcp add --transport http tailwind-library https://your-windcraft-address/mcp \
  --header "Authorization: Bearer ${TAILWIND_LIBRARY_TOKEN}"
```

**Cursor: one click.** On the **Connect** page choose **Cursor** and press **Add to Cursor**. Cursor asks before it adds the server; set your access token in the environment variable shown there.

**ChatGPT: sign in, no token.** In ChatGPT open Settings, Connectors, Advanced and switch on Developer mode. Create a connector with the address above, choose OAuth, sign in to Windcraft and press **Allow**. ChatGPT reads your designs with the `search` and `fetch` tools. This needs a public HTTPS address and a ChatGPT plan that offers custom connectors; the menu names change from time to time.

**Cursor and any other MCP client, by hand:** add an HTTP (streamable) server with the address above and the header `Authorization: Bearer <your token>`:

```json
{
  "mcpServers": {
    "windcraft": {
      "type": "http",
      "url": "https://your-windcraft-address/mcp",
      "headers": { "Authorization": "Bearer ${TAILWIND_LIBRARY_TOKEN}" }
    }
  }
}
```

The **Connect** page has a **Run test** button that checks the connection and says what to fix. Running it yourself? Claude on the web needs a public HTTPS address, so set `PUBLIC_URL` (see [Self-Hosting](Self-Hosting)). The tools include `get_design_guide`, `search_components`, `get_component`, `save_design`, `save_pages` and `apply_design_patch`.

## What to ask

| You say | Tools used |
|---|---|
| "Read my design guide, then build a settings page that matches." | `get_design_guide` |
| "Search my library for a pricing table and use it." | `search_components`, `get_component` |
| "Save this page to my Windcraft library." | `save_design` |
| "Save these three screens as pages in a project called Acme website." | `create_project`, `save_pages` |
| "Save this as a reusable component called Pricing card." | `save_component` |
| "Make the Contact button in my Pricing page rose-500. Change nothing else." | `get_design_spec`, `apply_design_patch` |
| "Which project am I working on? Switch to Acme." | `get_context`, `set_active_project` |
| "Write down the brand rules for this project: friendly tone, indigo, rounded." | `update_project` |
| "List my projects." / "What tags do I use?" | `list_projects`, `list_tags` |
| "Save this page, then look at it on a phone and fix anything that looks off." | `save_design`, `render_design`, `apply_design_patch` |

## Prompts and resources

The server also offers **prompts**: ready-made commands your client shows when you type `/` (Claude, Cursor and others).

| Prompt | What it does |
|---|---|
| `build-page` | Designs a new page that matches your project, saves it and looks at the result |
| `restyle-to-my-guide` | Brings a saved design in line with your design guide with small patches |
| `audit-design` | Checks a design for contrast, headings, labels, tap targets and the phone layout; fixes it if you say so |
| `make-variations` | Saves two to four alternatives next to the original |
| `new-section` | Designs one section (hero, pricing, FAQ) that fits an existing page |

And **resources**, which you can attach to a chat without a tool call: `windcraft://design-guide`, `windcraft://context` (the active project), `windcraft://projects`, `windcraft://project/{id}` (a project's pages), `windcraft://theme/{id}` (its Tailwind config) and `windcraft://component/{id}` (a design's HTML).

## Letting the AI see its work: `render_design`

`render_design` returns a screenshot of a saved design, or of HTML that has not been saved yet, drawn with the project's theme. It makes the loop "write, look, fix" possible. It needs a browser on the machine that runs Windcraft, so a server must be set up for it:

| Where Windcraft runs | Setup |
|---|---|
| Your own computer or a server with Chrome | Nothing, it finds Chrome. Set `RENDER_CHROME_PATH` for a different one. |
| A hosted browser service | Set `RENDER_BROWSER_WS` to its DevTools address. |
| A serverless host such as Vercel | Nothing: `playwright-core` and `@sparticuz/chromium` are dependencies and Windcraft's `vercel.json` bundles the browser. The first screenshot after a quiet spell takes a few seconds while the browser starts. |

Each person can take 20 screenshots per 10 minutes (set `RENDER_LIMIT` to change it), so an AI stuck in a loop cannot run up a host's bill. The **Run test** button on the Connect page has a *Screenshots* row that starts the browser and says what is wrong if it cannot. That row is optional and never turns the result red. Without a browser the tool says so and everything else works. The page runs in a fresh browser context and cannot reach localhost, private networks or cloud metadata addresses.

Every save also returns a `url` to the design in Windcraft, so the AI can give you the link.

## Seeing and undoing what an AI did

Giving an AI write access is easier when you can see what it did and take it back.

- **History marks AI changes.** In a project, **History** shows a small *Edited by Claude* (or Cursor, or *Access token*) badge on each version an AI made. The client's name comes from the app that you allowed in Windcraft.
- **Recent AI activity.** The Connect page lists the last ten things connected tools did ("Claude changed Pricing, 4 min ago") with a link to each design and an **Undo** button. Entries are kept for 30 days.
- **Undo** puts the design back to what it was before that change and only while the design is still as the AI left it. If you edited it since, there is no Undo, so it can never wipe your own work. The AI's version stays in the history, so an undo can be undone.
- **`revert_design`** lets the AI undo itself: with only an id it takes back the latest change, but only an AI's (never your own edit). Pass `version` to go back to a specific version, and `baseVersion` so a stale view cannot undo the wrong thing.

## Tools

| Tool | What it does |
|---|---|
| `get_design_guide` | Your design tokens, conventions and an index of every component. Read first. |
| `get_context` | The active project: its brief and the pages already designed. Read first in a new chat. |
| `search_components`, `get_component` | Find components by keyword or tag; get one's code (HTML, or React, Vue, Svelte). |
| `save_design`, `save_pages`, `save_component` | Save one screen, several screens in one project, or a reusable component. Each takes an optional gallery `category` (a slug such as `ui-alerts`, checked against the app's list) and, for one design, a board `group`. |
| `get_design_spec`, `apply_design_patch` | Read a saved design as JSON with element ids; change it with small operations instead of rewriting it. |
| `list_projects`, `create_project`, `get_project`, `set_active_project`, `update_project` | Work with projects (groups of pages). |
| `arrange_project` | Tidy the board: groups every design by its title ("Sidebars 04 · ..." goes in "Sidebars"), clears hand-placed positions and lets the board lay out each group as wrapped rows. Run it after saving many designs. |
| `render_design` | A screenshot of a design, so the AI can check and fix its own work. |
| `revert_design` | Undo the latest AI change to a design, or go back to a named version. |
| `search`, `fetch` | The same as `search_components` and `get_component`, in the shape ChatGPT's connectors expect. |
| `list_tags` | Every tag in your library with counts. |

