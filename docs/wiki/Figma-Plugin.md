# Figma Plugin

A free Figma plugin that turns a selection into HTML and Tailwind **on your computer**. No LLM, no network, no picture fallback: Figma's properties are mapped to Tailwind with fixed rules.

## Install

- **From Figma:** install it from the [Figma Community](https://www.figma.com/community/plugin/1697363010304569719).
- **From source:**

```bash
npm run build -w @windcraft/figma
```

In **Figma desktop**: *Plugins → Development → Import plugin from manifest…* and choose `packages/figma/dist/manifest.json`.

## What it converts

| Figma | Becomes |
|---|---|
| Auto Layout frame | `flex flex-row/col`, `gap`, padding, `justify-*`, `items-*`, wrap, fill / hug / fixed sizes |
| Frame or group without Auto Layout | A `relative` box with each child at its exact place (`absolute left-* top-*`) |
| Fills, strokes, corner radius, opacity | `bg-[#hex]` (or a gradient), `border`, `rounded-*`, `opacity-*` |
| Shadows and blurs | `shadow-[...]`, `blur-[...]`, `backdrop-blur-[...]` |
| Text | `<p>` with size, weight, family, colour, spacing, alignment; mixed styles become `<span>`s |
| Vectors | Inline SVG |
| Pictures | `<img>`, or a background on a frame |
| Rotation | `rotate-[Ndeg]` |

Layers named like a button, link, nav bar, header or footer become real elements (`<button>`, `<a>`, `<nav>`...). A frame without Auto Layout whose children fill a matrix of equal cells becomes a `grid`. The plugin lists anything it could not carry over as warnings.

The full table, the known gaps and the plan are in [`packages/figma/README.md`](https://github.com/Tolaj/windcraft/blob/main/packages/figma/README.md).

## Why no LLM

Fixed rules keep the output editable and predictable: the same design gives the same HTML every time, and a picture of the design is never the fallback.

## Helping make it better

Try it on your own designs and [open an issue](https://github.com/Tolaj/windcraft/issues/new) with the frame (or a screenshot) and what came out wrong. The more different the files, the better. See [Contributing and Reviews](Contributing-and-Reviews).
