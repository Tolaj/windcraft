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

## Interactions, animations and Preview

**My button does nothing when I click it in the editor.**
Rules do not run while you edit. Switch to **Interact** (`P`) or press **Preview**. They also run in the saved page.

**Show or hide does nothing on my menu.**
Show or hide only adds or removes Tailwind's `hidden` class. If the menu is hidden some other way (a drawer with `max-md:w-0`, or `opacity-0`), there is nothing for it to reveal. Use **Change classes of** instead: add the class that opens it and remove the one that closes it. The panel shows a note and a **Switch to Change classes** button when it spots this.

**My menu vanished and never comes back.**
**starts hidden** puts `hidden` on the element when the frame opens. If the rule that shows it was changed to **Change classes of** or removed, the editor clears the mark. If you still see it, remove `data-wc-start="hidden"` from the element in the HTML tab.

**Esc does not close my modal.**
The editor and the Preview player both use Esc to leave Interact and Preview, so a rule cannot use it. A modal closes from its close button or a click on its backdrop.

**Go to frame does nothing in my exported page.**
An export holds one page, so there is no other frame to open. It works in Interact, in Preview and in a shared prototype.

**An element has an `id` I did not add.**
An element a rule acts on gets an id (`div-1`, `nav-2`) so the rule can find it.

**A frame is missing from Preview.**
Preview plays what is on the canvas and leaves out the parts the editor makes automatically when you save a page. Open the frame's **Frame details** and check the **This is a page** switch. It shows the saved version, so save first.

**My animation does not play in the editor.**
The editor shows frames at rest. Press **Preview the animation** in the panel, use Interact, or open Preview. If your computer asks for reduced motion, animations set to respect it stay still.

**My Tailwind config shows a red line.**
A plugin that needs a build cannot run in a page, so it is marked red with the reason and the rest still applies. See [Using the Editor](Using-the-Editor).

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
The drag has been tried in Chrome; Safari, Firefox and touch are untried. Please [open an issue](https://github.com/Tolaj/windcraft/issues/new) and say which browser.
