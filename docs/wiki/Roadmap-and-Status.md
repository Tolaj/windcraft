# Roadmap and Status

## Where things stand

- **Solid:** the Properties panel, the code panel and its HTML, CSS and JS tabs, selection and layers, the Figma converter's basic rules, projects and sharing.
- **Also in place:** the AI connector (Claude, Claude Code, Cursor and ChatGPT: tools, prompts, resources, screenshots, and seeing and undoing what an AI did), the community page for published projects, and adding layouts and published designs from the gallery in the editor. These have been tried in Chrome only.
- **Newer:** Interactions (with one-click Tabs and Modal), animations, the Tailwind config tab, and dragging to rearrange. They have been tried in Chrome only. Safari, Firefox and touch are untried, and big pages have not been timed.
- **Known limits:**
  - Interactions run in Interact, Preview and the saved page, not while you edit. A standalone export has no other frames, so **Go to frame** does nothing there.
  - **Show or hide** works with Tailwind's `hidden` class. An element hidden by `w-0`, `h-0` or `opacity-0` needs **Change classes of** (the panel says so).
  - Esc is not available as a trigger: the editor and the Preview player both use it to leave.
  - The tab you click does not change its own look unless you give it an "Active" look when you make the tabs.

## Next

- The AI connector: bulk jobs in one call (apply a theme to a whole project, make every page match the guide), a Claude Code plugin and a desktop extension, and directory listings.
- Screenshots on Vercel have not been timed in production yet.
- Figma converter: constraints, lists, image crop, and responsive output.
- Components and variants as first-class Windcraft components.
- A steadier drag in more browsers and on large pages.

## Where you can help

Try the editor in a browser other than Chrome, or on a touch screen, and report what you find. Or pick something from **Next** above, open an issue to say you are on it, and see [Contributing and Reviews](Contributing-and-Reviews).
