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

// Small inline SVG line chart of daily closing prices (no external libraries).
function chartSvg(c) {
  if (!c || !Array.isArray(c.points) || c.points.length < 5) return '';
  const pts = c.points, W = 640, H = 220, P = 36;
  const ys = pts.map((p) => p[1]), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1), y = (v) => H - P - ((v - min) * (H - 2 * P)) / span;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const first = ys[0], last = ys[ys.length - 1], chg = ((last - first) / first) * 100;
  const colour = chg >= 0 ? '#22c55e' : '#ef4444';
  const inr = (v) => '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `<figure class="update-card" style="margin-top:16px;">
  <figcaption style="margin-bottom:8px;"><strong>${esc(c.name || c.symbol)} (NSE: ${esc(c.symbol)})</strong>: closing price, last month · ${inr(last)} <span style="color:${colour}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(1)}%</span></figcaption>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name || c.symbol)} share price over the last month, from ${inr(first)} to ${inr(last)}" style="width:100%;height:auto;">
    <text x="${P}" y="${y(max) - 6}" font-size="12" fill="currentColor" opacity=".7">${inr(max)}</text>
    <text x="${P}" y="${y(min) + 16}" font-size="12" fill="currentColor" opacity=".7">${inr(min)}</text>
    <polyline points="${line}" fill="none" stroke="${colour}" stroke-width="2.5" stroke-linejoin="round" />
    <text x="${P}" y="${H - 8}" font-size="12" fill="currentColor" opacity=".7">${esc(pts[0][0])}</text>
    <text x="${W - P}" y="${H - 8}" font-size="12" fill="currentColor" opacity=".7" text-anchor="end">${esc(pts[pts.length - 1][0])}</text>
  </svg>
  <p class="small">Price data: Yahoo Finance, delayed. Past prices do not predict future returns.</p>
