# Using the Editor

## Selecting

| Do | What happens |
|---|---|
| Click | Picks the top box of the design |
| Double-click | Goes one level in (double-click text to edit it) |
| Cmd or Ctrl and click | Picks the deepest element under the pointer |
| Enter / Shift+Enter | Into the selected box / back out to what holds it |
| Cmd or Ctrl and A | Selects the page's elements, or the selected element's siblings |

A selected box shows what it holds as dashed outlines.

## Dragging

**Inside its own box** an element follows your pointer to the pixel and the page shows the layout the drop will make: the element is put in the new slot, the boxes around it re-flow (a card that grows to fill its row takes its new width, a wrapping row wraps anew) and a blue outline marks where it will land. Guides and red distances show spacing.

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

The code panel shows the selected element's source. Edit the HTML and the canvas follows; edit the canvas and the code follows. Undo and redo cover both.
