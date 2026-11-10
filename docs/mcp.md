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
