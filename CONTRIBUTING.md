# Contributing to Windcraft

Thanks for helping. Issues, ideas and pull requests are all welcome.

## Set up

You need Node.js 18+.

```bash
git clone https://github.com/Tolaj/windcraft.git
cd windcraft
npm install
npm run demo        # the editor with no database: http://localhost:4000/editor/demo/
```

The full app (accounts, projects, gallery, MCP) also needs MongoDB. Copy `.env.example` to `.env`, fill it in, then `npm run dev`.

## Where things live

| Path | What is there |
|---|---|
| `packages/editor` | The visual editor. `design/agent.js` runs inside the sandboxed canvas frame (it cannot import anything); the rest runs in the host page. |
| `packages/core` | Tailwind logic: class groups, property-to-class mapping, board layout. Pure functions. |
| `packages/figma` | Figma to Tailwind converter and plugin. |
| `packages/mcp`, `packages/ai` | MCP protocol and AI providers. |
| `src` | The Express + Handlebars + MongoDB app. |

## Before you open a pull request

```bash
npm test
npm run typecheck
```

Both should pass. If you fix a bug in `packages/core` or the Figma converter, add a test that fails without your fix.

## Guidelines

- Keep the output as real HTML and Tailwind classes. Nothing Windcraft-only should end up in a user's design.
- The Figma converter uses fixed rules: no LLM, and no picture fallback.
- Keep pull requests small and about one thing. Describe what you changed and how you checked it.
- By contributing you agree that your work is released under the [MIT License](LICENSE).

## AI-assisted pull requests

Welcome. You are still the author: run the change yourself, and say in the pull request how you checked it. If you could not run the tests or try it in the editor, say so.

## How pull requests are reviewed

See [Contributing and Reviews](https://github.com/Tolaj/windcraft/wiki/Contributing-and-Reviews) on the wiki: what a maintainer checks, the possible decisions and what happens afterwards.

## Reporting bugs

Open an issue (there is a form for it) with the steps, what you expected, what happened, and your browser. A screenshot or a short screen recording helps a lot.

## Releasing (maintainers)

Only `windcraft-editor` is published to npm. `scripts/build-npm.mjs` assembles it into `dist/npm` with `editor/` and `core/` side by side, which is the repo's own layout, so the editor's relative imports (`../../core/...`) work unchanged.

1. Bump `version` in `packages/editor/package.json` and make sure `npm test` passes.
2. Build and check: `npm run build:npm && npm pack --dry-run ./dist/npm`.
3. Publish: `npm publish ./dist/npm` (npm may ask for a one-time code or hold the release for approval on npmjs.com).
4. Tag it: `git tag vX.Y.Z && git push origin vX.Y.Z`, and create a GitHub release.
