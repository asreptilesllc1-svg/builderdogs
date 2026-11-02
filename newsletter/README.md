# Builder Dogs newsletter (`/newsletter/`)

The weekly **BuilderDogs Legends Report**, served as plain static files by Cloudflare Pages.
There is no build step on Cloudflare and no paid service: you write Markdown, run one local
Node script, and commit the HTML it writes.

| What | File | Live URL |
| --- | --- | --- |
| Index of all issues | `newsletter/index.html` (generated) | https://builderdogs.com/newsletter/ |
| One issue | `newsletter/issue-N.html` (generated) | https://builderdogs.com/newsletter/issue-N |
| Issue source | `newsletter/src/issue-N.md` (you edit this) | (also public as a raw file) |
| Images | `newsletter/img/issue-N/` | |
| Issue list (JSON) | `newsletter/issues.json` (generated) | |
| Generator | `scripts/new-issue.mjs` | |

Cloudflare Pages drops `.html`, so `issue-1.html` is served at `/newsletter/issue-1` and
`/newsletter/issue-1.html` redirects there. Always link to the clean URL.

## Add a weekly issue

Requires Node 18 or newer. Nothing to install.

1. Start the source file:
   `node scripts/new-issue.mjs --new 2`
   This creates `newsletter/src/issue-2.md` with `draft: true`, so it isn't published yet.
2. Fill in the front matter (`title`, `week`, `date` as `YYYY-MM-DD`, `description` of about
   150 characters for Google and link previews, and `summary` as one line for the index) and
   write the issue below it.
3. Add images to `newsletter/img/issue-2/`. Only use images you have permission for, and
   never hotlink X/pbs.twimg.com. Under each image, put a caption line in italics:
   `*Image: @Account. [Original post](https://x.com/Account/status/...)*`
   - Optional but recommended: add WebP copies next to each JPG/PNG: `name.webp` (full
     size) and `name-800.webp` (800 px wide). The script uses them automatically when they
     exist, and the JPG/PNG remains the fallback. Free ways to make them: `cwebp` from
     libwebp, Squoosh (squoosh.app), or
     `python3 -c "from PIL import Image; ..."`.
   - Share image: save a 1200×630 `og.jpg` in the folder and keep `image: img/issue-2/og.jpg`.
     If you remove the `image:` line, the first image in the issue is used instead.
4. Delete the `draft: true` line, then rebuild:
   `node scripts/new-issue.mjs`
   This rewrites every `newsletter/issue-*.html`, `newsletter/index.html`,
   `newsletter/issues.json` and the newsletter entries in `sitemap.xml`. Other sitemap
   entries are left alone.
5. Preview locally, for example with `npx serve .` from the repo root (serve also strips
   `.html`), and open `/newsletter/`.
6. Commit, then push once you're ready to go live. If Pages is Git-connected, it deploys on push.

## Markdown that the script understands

- `## Heading` and `### Subheading`
- Paragraphs. A single line break inside a paragraph is kept.
- `- list items`
- `[link text](https://...)`. A bare `https://...` link is also linked, and its text is
  shortened to drop `https://`. Paths without a domain are relative to `/newsletter/`, and
  `/legends` links to the site root.
- `**bold**`, `*italic*`
- `![alt text](img/issue-N/file.jpg)`, with an optional `*caption*` on the next line. The
  first image loads eagerly, and the rest get `loading="lazy"`. All images get width and
  height read from the file.
- Lines starting with `Source:` / `Sources:` are styled as small source notes.
- `> text` makes a boxed note, used for the disclaimer.

Anything fancier (tables, embeds) isn't supported; keep issues simple.

## SEO, built in

Each issue gets a `<title>`, meta description, a canonical clean URL, Open Graph/Twitter
`summary_large_image` tags with the share image, and `Article` JSON-LD (author Boo /
@BooMetaX, publisher Builder Dogs). The index gets `CollectionPage` + `ItemList` JSON-LD.
The list of issues on the index is written into the HTML, so crawlers see it without
JavaScript.
