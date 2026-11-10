[← Back to the README](../README.md)

# Connect Claude, Claude Code or Cursor (MCP)

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

**Cursor and any other MCP client:** add an HTTP (streamable) server with the address above and the header `Authorization: Bearer <your token>`:

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

The **Connect** page has a **Run test** button that checks the connection and says what to fix. Running it yourself? Claude on the web needs a public HTTPS address, so set `PUBLIC_URL` (see [Run the full app](../README.md#run-the-full-app)). The tools include `get_design_guide`, `search_components`, `get_component`, `save_design`, `save_pages` and `apply_design_patch`.

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

## Tools

| Tool | What it does |
|---|---|
| `get_design_guide` | Your design tokens, conventions and an index of every component. Read first. |
| `get_context` | The active project: its brief and the pages already designed. Read first in a new chat. |
| `search_components`, `get_component` | Find components by keyword or tag; get one's code (HTML, or React, Vue, Svelte). |
| `save_design`, `save_pages`, `save_component` | Save one screen, several screens in one project, or a reusable component. |
| `get_design_spec`, `apply_design_patch` | Read a saved design as JSON with element ids; change it with small operations instead of rewriting it. |
| `list_projects`, `create_project`, `get_project`, `set_active_project`, `update_project` | Work with projects (groups of pages). |
| `list_tags` | Every tag in your library with counts. |

