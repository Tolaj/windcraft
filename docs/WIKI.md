# Publishing the wiki

The wiki pages are kept in this repo, in [`docs/wiki`](wiki), so changes can be reviewed in pull requests. GitHub keeps a wiki in a separate git repository, so publishing means copying the files there.

**First time**
1. In the repository **Settings → Features**, turn on **Wikis**.
2. Open the **Wiki** tab and press **Create the first page**, save anything. This makes GitHub create the wiki repository.
3. Clone it, copy the pages in and push:

```bash
git clone https://github.com/Tolaj/windcraft.wiki.git
cp docs/wiki/*.md windcraft.wiki/
cd windcraft.wiki
git add . && git commit -m "Publish the wiki" && git push
```

**After that**, when a page in `docs/wiki` changes, copy it over the same way. Edit pages here, not in the wiki, so the two do not drift apart.

`Home.md`, `_Sidebar.md` and `_Footer.md` are special: GitHub shows them as the front page, the side menu and the footer.
