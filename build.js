// Builds dist/ from site/ and turns CMS posts in content/articles/*.md into article pages.
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const SITE = 'site', OUT = 'dist', POSTS = 'content/articles';
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SITE, OUT, { recursive: true });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const data = {};
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':'); if (i < 1) continue;
    let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    data[line.slice(0, i).trim()] = v === 'true' ? true : v === 'false' ? false : v;
  }
  return { data, body: m ? m[2] : raw };
}

const template = fs.readFileSync(path.join(SITE, 'articles.html'), 'utf8');
const header = template.slice(0, template.indexOf('<main')).replace(/<title>.*<\/title>/, '<title>__TITLE__ | Equity Investor Club</title>')
  .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="__DESC__" />')
  .replace(/<meta property="og:[^>]*>\s*/g, '').replace(/<link rel="canonical"[^>]*>\s*/, '');
const footer = template.slice(template.indexOf('<footer'));

const now = Date.now();
const posts = (fs.existsSync(POSTS) ? fs.readdirSync(POSTS) : []).filter((f) => f.endsWith('.md'))
  .map((f) => ({ f, ...parse(path.join(POSTS, f)) }))
  .filter((p) => p.data.title && p.data.draft !== true && (!p.data.date || Date.parse(p.data.date) <= now))
  .map((p) => {
    const plain = p.body.replace(/[#*_>`\[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim();
    return { ...p, slug: slugify(p.data.slug || p.f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')),
      excerpt: (p.data.summary || plain).slice(0, 200), minutes: Math.max(1, Math.round(plain.split(' ').length / 200)) };
  })
  .sort((a, b) => Date.parse(b.data.date || 0) - Date.parse(a.data.date || 0));

for (const p of posts) {
  const d = p.data;
  const html = header.replace('__TITLE__', esc(d.title)).replace('__DESC__', esc(p.excerpt)) + `<main class="container section">
  <a href="/articles" class="btn btn-outline">← All articles</a>
  <article>
    <h1 style="margin:12px 0;">${esc(d.title)}</h1>
    <div class="small" style="margin-bottom:12px;">${d.date ? new Date(d.date).toDateString() : ''} · ${p.minutes} min read${d.category ? ' · ' + esc(d.category) : ''}</div>
    ${d.cover ? `<img src="${esc(d.cover)}" alt="" style="width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin-bottom:16px;" />` : ''}
    <div class="update-card">${marked.parse(p.body)}</div>
  </article>
  <div class="disclaimer">Disclaimer:<br>Equity Investor Club is not a SEBI registered advisor.<br>All content on this website is for educational and learning purposes only.<br>Do your own analysis before making any investment decision.</div>
</main>
` + footer;
  fs.mkdirSync(path.join(OUT, 'articles', p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'articles', p.slug, 'index.html'), html);
}

fs.writeFileSync('worker/posts.json', JSON.stringify(posts.map((p) => ({ id: p.slug, title: p.data.title, slug: p.slug, excerpt: p.excerpt, publish_at: p.data.date || null }))));
console.log(`Built ${posts.length} article(s).`);
