#!/usr/bin/env node
// Builder Dogs newsletter generator. No dependencies, no build step on Cloudflare.
//
//   node scripts/new-issue.mjs            rebuild every issue, the index and the sitemap
//   node scripts/new-issue.mjs --new 2    start newsletter/src/issue-2.md from a blank template
//
// Source:  newsletter/src/issue-N.md   (front matter + a small subset of Markdown)
// Output:  newsletter/issue-N.html     → https://builderdogs.com/newsletter/issue-N
//          newsletter/index.html       → https://builderdogs.com/newsletter/
//          newsletter/issues.json      (machine-readable list of issues)
//          sitemap.xml                 (newsletter URLs only; everything else is left alone)
// The generated HTML is committed, so Cloudflare Pages serves plain static files.
// See newsletter/README.md.

import { readFileSync, writeFileSync, readdirSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NL = join(ROOT, 'newsletter');
const SRC = join(NL, 'src');
const SITE = 'https://builderdogs.com';
const BASE = '/newsletter/';
const REPORT = 'The BuilderDogs Legends Report';

// ───────────────────────── helpers ─────────────────────────
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = p => /^https?:/.test(p) ? p : SITE + (p.startsWith('/') ? p : BASE + p);
const local = p => /^(https?:|\/|#|mailto:)/.test(p) ? p : BASE + p;   // paths in .md are relative to /newsletter/
const fmtDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error('Missing front matter (--- block at the top)');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

// Image size from the file header (JPEG, PNG, WebP), so every <img> gets width/height.
function imageSize(file) {
  const fd = openSync(file, 'r'); const buf = Buffer.alloc(256 * 1024);
  const n = readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 4) === 'RIFF') {
    const t = buf.toString('ascii', 12, 16);
    if (t === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (t === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < n) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  throw new Error('Cannot read image size: ' + file);
}

// ───────────────────────── markdown (small subset) ─────────────────────────
// Supported: ## / ### headings, paragraphs, "- " lists, "> " note, ![alt](src) images
// with an optional *italic* caption on the next line, [text](url), **bold**, *italic*,
// bare https:// links. Lines starting "Source:" / "Sources:" are styled as source notes.
function inline(s) {
  const links = [];
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const href = u.replace(/&amp;/g, '&'); const ext = /^https?:/.test(href);
    links.push(`<a href="${esc(local(href))}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  out = out.replace(/https?:\/\/[^\s<)]+[^\s<).,;:]/g, u => {
    links.push(`<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/, '')}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => links[+i]);
}

