// Ready-made 3D sections for the editor's "3D templates" dialog. Each is plain HTML (a section with a <wc-model> in it) that uses only the model's own
// attributes: nothing here is special once it is on the page, so everything can be edited like any other element. They use free models that need no
// credit line (CC0), so a template can be published as it is.
import { modelMarkup, storyMarkup, sampleUrl, SAMPLE_MODELS } from "./model3d.js";

const free = (id) => sampleUrl(SAMPLE_MODELS.find((m) => m.id === id));
// attributes of the tag that modelMarkup does not write (its id, effects, placement)
const withAttrs = (html, extra) => html.replace("<wc-model ", `<wc-model ${extra} `);
const withId = (html, id) => withAttrs(html, `id="${id}"`);
const btn = "inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white";

/** The templates: { id, name, about, tags (what it does, for the chips on its card), html }. */
export const TEMPLATES_3D = Object.freeze([
    {
        id: "scroll-story", name: "3D scroll story", about: "The model stays on screen while you scroll; it turns and moves closer for each section.", tags: ["Scroll"],
        html: storyMarkup(),
    },
    {
        id: "product-hero", name: "Product hero", about: "A headline beside a model that turns slowly and leans toward the pointer.", tags: ["Turns on its own", "Follows the mouse"],
        html: `<section class="grid min-h-screen items-center gap-8 bg-neutral-50 px-8 py-16 md:grid-cols-2 md:px-16">` +
            `<div class="max-w-lg"><p class="text-sm font-medium uppercase tracking-widest text-neutral-500">New</p><h1 class="mt-3 text-5xl font-semibold tracking-tight text-neutral-900">Made to be seen from every side</h1><p class="mt-4 text-lg text-neutral-600">Describe what you are selling in a sentence or two. The model turns on its own and leans toward the pointer.</p><a href="#" class="${btn} mt-8">Shop now</a></div>` +
            withAttrs(modelMarkup({ src: free("ClearCoatCarPaint"), "auto-rotate": true, shadow: true }, "block h-[420px] w-full md:h-[560px]"), 'data-wc-fx="tilt-mouse:15"') +
            `</section>`,
    },
    {
        id: "colour-swatches", name: "Colour swatches", about: "Round swatches under the model: a click repaints it.", tags: ["Click"],
        html: `<section class="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-8 py-16 text-center">` +
            `<h2 class="text-4xl font-semibold tracking-tight text-neutral-900">Pick your colour</h2>` +
            withId(modelMarkup({ src: free("ClearCoatCarPaint"), controls: true, shadow: true }, "block h-[380px] w-full max-w-xl"), "swatch-model") +
            `<div class="flex gap-3">` +
            [["#e11d48", "Red"], ["#2563eb", "Blue"], ["#16a34a", "Green"], ["#171717", "Black"]].map(([c, n]) => `<button type="button" aria-label="${n}" data-wc-for="swatch-model" data-wc-act="color ${c}" style="background-color:${c}" class="h-10 w-10 rounded-full border-2 border-white shadow ring-1 ring-neutral-300"></button>`).join("") +
            `</div></section>`,
    },
    {
        id: "hover-turn", name: "Hover to look closer", about: "Pointing at a card turns the model to show another side.", tags: ["Hover"],
        html: `<section class="grid min-h-screen items-center gap-8 bg-neutral-900 px-8 py-16 md:grid-cols-2 md:px-16">` +
            withId(modelMarkup({ src: free("GlassVaseFlowers"), shadow: true, "rotation": "0 -25 0", "camera-angle": "10" }, "block h-[420px] w-full md:h-[560px]"), "hover-model") +
            `<div class="grid gap-4">` +
            [["Front", "rotation:0 -25 0; camera-angle:10"], ["Side", "rotation:0 70 0; camera-angle:10"], ["From above", "rotation:0 -25 0; camera-angle:55; camera-distance:0.85"]].map(([t, v]) => `<div data-wc-for="hover-model" data-wc-hover="view ${v}" class="rounded-2xl border border-white/10 bg-white/5 p-6"><h3 class="text-xl font-semibold text-white">${t}</h3><p class="mt-1 text-neutral-400">Point at this card and the model turns to show it.</p></div>`).join("") +
            `</div></section>`,
    },
    {
        id: "background-model", name: "Model behind the words", about: "A full-width model fills the section; your headline and button sit on top.", tags: ["Background", "Floats"],
        html: `<section class="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-neutral-900 px-8 py-16 text-center">` +
            withAttrs(modelMarkup({ src: free("ClearCoatCarPaint"), shadow: true }, "absolute inset-0 -z-10 block h-full w-full"), 'data-wc-place="background" data-wc-fx="float:6"') +
            `<div class="relative z-10 max-w-2xl"><h1 class="text-6xl font-semibold tracking-tight text-white">Words in front, a model behind</h1><p class="mt-4 text-lg text-neutral-200">The model floats gently. Select it to change its effects.</p><a href="#" class="inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-900 mt-8">Get started</a></div></section>`,
    },
]);
