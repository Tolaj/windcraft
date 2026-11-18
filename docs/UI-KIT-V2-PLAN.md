# Windcraft UI Kit v2: the plan

Kit v1 has 36 gallery categories with 10 designs each (360 designs). Kit v2 adds the categories a UI kit is expected to have and v1 does not: sidebars, badges, tabs, alerts, empty states and so on. Same rule as v1: **10 designs in every category**.

The new designs live in the project **Windcraft UI Kit v2**, next to v1, so v1 stays as it is and v2 can be published, checked and fixed on its own.

## Where v1 stands

36 categories in 9 groups: Marketing 14, UI Components 5, Navigation 2, Layout 1, Forms 4, Pages 1, E-Commerce 1, Applications 6, Footer 2. A sidebar appears once, inside "Application Components". There is one Pages category. The editor's "suited designs" filter guesses roles such as sidebar and call to action, but no category holds them.

## What v2 adds (about 58 categories in six waves)

Slugs follow the existing pattern `group-name`. A wave is built, looked at and fixed before the next one starts.

### Wave 1: built first (10 categories, 100 designs) — done
The project **Windcraft UI Kit v2** holds all 100 designs, 10 in each category below, saved private. Checked: counts per category; the CSS-only switching (tabs, switches, radio cards, nested accordions) in a real browser. Not done yet: the board groups (the connector could not set a group when these were saved; `save_component` now takes `group` and `save_design` / `save_pages` take `category`), a look at every design at 390 px, and publishing.
| Category | Group | Why first |
|---|---|---|
| Sidebars (`navigation-sidebars`) | Navigation | The most common thing people select; the editor's `sidebar` role had no category |
| Call to Action (`marketing-cta`) | Marketing | The `cta` role had no category |
| Stats Sections (`marketing-stats`) | Marketing | The marketing version of numbers; v1 only has app stats |
| Alerts & Toasts (`ui-alerts`) | UI Components | Needed in every app |
| Badges & Tags (`ui-badges`) | UI Components | Small, used everywhere, easy to get wrong |
| Tabs (`ui-tabs`) | UI Components | Basic navigation inside a page |
| Accordions (`ui-accordions`) | UI Components | Beyond FAQ: settings, filters, docs |
| Pagination & Breadcrumbs (`navigation-pagination`) | Navigation | Lists and docs need them |
| Toggles & Checkboxes (`forms-controls`) | Forms | Switches, checkboxes, radios, sliders |
| Empty States (`ui-empty-states`) | UI Components | The screen people forget to design |

### Wave 2: more UI and forms (12)
Avatars and avatar groups · Tooltips and popovers · Drawers (slide-overs) · Progress bars and steppers · Skeleton loaders and spinners · Search and command bars · Input groups · File uploads · Date pickers and calendars · Settings forms · Contact forms · Checkout and multi-step forms

### Wave 3: marketing (7)
How it works (steps) · Comparison tables · Bento grids · About the company · Video sections · Integrations grids · Error sections (404, 500, maintenance)

### Wave 4: e-commerce (6)
Product detail · Shopping cart · Checkout · Order summary · Reviews · Filters and sorting

### Wave 5: applications (11)
Dashboards · Kanban boards · Calendars · Chat and messaging · File manager · Activity feeds · Stacked lists · Description lists · Settings screens · Command palettes · Notification center

### Wave 6: full pages (12, in the Pages group) — 8 of 12 built
Built, 10 pages each, in the project **Windcraft UI Kit v2**: Landing Pages, About Pages, Contact Pages, Sign In & Sign Up Pages, Dashboard Pages, Settings Pages, Blog Post Pages and Error Pages (`pages-landing`, `pages-about`, `pages-contact`, `pages-auth`, `pages-dashboard`, `pages-settings`, `pages-blog-post`, `pages-error`). Not built yet: Profile, Product page, Checkout and Documentation pages. Each page was saved private. Checked: the layout pattern (header, sections, footer) rendered at 1280 and 390 px for the first landing page; the other 79 pages follow the same pattern but were not each rendered.

Planned list:
Landing · About · Contact · Sign in and sign up · Dashboard · Settings · Profile · Blog post · Product page · Checkout · 404 and 500 · Documentation. Projects are made of pages, and v1 has only one page type, so this wave matters more than its place in the list suggests. Each is built from earlier waves' parts where it can.

## Rules for every design

- **Same look as v1.** Black and white only; white, neutral-50 or neutral-950 backgrounds; neutral borders; radius lg or xl for controls, 2xl for cards, full for pills and avatars. No accent colours: emphasis comes from weight, size and contrast. Status uses black fill for active and outline for pending.
- **Real Tailwind, no custom CSS.** Utility classes only, so every design stays editable in Windcraft. No inline `style` except where a number is data (a progress width). Links use `href="#"`.
- **No script.** Accordions use `<details>`, switches and tabs use `peer` and `group` classes, so a design works with no JavaScript.
- **One self-contained block**, about 1280 px wide, responsive down to a phone. Overlays and menus are drawn open, inside a small mock page or a relative container, so they sit correctly on the board.
- **Placeholder copy** about Windcraft or generic products. Names, numbers, emails and prices are samples.
- **Accessible by default:** real buttons and labels, `aria-*` where an element is not self-explaining, contrast that holds in black and white.
- **Named and numbered:** `Sidebars 01 · Icon rail`, so the list reads like v1's.

## How each wave is built

1. Add the category names to the app (the category map, the details form, the role map). Done for wave 1; later waves add theirs the same way.
2. Create the designs in the project with the Windcraft connector, one category at a time, 10 each.
3. Look at every design at desktop and phone width (the connector's screenshot tool), and fix what looks off.
4. Put each category in its own group on the project board.
5. Decide what to publish. Designs are private until published; publishing them puts them in the public gallery.
6. Make the category thumbnails once a category has published designs (`npm run thumbs:categories`).

## Checks before a wave counts as done

- 10 designs in each category, titles numbered 01 to 10, no two the same in structure.
- Every design renders with no console errors, with its classes styled, at 1280 px and at 390 px.
- No custom CSS classes, no script, no stray inline styles.
- A category's designs differ in layout and in density, not only in text.

## Not planned

- No colour themes in v2: it is a black-and-white kit like v1. A themed variant can be made later from the same designs.
- No photos beyond what v1 already uses (free Unsplash images, grey blocks elsewhere).