function figure(alt, src, caption, eager) {
  const file = join(NL, src);
  if (!existsSync(file)) throw new Error('Image not found: newsletter/' + src);
  const { w, h } = imageSize(file);
  const stem = src.replace(/\.(jpe?g|png)$/i, '');
  const sources = [];
  if (existsSync(join(NL, stem + '-800.webp')) && w > 800) sources.push(`${BASE}${stem}-800.webp 800w`);
  if (existsSync(join(NL, stem + '.webp'))) sources.push(`${BASE}${stem}.webp ${w}w`);
  const pic = `<picture>${sources.length ? `<source type="image/webp" srcset="${sources.join(', ')}" sizes="(max-width: 760px) calc(100vw - 32px), 720px">` : ''}`
    + `<img src="${BASE}${src}" width="${w}" height="${h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
  return `<figure>${pic}${caption ? `<figcaption>${inline(caption)}</figcaption>` : ''}</figure>`;
}

function markdown(body) {
  const lines = body.replace(/\r/g, '').split('\n');
  const out = []; let para = [], list = [], images = 0;
  const flush = () => {
    if (para.length) {
      const html = para.map(l => /^Sources?:/.test(l) ? `<span class="src">${inline(l)}</span>` : inline(l)).join('<br>\n');
      out.push(`<p>${html}</p>`); para = [];
    }
    if (list.length) { out.push('<ul>\n' + list.map(l => `<li>${inline(l)}</li>`).join('\n') + '\n</ul>'); list = []; }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let m;
    if (!line) { flush(); continue; }
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); const tag = 'h' + m[1].length; out.push(`<${tag}>${inline(m[2])}</${tag}>`); continue; }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      flush();
      let cap = '';
      const next = (lines[i + 1] || '').trim();
      if (/^\*[^*].*\*$/.test(next)) { cap = next.slice(1, -1); i++; }
      out.push(figure(m[1], m[2], cap, images++ === 0)); continue;
    }
    if ((m = line.match(/^-\s+(.*)$/))) { if (para.length) flush(); list.push(m[1]); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); out.push(`<p class="note">${inline(m[1])}</p>`); continue; }
    if (list.length) flush();
    para.push(line);
  }
  flush();
  return out.join('\n');
}

// ───────────────────────── page shell (matches index.html) ─────────────────────────
const NAV = [['/cards', 'Buy cards'], ['/legends', 'Cards &amp; decks'], ['/inventory', 'My collection'], ['/market', 'Market'], ['/newsletter/', 'Newsletter'], ['/garage', 'Garage']];
const MOBILE = [['/cards', 'Buy cards'], ['/legends', 'Cards &amp; decks'], ['/inventory', 'My collection'], ['/market', 'Market'], ['/merch-sales', 'Merch prices'], ['/newsletter/', 'Newsletter'], ['/garage', 'Garage'], ['/custom', 'Custom orders']];
const FOOT = [['/cards', 'Buy cards'], ['/legends', 'Cards &amp; decks'], ['/inventory', 'My collection'], ['/market', 'Market'], ['/merch-sales', 'Merch prices'], ['/sets-sales', 'Set prices'], ['/newsletter/', 'Newsletter'], ['/custom', 'Custom orders']];
const links = (arr, cur) => arr.map(([h, t]) => `<a href="${h}"${h === cur ? ' aria-current="page"' : ''}>${t}</a>`).join('\n      ');

const CSS = `
  :root { --ink:#0d0d0d; --panel:#161412; --panel-2:#1d1a17; --line:rgba(240,236,224,0.09); --line-hot:rgba(249,115,22,0.35);
    --orange:#f97316; --orange-deep:#c2560c; --gold:#f5c842; --cream:#f0ece0; --dim:#a39d91; --faint:#6f6a62;
    --display:'Black Ops One','Arial Black',sans-serif; --body:'Barlow Condensed','Arial Narrow',sans-serif; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { overflow-x:hidden; }
  body { background:var(--ink); color:var(--cream); font-family:var(--body); font-size:19px; line-height:1.55; -webkit-font-smoothing:antialiased; }
  img { display:block; max-width:100%; height:auto; }
  a { color:inherit; }
  :focus-visible { outline:2px solid var(--gold); outline-offset:3px; }
  .wrap { max-width:1160px; margin:0 auto; padding:0 24px; }
  .nav { position:sticky; top:0; z-index:50; background:rgba(13,13,13,0.94); backdrop-filter:blur(10px); border-bottom:1px solid var(--line); }
  .nav .wrap { display:flex; align-items:center; height:60px; gap:28px; }
  .logo { font-family:var(--display); font-size:20px; color:var(--orange); text-decoration:none; letter-spacing:0.5px; }
  .logo span { color:var(--cream); }
  .nav-links { display:flex; gap:4px; margin-left:auto; align-items:center; }
  .nav-links a { text-decoration:none; color:var(--dim); font-weight:600; font-size:17px; padding:8px 12px; border-radius:4px; }
  .nav-links a:hover, .nav-links a[aria-current] { color:var(--cream); background:rgba(240,236,224,0.05); }
  .nav-links a.shop { background:var(--orange); color:var(--ink); margin-left:8px; padding:8px 18px; }
  .nav-links a.shop:hover { background:var(--orange-deep); }
  .menu-btn { display:none; margin-left:auto; background:none; border:1px solid var(--line); color:var(--cream); font:600 16px var(--body); padding:8px 14px; min-height:40px; border-radius:4px; cursor:pointer; }
  .mobile-menu { display:none; border-top:1px solid var(--line); padding:8px 24px 16px; }
  .mobile-menu.open { display:grid; }
  .mobile-menu a { text-decoration:none; padding:12px 0; border-bottom:1px solid var(--line); font-size:19px; font-weight:600; }
  .mobile-menu a:last-child { border-bottom:0; color:var(--orange); }
  .kicker { font-family:var(--display); font-size:14px; letter-spacing:1.5px; color:var(--orange); text-transform:uppercase; }
  .page-head { padding:56px 0 28px; border-bottom:1px solid var(--line); }
  .page-head h1 { font-family:var(--display); font-weight:400; font-size:clamp(32px,5vw,54px); line-height:1.05; margin:12px 0 12px; }
  .page-head .meta { color:var(--dim); font-size:19px; }
  .article-head { max-width:720px; margin:0 auto; }
  .article { max-width:720px; margin:0 auto; padding:8px 0 56px; }
  .article h2 { font-family:var(--display); font-weight:400; font-size:clamp(24px,3.4vw,32px); line-height:1.15; margin:44px 0 14px; }
  .article h3 { font-size:22px; font-weight:700; margin:28px 0 8px; }
  .article p, .article ul { margin:0 0 16px; color:var(--cream); }
  .article ul { padding-left:22px; }
  .article li { margin:0 0 10px; }
  .article a { color:var(--orange); text-underline-offset:3px; overflow-wrap:anywhere; }
  .article a:hover { color:var(--gold); }
  .article .src { display:inline-block; margin-top:6px; font-size:16px; color:var(--dim); }
  .article .note { margin-top:36px; padding:16px 18px; border:1px solid var(--line); border-radius:6px; background:var(--panel); color:var(--dim); font-size:17px; }
  figure { margin:24px 0 28px; }
  figure img { width:100%; border-radius:6px; border:1px solid var(--line); background:var(--panel); }
  figcaption { margin-top:8px; font-size:15px; color:var(--faint); }
  figcaption a { color:var(--dim) !important; }
  .back { display:inline-block; margin-top:8px; padding:10px 0; font-weight:600; color:var(--dim); text-decoration:none; }
  .back:hover { color:var(--cream); }
  .issues { list-style:none; display:grid; gap:20px; padding:32px 0 64px; max-width:900px; }
  .issue-card { display:grid; grid-template-columns:220px 1fr; gap:22px; align-items:center; text-decoration:none; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; transition:border-color .15s; }
  .issue-card:hover { border-color:var(--line-hot); }
  .issue-card img { width:100%; aspect-ratio:1200/630; object-fit:cover; border-radius:4px; }
  .issue-card h2 { font-family:var(--display); font-weight:400; font-size:24px; line-height:1.15; margin:6px 0 6px; }
  .issue-card p { color:var(--dim); font-size:18px; }
  .issue-card .read { display:inline-block; margin-top:10px; color:var(--orange); font-weight:700; }
  .lede { color:var(--dim); font-size:21px; max-width:36em; }
  footer { border-top:1px solid var(--line); padding:44px 0 56px; color:var(--faint); font-size:16px; }
  footer .top { display:flex; justify-content:space-between; gap:24px; flex-wrap:wrap; margin-bottom:24px; }
  footer nav { display:flex; flex-wrap:wrap; gap:8px 22px; }
  footer nav a { color:var(--dim); text-decoration:none; font-weight:600; padding:4px 0; }
  footer nav a:hover { color:var(--cream); }
  footer .fine { max-width:60em; }
  @media (max-width:900px) { .nav-links { display:none; } .menu-btn { display:block; } }
  @media (max-width:600px) {
    .wrap { padding:0 16px; }
    .page-head { padding:36px 0 20px; }
    .issue-card { grid-template-columns:1fr; gap:12px; }
    body { font-size:18px; }
  }`;

function shell({ title, description, canonical, ogType, image, imageAlt, jsonld, current, main }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Builder Dogs">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@BooMetaX">
<meta name="twitter:creator" content="@BooMetaX">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Barlow+Condensed:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
<style>${CSS}
</style>
</head>
<body>

<header class="nav">
  <div class="wrap">
    <a class="logo" href="/">BUILDER<span>DOGS</span></a>
    <nav class="nav-links" aria-label="Main">
      ${links(NAV, current)}
      <a href="https://shop.builderdogs.com" target="_blank" rel="noopener" class="shop">Shop merch</a>
    </nav>
    <button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="mobile-menu">Menu</button>
  </div>
  <nav class="mobile-menu" id="mobile-menu" aria-label="Mobile">
    ${links(MOBILE, current)}
    <a href="https://shop.builderdogs.com" target="_blank" rel="noopener">Shop merch</a>
  </nav>
</header>

<main>
${main}
</main>

<footer>
  <div class="wrap">
    <div class="top">
      <a class="logo" href="/">BUILDER<span>DOGS</span></a>
      <nav aria-label="Footer">
        ${links(FOOT, current)}
        <a href="https://shop.builderdogs.com" target="_blank" rel="noopener">Shop</a>
        <a href="https://x.com/BooMetaX" target="_blank" rel="noopener">@BooMetaX</a>
      </nav>
    </div>
    <p class="fine">Builder Dogs is an independent fan project. Doginal Dogs Legends is created by Doginal Dogs; this site is not affiliated with or endorsed by them. Card values are estimates from eBay sold listings and are not financial advice.</p>
  </div>
</footer>

<script>
(function () {
  var btn = document.getElementById('menu-btn'), menu = document.getElementById('mobile-menu');
  btn.addEventListener('click', function () {
    var open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.textContent = open ? 'Close' : 'Menu';
  });
})();
</script>
</body>
</html>
`;
}

const PUBLISHER = { '@type': 'Organization', name: 'Builder Dogs', url: SITE + '/' };
const AUTHOR = { '@type': 'Person', name: 'Boo', alternateName: '@BooMetaX', url: 'https://x.com/BooMetaX' };

// ───────────────────────── build ─────────────────────────
function loadIssues() {
  if (!existsSync(SRC)) return [];
  return readdirSync(SRC).filter(f => /^issue-\d+\.md$/.test(f)).map(f => {
    const { meta, body } = frontMatter(readFileSync(join(SRC, f), 'utf8'));
    for (const k of ['issue', 'slug', 'title', 'week', 'date', 'description', 'summary']) if (!meta[k]) throw new Error(`${f}: front matter is missing "${k}"`);
    if (meta.draft === 'true') return null;
    return { ...meta, issue: +meta.issue, body, file: f };
  }).filter(Boolean).sort((a, b) => b.issue - a.issue);
}

function issueImage(it) {
  // Share image: front-matter "image", else the first image in the issue.
  if (it.image) return it.image;
  const m = it.body.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
  return m ? m[1] : null;
}

function buildIssue(it, all) {
  const url = SITE + BASE + it.slug;
  const img = issueImage(it);
  const image = img ? abs(img) : SITE + '/share.png';
  const idx = all.indexOf(it), newer = all[idx - 1], older = all[idx + 1];
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: it.title.slice(0, 110), description: it.description, image: [image],
    datePublished: it.date, dateModified: it.updated || it.date,
    author: AUTHOR, publisher: PUBLISHER,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@type': 'Periodical', name: REPORT, url: SITE + BASE },
    inLanguage: 'en',
  };
  const pager = [
    older ? `<a class="back" href="${BASE}${older.slug}">← Issue #${older.issue}</a>` : '',
    `<a class="back" href="${BASE}">All issues</a>`,
    newer ? `<a class="back" href="${BASE}${newer.slug}">Issue #${newer.issue} →</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const main = `<div class="wrap">
  <header class="page-head article-head">
    <a class="kicker" href="${BASE}" style="text-decoration:none">${esc(REPORT)}</a>
    <h1>${esc(it.title)}</h1>
    <p class="meta">${esc(it.week)}${it.byline ? ' · ' + esc(it.byline) : ''}</p>
    <p class="meta" style="font-size:16px;color:var(--faint)">Published <time datetime="${it.date}">${fmtDate(it.date)}</time></p>
  </header>
  <article class="article">
${markdown(it.body)}
    <nav aria-label="Issues">${pager}</nav>
  </article>
</div>`;
  writeFileSync(join(NL, it.slug + '.html'), shell({
    title: it.title + ' | Builder Dogs', description: it.description, canonical: url, ogType: 'article',
    image, imageAlt: it.image_alt || it.title, jsonld, current: '/newsletter/', main,
  }));
}

function buildIndex(all) {
  const url = SITE + BASE;
  const latest = all[0];
  const image = latest && issueImage(latest) ? abs(issueImage(latest)) : SITE + '/share.png';
  const description = 'A free, plain-language weekly on Doginal Dogs Legends: tournaments, community news and what cards actually sold for. From Builder Dogs (@BooMetaX).';
  const cards = all.map(it => {
    const img = issueImage(it);
    let thumb = '';
    if (img && !/^https?:/.test(img)) {
      const { w, h } = imageSize(join(NL, img));
      thumb = `<img src="${BASE}${img}" width="${w}" height="${h}" alt="" loading="lazy" decoding="async">`;
    }
    return `  <li><a class="issue-card" href="${BASE}${it.slug}">
    ${thumb}
    <div>
      <span class="kicker">Issue #${it.issue} · ${esc(it.week)}</span>
      <h2>${esc(it.title)}</h2>
      <p>${esc(it.summary)}</p>
      <span class="read">Read issue #${it.issue} →</span>
    </div>
  </a></li>`;
  }).join('\n');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: REPORT, url, description, publisher: PUBLISHER,
    mainEntity: { '@type': 'ItemList', itemListElement: all.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: url + it.slug, name: it.title })) },
  };
  const main = `<div class="wrap">
  <header class="page-head">
    <span class="kicker">Newsletter</span>
    <h1>${esc(REPORT)}</h1>
    <p class="lede">A weekly, plain-language rundown of Doginal Dogs Legends: tournaments, community news and a market note from the sold-price data. New to the game? Start with the latest issue.</p>
  </header>
  <ul class="issues">
${cards}
  </ul>
</div>`;
  writeFileSync(join(NL, 'index.html'), shell({
    title: REPORT + ' — Doginal Dogs Legends newsletter | Builder Dogs', description, canonical: url, ogType: 'website',
    image, imageAlt: latest ? (latest.image_alt || latest.title) : REPORT, jsonld, current: '/newsletter/', main,
  }));
  writeFileSync(join(NL, 'issues.json'), JSON.stringify(all.map(({ issue, slug, title, week, date, summary }) => ({ issue, slug, title, week, date, summary, url: url + slug })), null, 2) + '\n');
}

function updateSitemap(all) {
  const file = join(ROOT, 'sitemap.xml');
  let xml = readFileSync(file, 'utf8');
  xml = xml.replace(/[ \t]*<url>\s*<loc>https:\/\/builderdogs\.com\/newsletter[^<]*<\/loc>[\s\S]*?<\/url>\n?/g, '');
  const entry = (loc, lastmod, freq, pri) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>\n`;
  let add = '';
  if (all.length) {
    add += entry(SITE + BASE, all[0].updated || all[0].date, 'weekly', '0.8');
    for (const it of all) add += entry(SITE + BASE + it.slug, it.updated || it.date, 'monthly', '0.7');
  }
  xml = xml.replace(/<\/urlset>/, add + '</urlset>');
  writeFileSync(file, xml);
}

function newSource(n) {
  const f = join(SRC, `issue-${n}.md`);
  if (existsSync(f)) throw new Error(f + ' already exists');
  writeFileSync(f, `---
issue: ${n}
slug: issue-${n}
title: ${REPORT} · Issue #${n}
week: Week of MMM D–D, YYYY
byline: from BuilderDogs (@BooMetaX)
date: YYYY-MM-DD
description: One or two sentences for Google and link previews (about 150 characters).
summary: One line shown on the newsletter index.
image: img/issue-${n}/og.jpg
image_alt: Describe the share image
draft: true
---

## Top story
Write here. Links: [text](https://example.com). Bare links like https://x.com/... work too.

![Describe the image](img/issue-${n}/1-example.jpg)
*Image: @Account. [Original post](https://x.com/Account/status/123)*

## Around the community
- One line per item. https://x.com/...

> BuilderDogs is an independent fan publication and is not affiliated with Doginal Dogs or DDL TCG. Prices are past sales, not advice.
`);
  console.log('Created', f, '\nAdd images under newsletter/img/issue-' + n + '/, remove "draft: true", then run: node scripts/new-issue.mjs');
}

const argv = process.argv.slice(2);
if (argv[0] === '--new') { newSource(+argv[1] || loadIssues().length + 1); process.exit(0); }
const all = loadIssues();
for (const it of all) buildIssue(it, all);
buildIndex(all);
updateSitemap(all);
console.log(`Built ${all.length} issue(s): ${all.map(i => BASE + i.slug).join(', ')}; index, issues.json and sitemap.xml updated.`);
