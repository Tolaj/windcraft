# Self-Hosting

Run the full app (accounts, projects, the gallery, sharing, AI and MCP) on your own machine or server. You need **Node.js 18+** and a **MongoDB** database (local or Atlas).

```bash
git clone https://github.com/Tolaj/windcraft.git
cd windcraft
npm install
cp .env.example .env     # then fill in the values below
npm run dev              # http://localhost:3000
```

For production, `npm start`. A `vercel.json` is included for Vercel.

## Environment variables

| Variable | What it is | Needed |
|---|---|---|
| `MONGO_URI` | MongoDB connection string | Yes |
| `SESSION_SECRET` | Secret that signs session cookies | Yes |
| `PORT` | Server port (default `3000`) | No |
| `PUBLIC_URL` | Public HTTPS address of the server. Needed for Claude on the web to connect over MCP; leave empty for local work | For MCP on the web |
| `ANTHROPIC_API_KEY` | Server-side key for Claude (people can also add their own in Settings) | For AI |
| `LLM_URL` | Endpoint of a local OpenAI-compatible model (Ollama, LM Studio, vLLM) | For a local model |
| `ADMIN_EMAILS` | Who can open the admin pages | No |
| `GMAIL_ID`, `EMAIL_*` | Gmail OAuth, used to send sign-in verification codes | For sign-up emails |

## Without a database

If you only want the editor, `npm run demo` needs no database: <http://localhost:4000/editor/demo/>. See [Getting Started](Getting-Started).

## Connecting AI tools

Set `PUBLIC_URL`, then follow [MCP Server](MCP-Server). Claude on the web needs a public HTTPS address; Claude Code and Cursor can use a token from the app's Connect page.
