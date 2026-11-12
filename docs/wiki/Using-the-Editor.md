# Using the Editor

## Selecting

| Do | What happens |
|---|---|
| Click | Picks the top box of the design |
| Double-click | Goes one level in (double-click text to edit it) |
| Cmd or Ctrl and click | Picks the deepest element under the pointer |
| Enter / Shift+Enter | Into the selected box / back out to what holds it |
| Cmd or Ctrl and A | Selects the frame's elements, or the selected element's siblings |

A selected box shows what it holds as dashed outlines.

## Dragging

**Inside its own box** an element follows your pointer to the pixel and the frame shows the layout the drop will make: the element is put in the new slot, the boxes around it re-flow (a card that grows to fill its row takes its new width, a wrapping row wraps anew) and a blue outline marks where it will land. Guides and red distances show spacing.

**Out of its box**, a copy follows your pointer and the element sits where the drop would land, with a label that names it ("Into div · Row · 3rd of 3"). Press **Tab** to try the next placement and **Esc** to cancel. An element keeps its own size when its new row would stretch it.

Coming back into its own box hands the drag back to the first.

| Key | Effect |
|---|---|
| Alt and drag | Place the element freely: it becomes absolute at the spot you drop it |
| Cmd while dragging | Turn snapping off |
| Esc | Cancel the drag; everything goes back as it was |
| Tab (while the copy follows) | Try the next placement |

**What a drop writes.** Moving an element to another slot or box changes the markup, which is the same for every screen size. So what it writes (the spacing of its new neighbours) is for every size, and what its old place gave it (margins, auto margins, `self-*`, exact offsets) comes off at every size.

## Which screen size an edit is for

Dragging, resizing and moving are written for the device you are editing: **Mobile** is the plain class, **Tablet** is `md:` and **Desktop** is `lg:`. A small bar offers **this size and up**, **only this size** or **all sizes**, and your choice sticks. If you pick a Screen chip (`sm` to `2xl`) or a state (`hover`, `focus`) in the Properties panel, edits go there instead.

## Handles

- **Gap handles:** with a flex row, flex column or grid selected, each gap between its children is a handle. Drag it to change `gap-*` on the Tailwind scale.
- **Padding handles:** a selected box shows its padding as four handles. Alt changes both sides of the axis (`px-*` or `py-*`).
- **Resize snap:** a width or height within 6px of a neighbour's snaps to it, with a label ("Same width as a neighbour").
- **Radius dots and rotation** are on the selected element's corners.

## Properties panel

Every field is a Tailwind class, edited where it lives. Values snap to the scale: `16px` becomes `p-4`; an off-scale value becomes `rounded-[10px]`. Select several elements, change one field, and it is one undo. A value that came from the page's own CSS stays CSS.

## Code and design stay in step

## Frames

A **frame** is one design on the canvas, like a frame in Figma: a landing page, an app screen, or a piece of one. The **Frames** list on the left has every frame of the project; **+** adds one and the pencil opens its **Frame details**.

- **Size:** pick Desktop (1280), Tablet or Mobile, or type a width. Leave the height empty and the frame follows its content, or set one to show just the top of a long page.
- **Details:** name, category, tags, description, project, and two switches. **This is a page** (on) or a component (off): a page is a screen of your project, so Preview plays it and its parts are saved as components; a component is a reusable piece. **Public in the gallery** (on) or private (off).
- **With no element selected** the panel shows the frame's own settings and its body styling (**Frame styling**).

## The code panel

Open it with the code button. Its tabs split the design into parts, and a dock button moves the panel beside the design or below it.

