// Builds dist/ from site/ and turns CMS posts in content/articles/*.md into article pages.
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const yaml = require('js-yaml');

const SITE = 'site', OUT = 'dist', POSTS = 'content/articles';
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SITE, OUT, { recursive: true });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let data = {};
  if (m) { try { data = yaml.load(m[1]) || {}; } catch (e) { console.warn('Bad front matter in', file, e.message); data = {}; } }
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
    return { ...p, slug: slugify(p.data.slug || p.f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/^auto-/, '')),
      excerpt: (p.data.summary || plain).slice(0, 200), minutes: Math.max(1, Math.round(plain.split(' ').length / 200)) };
  })
  .sort((a, b) => Date.parse(b.data.date || 0) - Date.parse(a.data.date || 0));

for (const p of posts) {
  const d = p.data;
  const hasTa = !!(d.body_ta && String(d.body_ta).trim());
  const quiz = Array.isArray(d.quiz) ? d.quiz.filter((q) => q && q.q && Array.isArray(q.options) && q.options.length) : [];
  const quizHtml = quiz.length ? `<section class="section"><h2>Quick quiz</h2><p class="small">Test what you just learned.</p>
    ${quiz.map((q, i) => `<div class="card quiz" data-answer="${Number(q.answer) || 0}" style="margin-bottom:12px;"><h3 style="margin-bottom:8px;">${i + 1}. ${esc(q.q)}</h3>
      ${q.options.map((o, k) => `<button class="btn btn-outline quiz-opt" data-k="${k}" style="display:block;width:100%;text-align:left;margin:6px 0;">${esc(o)}</button>`).join('')}
      <p class="small quiz-msg"></p></div>`).join('')}</section>` : '';
  const html = header.replace('__TITLE__', esc(d.title)).replace('__DESC__', esc(p.excerpt)) + `<main class="container section">
  <a href="/articles" class="btn btn-outline">← All articles</a>
  <article>
    ${hasTa ? `<div role="group" aria-label="Language" style="margin:12px 0;display:flex;gap:8px;"><button class="btn lang-btn" data-lang="en" aria-pressed="true">English</button><button class="btn btn-outline lang-btn" data-lang="ta" aria-pressed="false">தமிழ்</button></div>` : ''}
    <div class="lang" data-lang="en">
      <h1 style="margin:12px 0;">${esc(d.title)}</h1>
    </div>
    ${hasTa ? `<div class="lang" data-lang="ta" hidden><h1 style="margin:12px 0;">${esc(d.title_ta || d.title)}</h1></div>` : ''}
    <div class="small" style="margin-bottom:12px;">${d.date ? new Date(d.date).toDateString() : ''} · ${p.minutes} min read${d.category ? ' · ' + esc(d.category) : ''}</div>
    ${d.cover ? `<img src="${esc(d.cover)}" alt="" style="width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin-bottom:16px;" />` : ''}
    <div class="update-card lang" data-lang="en">${marked.parse(p.body)}</div>
    ${hasTa ? `<div class="update-card lang" data-lang="ta" hidden>${marked.parse(String(d.body_ta))}</div>` : ''}
    ${d.source ? `<p class="small" style="margin-top:10px;">Based on insights from ${esc(d.source)}. Written in our own words for learning.</p>` : ''}
  </article>
  ${quizHtml}
  <section class="section"><h2>Try the numbers yourself</h2><p><a class="btn btn-outline" href="/sip-calculator">SIP calculator</a> <a class="btn btn-outline" href="/swp-calculator">SWP calculator</a> <a class="btn btn-outline" href="/tools">All tools</a></p></section>
  <div class="disclaimer">Disclaimer:<br>Equity Investor Club is not a SEBI registered advisor.<br>All content on this website is for educational and learning purposes only.<br>Do your own analysis before making any investment decision.</div>
</main>
<script>
document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => {
  const l = b.dataset.lang;
  document.querySelectorAll('.lang').forEach((e) => { e.hidden = e.dataset.lang !== l; });
  document.querySelectorAll('.lang-btn').forEach((x) => { const on = x === b; x.setAttribute('aria-pressed', on); x.classList.toggle('btn-outline', !on); });
  document.documentElement.lang = l;
}));
document.querySelectorAll('.quiz').forEach((card) => card.querySelectorAll('.quiz-opt').forEach((o) => o.addEventListener('click', () => {
  const right = Number(card.dataset.answer), k = Number(o.dataset.k);
  card.querySelectorAll('.quiz-opt').forEach((x) => { x.disabled = true; if (Number(x.dataset.k) === right) x.style.borderColor = '#22c55e'; });
  if (k !== right) o.style.borderColor = '#ef4444';
  card.querySelector('.quiz-msg').textContent = k === right ? 'Correct!' : 'Not quite. The right answer is highlighted in green.';
})));
</script>
` + footer;
  fs.mkdirSync(path.join(OUT, 'articles', p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'articles', p.slug, 'index.html'), html);
}

fs.writeFileSync('worker/posts.json', JSON.stringify(posts.map((p) => ({ id: p.slug, title: p.data.title, slug: p.slug, excerpt: p.excerpt, publish_at: p.data.date || null }))));
console.log(`Built ${posts.length} article(s).`);
