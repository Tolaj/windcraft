# windcraft-editor documentation

[`windcraft-editor`](https://www.npmjs.com/package/windcraft-editor) is the Windcraft design editor as a package you can put in any web page: select, drag and style like Figma, and every change is real HTML with Tailwind classes. It needs no backend and no build step.

| Page | What is in it |
|---|---|
| [Getting started](getting-started.md) | Every way to load the editor: one file, npm, a static host, React, Vue, Next, Vite |
| [API reference](api.md) | `startEditor`, `mountEditor`, `embedEditor`, the editor object, `ui`, `theme` and `data` |
| [Host reference](host.md) | The functions the editor calls to save and load, with an Express backend |
| [Recipes](recipes.md) | A CMS field, an email template editor, AI, a themed editor, several editors on a page |
| [Troubleshooting](troubleshooting.md) | The blank editor, CORS, double mounts, SSR and other common problems |

## Which function do I need

| You want | Use | Designs are saved |
|---|---|---|
| The editor as the whole page, nothing to set up | `startEditor` | in the browser (localStorage) |
| The editor as the whole page, saving on your server | `mountEditor` + a host | wherever your host puts them |
| The editor in one part of a page, or several on a page | `embedEditor` | wherever your host puts them (or nowhere: read the HTML yourself) |

## The pieces

- **The editor** is plain ES modules plus a stylesheet. Nothing is compiled, so any static host serves it.
- **A host** is an object of functions you write (save, load, ...). `startEditor` brings its own, which uses localStorage.
- **A design** is one HTML document. `getHtml()` returns it with the Tailwind classes the editor wrote, ready to paste into a page.

Source, demo and issues: <https://github.com/Tolaj/windcraft>. MIT licensed.
