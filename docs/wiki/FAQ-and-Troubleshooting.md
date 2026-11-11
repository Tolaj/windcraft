# FAQ and Troubleshooting

## The editor

**Why did dragging write `md:` or `lg:` classes?**
Dragging, resizing and moving are written for the device you are editing (Mobile plain, Tablet `md:`, Desktop `lg:`). Use the bar that appears after the edit to choose "all sizes" or "only this size". Moving an element to another box is for every size.

**My element has `relative left-[...] top-[...]` after I dragged it.**
That is a free placement (Alt-drag, or a drop in open space inside its box). Drag it to another slot and the offsets come off.

**I pressed Esc and something stayed.**
Esc cancels a drag in progress and puts everything back. Once you let go, use undo.

**A value I typed in the panel stayed as CSS, not a class.**
A value that came from the page's own CSS stays CSS; only values that came from a class (or from a new Tailwind element) become classes.

## The npm package

**My designs vanish between visits.**
`startEditor` keeps designs in the browser (localStorage). Give each editor its own `key`, or use `mountEditor` with a host to save on your server. See [Embedding the Editor (npm)](Embedding-the-Editor-npm).

## The MCP server

**Claude on the web cannot connect to my copy.**
It needs a public HTTPS address. Set `PUBLIC_URL` and see [Self-Hosting](Self-Hosting). The Connect page has a **Run test** button that checks the connection and says what to fix.

**Claude Code says the server is unauthorised.**
Create an access token on the Connect page (it is shown once) and use it in the `Authorization: Bearer` header. See [MCP Server](MCP-Server).

## Running it

**Which ports?**
`npm run demo` is on 4000 (`/editor/demo/`), `npm run dev` is on 3000.

**It does not work in my browser.**
The drag has been tried in Chrome; Safari, Firefox and touch are untried. Please [open an issue](https://github.com/Tolaj/windcraft/issues/new) or add to [#8](https://github.com/Tolaj/windcraft/issues/8).
