# Contributing and Reviews

Windcraft is MIT licensed and open to everyone. You do not need to ask first.

## Where to start

- A [`good first issue`](https://github.com/Tolaj/windcraft/labels/good%20first%20issue) or a [`help wanted`](https://github.com/Tolaj/windcraft/labels/help%20wanted) issue.
- Testing needs no code: try the editor in another browser and report ([#8](https://github.com/Tolaj/windcraft/issues/8)).
- Docs are code too: fix anything that is wrong or missing, on this wiki (the pages live in [`docs/wiki`](https://github.com/Tolaj/windcraft/tree/main/docs/wiki)) or in the README.

## How to contribute

1. **Fork** the repo, `npm install`, and `npm run demo` to see your change.
2. **Branch** (`git switch -c fix/thing`) and make your change. Keep it small and about one thing.
3. **Check** with `npm test` and `npm run typecheck`. A bug fix in `packages/core` or the Figma converter should come with a test that fails without the fix.
4. **Open a pull request** into `main`. Say what you changed and how you checked it. A screenshot or short recording helps for anything visual.

The project's principles ([CONTRIBUTING.md](https://github.com/Tolaj/windcraft/blob/main/CONTRIBUTING.md)): the output stays real HTML and Tailwind classes, and the Figma converter uses fixed rules (no LLM, no picture fallback).

AI-assisted pull requests are welcome. You are still the author: run the change yourself and say how you checked it.

## Reporting a bug

Open an issue with the steps, what you expected, what happened and your browser. A screenshot or short recording helps a lot.

## How pull requests are reviewed

Maintainers review in their own time. Here is what to expect, so nothing is a surprise.

1. **Acknowledged** in the thread.
2. **Checked by a maintainer**: the problem is reproduced, the change is tried locally with the tests and the type check, and it is read against the guidelines above.
3. **A decision:**
   - **Merged**, with what was checked. Your authorship is kept.
   - **Changes requested**: one clear thing to change.
   - **Not merged**: the reason (scope, a conflict with the guidelines, a duplicate) and what would make it mergeable. You are welcome to send a smaller version.
   - **Needs more information**: what is missing. Inactive threads may be closed after a few weeks and can be reopened.
4. **Afterwards**: the linked issue is closed, and anything left over becomes a new issue, so nothing stays in someone's head.

## Issues

Labels in use: `bug`, `enhancement`, `documentation`, `good first issue`, `help wanted`, `question`. Each issue should say what to do and what "done" looks like.