</figure>`;
}

const template = fs.readFileSync(path.join(SITE, 'articles.html'), 'utf8');
const header = template.slice(0, template.indexOf('<main')).replace(/<title>.*<\/title>/, '<title>__TITLE__ | Equity Investor Club</title>')
  .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="__DESC__" />')
  .replace(/<meta property="og:[^>]*>\s*/g, '').replace(/<link rel="canonical"[^>]*>\s*/, '');
const footer = template.slice(template.indexOf('<footer'));

const now = Date.now();
const holdings = (() => { try { return JSON.parse(fs.readFileSync('content/holdings.json', 'utf8')); } catch (e) { return { stocks: [] }; } })();
const held = new Set((holdings.stocks || []).map((h) => String(h.symbol || '').toUpperCase()).filter(Boolean));
const posts = (fs.existsSync(POSTS) ? fs.readdirSync(POSTS) : []).filter((f) => f.endsWith('.md'))
  .map((f) => ({ f, ...parse(path.join(POSTS, f)) }))
  .filter((p) => p.data.title && p.data.draft !== true && (!p.data.date || Date.parse(p.data.date) <= now))
  // Robot posts only stay on the site for 30 days; your own articles stay until you delete them.
  .filter((p) => !(p.data.auto === true && p.data.date && now - Date.parse(p.data.date) > 30 * 864e5))
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
    <div class="small" style="margin-bottom:12px;">By <a href="https://2026-updated-portfolio.amrithkishore6.workers.dev" target="_blank" rel="noopener">Amrith Kishore M</a>, Founder · ${d.date ? new Date(d.date).toDateString() : ''} · ${p.minutes} min read${d.category ? ' · ' + esc(d.category) : ''}</div>
    ${d.cover ? `<img src="${esc(d.cover)}" alt="" style="width:100%;max-height:420px;object-fit:cover;border-radius:12px;margin-bottom:16px;" />` : ''}
    <div class="update-card lang" data-lang="en">${marked.parse(p.body)}</div>
    ${hasTa ? `<div class="update-card lang" data-lang="ta" hidden>${marked.parse(String(d.body_ta))}</div>` : ''}
    ${chartSvg(d.chart)}
    <p class="small" style="margin-top:12px;"><strong>Disclosure:</strong> ${d.chart && held.has(String(d.chart.symbol).toUpperCase()) ? `The author holds ${esc(d.chart.name || d.chart.symbol)} shares in a personal portfolio.` : 'The author may hold shares in companies mentioned; see <a href="/holdings">our holdings disclosure</a>.'} This article is for education only and is not a recommendation to buy, sell or hold any security. <a href="/disclaimer">Read the full disclaimer</a>.</p>
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

// ---- Static pages built from data ----
function page(slug, title, html) {
  const out = header.replace('__TITLE__', esc(title)).replace('__DESC__', esc(title)) + `<main class="container section">${html}</main>\n` + footer;
  fs.mkdirSync(path.join(OUT, slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, slug, 'index.html'), out);
}
const stocks = holdings.stocks || [];
const fundamentalsData = (() => { try { return JSON.parse(fs.readFileSync('content/fundamentals.json', 'utf8')); } catch (e) { return {}; } })();
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data', 'fundamentals.json'), JSON.stringify(fundamentalsData));
const DISC = `<div class="disclaimer" style="margin-top:16px;">For education only. This is factual data, not a recommendation to buy, sell or hold. Equity Investor Club is not registered with SEBI as an Investment Adviser or Research Analyst, and the founder holds this security. <a href="/disclaimer">Full disclaimer</a>.</div>`;
page('holdings', "Stocks I invest in", `<h1>Stocks I invest in</h1>
  <p class="lead">For transparency, these are the listed securities that Equity Investor Club's founder, Amrith Kishore M, holds in a personal portfolio. Quantities, prices and values are not shared. Tap a company to see its fundamentals and today's technical picture.</p>
  ${stocks.length ? `<div class="cards">${stocks.map((h) => { const s = encodeURIComponent(String(h.symbol).toUpperCase()); return `<div class="card"><h3>${esc(h.name)}</h3><p class="small">${esc(h.exchange || 'NSE')}: ${esc(h.symbol)}</p><p><a class="btn btn-outline" href="/stocks/${s}/#fundamental">Fundamental analysis</a> <a class="btn btn-outline" href="/stocks/${s}/#technical">Technical analysis</a></p></div>`; }).join('')}</div>` : '<p>The list is being updated.</p>'}
  ${holdings.updated ? `<p class="small" style="margin-top:12px;">List last updated: ${esc(new Date(holdings.updated).toDateString())}</p>` : ''}
  <div class="disclaimer" style="margin-top:16px;">This list is a disclosure of personal interest, not a recommendation. Holding a stock does not mean it is suitable for you. Equity Investor Club is not registered with SEBI as an Investment Adviser or Research Analyst. <a href="/disclaimer">Full disclaimer</a>.</div>`);
for (const h of stocks) {
  const sym = String(h.symbol).toUpperCase();
  page(`stocks/${sym}`, `${h.name} (${sym})`, `<a href="/holdings" class="btn btn-outline">← All stocks</a>
  <h1 style="margin:12px 0 4px;">${esc(h.name)}</h1><p class="small">${esc(h.exchange || 'NSE')}: ${esc(sym)}</p>
  <div role="tablist" style="display:flex;gap:8px;margin:16px 0;"><button class="btn tab" data-tab="fundamental" role="tab">Fundamental analysis</button><button class="btn btn-outline tab" data-tab="technical" role="tab">Technical analysis</button></div>
  <section id="fundamental" class="panel update-card"><p class="small">Loading fundamentals…</p></section>
  <section id="technical" class="panel update-card" hidden><p class="small">Loading today's technical data…</p></section>
  ${DISC}
  <script>
  (function(){
    const SYM=${JSON.stringify(sym)}, inr=(v)=>v==null?'–':'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2}), n=(v,s='')=>v==null?'–':Number(v).toLocaleString('en-IN',{maximumFractionDigits:2})+s, e=(t)=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    function show(t){document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==t);document.querySelectorAll('.tab').forEach(b=>{const on=b.dataset.tab===t;b.classList.toggle('btn-outline',!on);b.setAttribute('aria-selected',on);});if(location.hash!=='#'+t)history.replaceState(null,'','#'+t);}
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>show(b.dataset.tab)));
    show(location.hash==='#technical'?'technical':'fundamental');
    const row=(k,v)=>'<tr><td style="padding:6px 8px;">'+k+'</td><td style="padding:6px 8px;text-align:right;"><strong>'+v+'</strong></td></tr>';
    fetch('/data/fundamentals.json').then(r=>r.json()).then(all=>{const f=all[SYM];const box=document.getElementById('fundamental');
      if(!f){box.innerHTML='<p>Fundamentals for this company are being compiled and will appear here after the next weekly update.</p>';return;}
      box.innerHTML='<h2>Fundamentals</h2>'+(f.sector?'<p class="small">Sector: '+e(f.sector)+'</p>':'')+'<p>'+e(f.about)+'</p><table style="width:100%;border-collapse:collapse;">'+
      row('Market cap',f.market_cap_cr==null?'–':'₹'+n(f.market_cap_cr)+' cr')+row('P/E ratio',n(f.pe))+row('P/B ratio',n(f.pb))+row('Return on equity (ROE)',n(f.roe_pct,'%'))+row('Return on capital (ROCE)',n(f.roce_pct,'%'))+row('Debt to equity',n(f.debt_to_equity))+row('Dividend yield',n(f.dividend_yield_pct,'%'))+row('Revenue growth (YoY, latest quarter)',n(f.revenue_growth_yoy_pct,'%'))+row('Profit growth (YoY, latest quarter)',n(f.profit_growth_yoy_pct,'%'))+'</table>'+
      (f.latest_results?'<h3>Latest results</h3><p>'+e(f.latest_results)+'</p>':'')+
      ((f.strengths||[]).length?'<h3>Strengths</h3><ul>'+f.strengths.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>':'')+((f.risks||[]).length?'<h3>Risks</h3><ul>'+f.risks.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>':'')+
      '<p class="small">Compiled with AI from public sources on '+e(f.compiled)+(f.as_of?' (data as of '+e(f.as_of)+')':'')+'. Figures can be wrong or out of date; check the company\\'s filings on NSE before relying on them.'+((f.sources||[]).length?' Sources: '+f.sources.map(s=>'<a href="'+e(s.uri)+'" target="_blank" rel="noopener nofollow">'+e(s.title||'link')+'</a>').join(', '):'')+'</p>';
    }).catch(()=>{document.getElementById('fundamental').innerHTML='<p>Fundamentals are unavailable right now.</p>';});
    fetch('/api/stock/'+encodeURIComponent(SYM)).then(r=>r.json()).then(j=>{const box=document.getElementById('technical');
      if(!j.success){box.innerHTML='<p>'+e(j.message||'Technical data is unavailable right now.')+'</p>';return;}const t=j.data;
      const pts=t.series,W=640,H=220,P=36,ys=pts.map(p=>p[1]),mn=Math.min(...ys),mx=Math.max(...ys),sp=mx-mn||1,x=i=>P+i*(W-2*P)/(pts.length-1),y=v=>H-P-(v-mn)*(H-2*P)/sp;
      const up=t.change1d>=0;
      box.innerHTML='<h2>Technical analysis</h2><p class="small">As of close on '+e(t.asOf)+' (delayed data)</p><p style="font-size:1.4rem;margin:6px 0;"><strong>'+inr(t.close)+'</strong> <span style="color:'+(up?'#22c55e':'#ef4444')+'">'+(up?'▲':'▼')+' '+n(Math.abs(t.change1d),'%')+'</span></p>'+
      '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Closing price, last 6 months" style="width:100%;height:auto;"><polyline points="'+pts.map((p,i)=>x(i).toFixed(1)+','+y(p[1]).toFixed(1)).join(' ')+'" fill="none" stroke="#38bdf8" stroke-width="2.5"/><text x="'+P+'" y="'+(y(mx)-6)+'" font-size="12" fill="currentColor" opacity=".7">'+inr(mx)+'</text><text x="'+P+'" y="'+(y(mn)+16)+'" font-size="12" fill="currentColor" opacity=".7">'+inr(mn)+'</text><text x="'+P+'" y="'+(H-8)+'" font-size="12" fill="currentColor" opacity=".7">'+e(pts[0][0])+'</text><text x="'+(W-P)+'" y="'+(H-8)+'" font-size="12" fill="currentColor" opacity=".7" text-anchor="end">'+e(pts[pts.length-1][0])+'</text></svg>'+
      '<table style="width:100%;border-collapse:collapse;margin-top:8px;">'+row('1-month change',n(t.change1m,'%'))+row('52-week high',inr(t.high52))+row('52-week low',inr(t.low52))+row('20-day moving average',inr(t.sma20))+row('50-day moving average',inr(t.sma50))+row('200-day moving average',inr(t.sma200))+row('RSI (14)',n(t.rsi14))+row('MACD / signal',n(t.macd)+' / '+n(t.macdSignal))+row('Volume (last day)',n(t.volume))+row('Average volume (20 days)',n(t.avgVolume20))+'</table>'+
      '<h3>What the indicators show</h3><ul>'+t.notes.map(x=>'<li>'+e(x)+'</li>').join('')+'</ul><p class="small">Indicators describe past price movement only and do not predict future prices. Price data: Yahoo Finance, delayed.</p>';
    }).catch(()=>{document.getElementById('technical').innerHTML='<p>Technical data is unavailable right now.</p>';});
  })();
  </script>`);
}

page('disclaimer', 'Disclaimer', `<h1>Disclaimer</h1>
  <p class="small">Last updated: 14 November 2026</p>
  <h2>Not a SEBI-registered adviser</h2>
  <p>Equity Investor Club and its founder, Amrith Kishore M, are <strong>not registered with the Securities and Exchange Board of India (SEBI)</strong> as an Investment Adviser under the SEBI (Investment Advisers) Regulations, 2013, or as a Research Analyst under the SEBI (Research Analysts) Regulations, 2014, and are not registered with any other financial regulator.</p>
  <h2>Education only</h2>
  <p>Everything on this website, including articles, quizzes, calculators, the stock search and our social media posts, is for <strong>general education and information only</strong>. Nothing here is investment, financial, tax or legal advice, a recommendation or solicitation to buy, sell or hold any security, or a research report. We do not give tips, calls, price targets or personalised advice, and we do not manage money or offer paid advisory services.</p>
  <h2>Market risk</h2>
  <p>Investments in the securities market are subject to market risks. Read all related documents carefully before investing. Prices can go down as well as up, and past performance does not guarantee future returns. Do your own research and, before making any investment decision, consult a SEBI-registered investment adviser. You can check whether an adviser is registered on the <a href="https://www.sebi.gov.in" target="_blank" rel="noopener">SEBI website</a>.</p>
  <h2>Accuracy and AI</h2>
  <p>Some articles are prepared with the help of AI tools. We try to keep information accurate and up to date, but we cannot guarantee it is complete, correct or current. Share price charts use delayed data from Yahoo Finance. Calculator results are illustrative and depend on the assumptions entered.</p>
  <h2>Holdings and conflicts of interest</h2>
  <p>Our founder invests in the stock market and may hold shares in companies discussed on this website. Current holdings are listed on our <a href="/holdings">holdings disclosure page</a>, and articles about a company the founder holds say so.</p>
  <h2>No affiliation</h2>
  <p>We are not affiliated with or endorsed by any company, exchange or fund house mentioned. Company names and trademarks belong to their owners.</p>
  <h2>Your responsibility</h2>
  <p>You are solely responsible for your own investment decisions. Equity Investor Club and its founder accept no liability for any loss arising from the use of this website.</p>`);

const takeaways = (body) => { const m = body.split(/^##\s+Key takeaways.*$/im)[1]; return m ? m.split(/^##\s/m)[0].split('\n').filter((l) => /^\s*[-*]\s/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '').trim()).slice(0, 4) : []; };
fs.writeFileSync('worker/posts.json', JSON.stringify(posts.map((p) => ({ id: p.slug, title: p.data.title, slug: p.slug, excerpt: p.excerpt, publish_at: p.data.date || null,
  cover: p.data.cover || '', category: p.data.category || '', tip: p.data.tip || '', takeaways: takeaways(p.body), quiz: Array.isArray(p.data.quiz) ? p.data.quiz.slice(0, 1) : [] }))));
console.log(`Built ${posts.length} article(s).`);
