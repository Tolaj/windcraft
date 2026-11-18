# @windcraft/mcp

The [MCP](https://modelcontextprotocol.io) protocol for an Express app, with nothing about what the tools do. Windcraft's own tools are in `src/mcp`.

```js
import { createMcpRouter, text, fail, image } from "@windcraft/mcp";

app.use("/mcp", createMcpRouter({
    serverInfo: { name: "my-app", version: "1.0.0" },
    instructions: async (ctx) => "What this server is for, read when a client connects.",
    tools: [{ name: "hello", description: "Says hello", inputSchema: { type: "object", properties: {} }, readOnly: true }],
    callTool: async (ctx, name, args, req) => text("hello"),   // text(...), fail(...) or image(base64, mimeType, caption)
    authenticate: async (req) => userIdOrNull,                  // a Bearer token; the result is `ctx`
    challenge: (req) => 'Bearer resource_metadata="https://my-app/.well-known/oauth-protected-resource"',
    resources: { list, templates, read },                       // optional
    prompts: { list, get },                                     // optional
}));
```

- **Stateless:** POST only, no sessions. Authentication is a Bearer token, never cookies, so browser-based clients may call it from any origin.
- **Tools** carry `title`, `readOnly` and `destructive` hints that clients use in their permission screens.
- **Resources** (optional): `list(ctx, req)` gives `{ uri, name, description?, mimeType? }`, `templates` are `{ uriTemplate, name }`, and `read(ctx, uri, req)` gives `{ text, mimeType }` or `null` when there is none.
- **Prompts** (optional): `list(ctx)` gives `{ name, title?, description?, arguments? }` and `get(ctx, name, args, req)` gives `{ description, messages }`. Throw an error with `invalid: true` for a missing argument and the client sees an "invalid params" answer.
- Resources and prompts are announced to a client only when you pass them.
- Protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`.

Tests: `node --test packages/mcp/test/`.