| Tab | What it holds |
|---|---|
| **HTML** | The markup, the links, and anything that is not your own CSS or script (the Tailwind script and the editor's own scripts). |
| **CSS** | Your own `<style>` blocks. |
| **JS** | Your own inline scripts. A syntax error is named with its line and marked with a red dot on the tab. Scripts run in Interact, Preview and the saved page, not on the editing canvas. |
| **Config** | The project's Tailwind config (below). |

**Find**, **Format** (Prettier, one undo step) and **Copy** work on the tab you are on.

## Your Tailwind config

The **Config** tab edits the project's Tailwind file, and it applies as you type: `tailwind.config.js` for Tailwind 3, or `global.css` for Tailwind 4. Every frame in the project uses it.

- **Plugins:** name them the usual way (`require("@tailwindcss/typography")`). Official plugins come with the Tailwind CDN, other packages are looked up and loaded for you, and one that needs a build is marked red with the reason. The **i** button shows how to add an official plugin, one from npm, or your own.
- **Default values** shows what your file changes next to Tailwind's defaults.
- A frame made before the project had one file may have a file of its own laid over the project's. The Config tab links to it ("This frame also has its own file: edit it").
- The same file is on the project page's **Config** tab.

## Interactions

Select an element and open **Interactions** in the Properties panel. A rule reads like a sentence:

| Part | Choices |
|---|---|
| **When** | Clicked, Hovered, Frame loads, Backdrop clicked (a click on the element itself, not on what is inside it) |
| **Do** | Show or hide, Show, Hide, Scroll to, Copy text of, Change classes of, Go to frame |
| **On** | An element, chosen from the frame's layers or picked with the ⌖ button and a click on the canvas. It is given an id if it has none. |

- **Show or hide** uses Tailwind's `hidden` class. Tick **starts hidden** to have the element closed when the frame opens.
- **Change classes of** has **Add**, **Remove** and **Toggle** boxes. Type a class, press Enter, or take a suggestion. A drawer menu is two rules: the open button adds `max-md:w-full` and removes `max-md:w-0`, and the close button does the reverse.
- **Go to frame** opens another frame in Preview, in a shared prototype, and in Interact.
- **The canvas** outlines the element a selected trigger acts on, with an arrow when there is room.
- **The wand** beside **+** sets up **Tabs** (the selected element's children are the tab buttons; you choose the element holding the panels; optionally give the active tab a look) or **A modal** (the selected element opens it; you choose the modal and its close button).

Rules run in **Interact** (the arrow-with-a-click tool, `P`), in **Preview**, and in the saved page. They do not run while you edit. In Interact, `Esc` or `V` goes back to editing.

A rule is one attribute on the element (`data-wc-do`) and the page carries one small script. See [Architecture](Architecture).

## Animations

The **Animation** section has a **+** that opens the library: a grid of presets in groups (Entrances, Attention, Exits, Loops, Hover, Scroll, Effects), each moving in its card.

- **Pick one**, set its time, delay, repeat, direction, easing and when it plays (when the frame shows, hovered, focused, scrolled into view, clicked, or following the scroll), then **Add and use**. The keyframes go into the project's Tailwind config like any animation, and **Respect reduced motion** adds `motion-reduce:animate-none`.
- **Create your own** is a keyframe editor: stops from 0 to 100%, with opacity, move, scale, rotate, skew, filters and any CSS property at each stop. Any preset opens in it with **Customise…**.
- **Children, one after another** animates every child of a container with a gap between them.
- **Text effects** make a heading's letters or words arrive one after another, or type it out. **Draw the lines** draws an SVG's paths in turn.

The editor shows frames at rest. Press **Preview the animation** to see one run for a few seconds, or use Interact. If your computer asks for reduced motion, animations that respect it stay still.

## Interact and Preview

- **Interact** (`P`) runs the frame as it would on the device: hover, click, type and scroll, with its scripts and interactions.
- **Preview** (the play button) opens the saved prototype in its own tab and plays every frame on the canvas, one at a time, in order. It leaves out the parts the editor makes automatically when you save a page. It shows the saved version, so it offers to save first.

The code panel shows the selected element's source. Edit the HTML and the canvas follows; edit the canvas and the code follows. Undo and redo cover both.
