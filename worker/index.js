// Equity Investor Club - Cloudflare showcase.
// Public pages, calculators, quiz and stock search work fully.
// Accounts, payments and emails are switched off here, so this build holds no secrets.
// Articles come from the CMS at /cms (content/articles/*.md, built by build.js).
import stocks from './stocks.json';
import posts from './posts.json';
import { technicals, refreshFundamentals, heldSymbols } from './stocks-analysis.js';
import holdingsData from '../content/holdings.json';
import { createDraft, publishToday, pruneOld, listRecent, scrubAll, redoCovers, londonParts } from './autopost.js';

const IG = 'https://www.instagram.com/equityinvestorclub/';
const NOTICE = 'Member accounts are not open yet. Follow @equityinvestorclub on Instagram for updates.';
const MEMBER_PAGES = ['/admin', '/user', '/watchlist', '/subscription-request', '/subscriptions', '/certificate', '/login', '/register', '/forgot-password'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function security(res) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if ((h.get('content-type') || '').includes('text/html') && !h.has('Content-Security-Policy'))
    h.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.github.com https://*.githubusercontent.com https://unpkg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'");
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('X-Permitted-Cross-Domain-Policies', 'none');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  return r;
}

function api(url, request) {
  const p = url.pathname;
  if (request.method === 'GET') {
    if (p === '/api/me') return json({ success: false }, 401);
    if (p === '/api/stocks/search') {
      const t = (url.searchParams.get('q') || '').toLowerCase().slice(0, 40);
      const results = t ? stocks.filter((s) => s.symbol.toLowerCase().includes(t) || s.stock_name.toLowerCase().includes(t)).slice(0, 15) : [];
      return json({ success: true, results });
    }
    const latest = posts[0];
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (p === '/api/daily/latest') return json({ success: true, update: latest ? { id: latest.id, created_at: latest.publish_at, preview: false,
      html: `<h3 style="margin:0 0 6px;">${esc(latest.title)}</h3>${latest.cover ? `<img src="${esc(latest.cover)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;margin:6px 0;">` : ''}<p>${esc(latest.excerpt)}</p><a class="btn" href="/articles/${esc(latest.slug)}">Read today's article</a>` } : null });
    if (p === '/api/news/latest') return json({ success: true, news: latest && latest.takeaways.length ? { id: latest.id, updated_at: latest.publish_at, content: latest.takeaways.join('  •  ') } : null });
    if (p === '/api/quote/latest') { const t = posts.find((x) => x.tip); return json({ success: true, quote: t ? { content: t.tip, publish_at: t.publish_at } : null }); }
    if (p === '/api/weekly/latest') { const wk = posts.filter((x) => Date.now() - Date.parse(x.publish_at) < 7 * 864e5);
      return json({ success: true, summary: wk.length ? { publish_at: wk[0].publish_at, content: wk.map((x) => `• ${x.title}: ${x.excerpt}`).join('\n') } : null }); }
    if (p === '/api/digest/latest') return json({ success: true, latest: null, archive: [] });
    if (p === '/api/poll') return json({ success: true, poll: null });
    if (p === '/api/articles') return json({ success: true, articles: posts });
    if (/^\/api\/articles\/\d+\/comments$/.test(p)) return json({ success: true, comments: [] });
    if (p.startsWith('/api/admin') || p.startsWith('/api/user') || p.startsWith('/api/watchlist') || p === '/api/certificate')
      return json({ success: false, message: 'Sign-in is switched off on this showcase.' }, 401);
    return json({ success: false, message: 'Not found' }, 404);
  }
  if (request.method === 'POST' && ['/api/contact', '/api/inquiry', '/api/newsletter'].includes(p))
    return json({ success: false, message: 'This form is not connected yet. Please message @equityinvestorclub on Instagram or email amrithkishore6@gmail.com.' }, 503);
  if (request.method === 'POST') return json({ success: false, message: NOTICE }, 403);
  return json({ success: false }, 405);
}

class Instagram {
  element(el) {
    el.append(`<p class="small"><a href="${IG}" target="_blank" rel="noopener">Follow @equityinvestorclub on Instagram</a><br>Founded by <a href="https://2026-updated-portfolio.amrithkishore6.workers.dev" target="_blank" rel="noopener">Amrith Kishore M</a></p><p class="small">Not registered with SEBI as an Investment Adviser or Research Analyst. Education only, not investment advice. Investments are subject to market risks. <a href="/disclaimer">Disclaimer</a> · <a href="/holdings">Holdings disclosure</a></p>`, { html: true });
  }
}

const NAV = [['/', 'Home'], ['/learn', 'Learn'], ['/articles', 'Articles'], ['/holdings/', 'My stocks'], ['/tools', 'Tools'], ['/glossary', 'Glossary'], ['/about', 'About']];
class StandardNav {
  constructor(path) { this.path = path.replace(/\/$/, '') || '/'; }
  element(el) {
    const isActive = (h) => { const b = h.replace(/\/$/, '') || '/'; return b === '/' ? this.path === '/' : this.path === b || this.path.startsWith(b + '/') || (b === '/tools' && /calculator|risk-quiz/.test(this.path)) || (b === '/holdings' && this.path.startsWith('/stocks')); };
    el.setInnerContent(NAV.map(([h, t]) => `<a href="${h}"${isActive(h) ? ' class="active" aria-current="page"' : ''}>${t}</a>`).join(''), { html: true });
  }
}
class StandardActions {
  element(el) {
    el.setInnerContent('<label class="toggle" for="themeSwitch"><input type="checkbox" id="themeSwitch" aria-label="Light theme" /><span>Light</span></label>', { html: true });
  }
}
class HideUnused {
  element(el) {
    el.append('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Manrope:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;600&display=swap"><link rel="stylesheet" href="/public/css/eic-2026.css"><link rel="stylesheet" href="/public/css/eic-fx.css">', { html: true });
    el.append('<style>section:has(#pollContainer),section:has(#newsletterForm),#dailyPreview{display:none!important}</style>', { html: true });
  }
}

class MarketBoard {
  element(el) {
    el.setInnerContent('<div id="fxHero" class="fx-hero-card"><div class="fx-label"><span class="fx-dot"></span>Loading live market…</div><div class="fx-big">—</div></div>', { html: true });
  }
}

class HeatMap {
  element(el) {
    el.after('<section class="section" id="mystocks-heat"><div class="flex-between"><h2>My stocks today</h2><a class="btn btn-outline" href="/holdings">All analysis</a></div><p class="lead">The companies I invest in, coloured by today\'s move. Tap one for its technical and fundamental analysis.</p><div id="fxHeat" class="fx-heat"><p class="small">Loading…</p></div><div class="fx-legend"><span>Down</span><i></i><span>Up</span><span>· Delayed prices, education only</span></div></section>', { html: true });
  }
}

class FxAssets {
  element(el) {
    el.append('<script src="/public/js/eic-fx.js" defer></script>', { html: true });
  }
}

class HostFix {
  constructor(origin) { this.origin = origin; }
  element(el) {
    for (const a of ['href', 'content']) {
      const v = el.getAttribute(a);
      if (v && v.includes('equityinvestorclub.com')) el.setAttribute(a, v.replace(/https?:\/\/(www\.)?equityinvestorclub\.com/g, this.origin));
      else if (v && a === 'content' && v.startsWith('/')) el.setAttribute(a, this.origin + v);
    }
  }
}

class ContactCta {
  element(el) {
    el.replace(`<div class="update-card"><h3>Get in touch</h3><p>The quickest way to reach us is a message on Instagram. You can also use the email shown on our <a href="/contact">contact page</a>.</p><p style="margin-top:12px;"><a class="btn" href="https://www.instagram.com/equityinvestorclub/" target="_blank" rel="noopener">Message on Instagram</a></p><p class="small" style="margin-top:10px;">We share education only and never give personal investment advice.</p></div>`, { html: true });
  }
}

class Remove {
  element(el) {
    el.remove();
  }
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === '0 3 * * SUN') { ctx.waitUntil(refreshFundamentals(env).then((r) => console.log('fundamentals', JSON.stringify(r)))); return; }
    // India has no daylight saving, so these are fixed: 11:30 UTC = 5:00pm IST, 12:30 UTC = 6:00pm IST.
    if (event.cron === '30 11 * * *') ctx.waitUntil(createDraft(env).then((r) => console.log('autopost', JSON.stringify(r))));
    if (event.cron === '30 12 * * *') ctx.waitUntil(publishToday(env).then((r) => console.log('autopublish', JSON.stringify(r))).then(() => pruneOld(env)).then((r) => console.log('prune', JSON.stringify(r))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/robot/run' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'x';
      if (env.RL_ADMIN) { const { success } = await env.RL_ADMIN.limit({ key: ip }); if (!success) return json({ ok: false }, 429); }
      const given = request.headers.get('X-Run-Key') || '';
      const a = new TextEncoder().encode(given), b = new TextEncoder().encode(env.RUN_KEY || '');
      let diff = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
      if (!env.RUN_KEY || diff !== 0) return json({ ok: false }, 403);
      try {
        const task = url.searchParams.get('task');
        const q = (k) => url.searchParams.get(k);
        const r = task === 'publish' ? await publishToday(env)
          : task === 'list' ? await listRecent(Number(q('days') || 10))
          : task === 'scrub' ? await scrubAll(env)
          : task === 'covers' ? await redoCovers(env, q('only') || '')
          : task === 'fundamentals' ? await refreshFundamentals(env, q('only') || '')
          : await createDraft(env, { force: q('force') === '1', videoId: q('video') || '', publish: q('publish') === '1', replace: q('replace') === '1' });
        return json(r);
      } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
    }
    if (url.pathname.startsWith('/api/') && env.RL_API) {
      const { success } = await env.RL_API.limit({ key: request.headers.get('CF-Connecting-IP') || 'x' });
      if (!success) return security(json({ success: false, message: 'Too many requests. Please slow down.' }, 429));
    }
    if (url.pathname === '/api/ticker' && request.method === 'GET') {
      const cache = caches.default, key = new Request('https://cache.local/ticker-v1');
      const hit = await cache.match(key);
      if (hit) return security(hit);
      const yf = async (sym, range = '1mo') => {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const res = (await r.json())?.chart?.result?.[0];
        const ts = res.timestamp || [], c = res.indicators?.quote?.[0]?.close || [];
        const rows = ts.map((t, i) => [t, c[i]]).filter((x) => x[1] != null);
        const last = rows[rows.length - 1][1], prev = rows[rows.length - 2][1];
        return { t: rows[rows.length - 1][0], price: Math.round(last * 100) / 100, change: Math.round((last - prev) * 100) / 100, pct: Math.round(((last - prev) / prev) * 10000) / 100, spark: rows.slice(-22).map((x) => Math.round(x[1] * 100) / 100) };
      };
      const idx = [['Nifty 50', '%5ENSEI'], ['Sensex', '%5EBSESN'], ['Bank Nifty', '%5ENSEBANK'], ['Gold', 'GOLDBEES.NS']];
      const held = (holdingsData.stocks || []);
      const [ir, sr] = await Promise.all([
        Promise.allSettled(idx.map(([, s]) => yf(s))),
        Promise.allSettled(held.map((h) => yf(encodeURIComponent(String(h.symbol).toUpperCase()) + '.NS', '5d'))),
      ]);
      const indices = ir.map((r, i) => r.status === 'fulfilled' ? { name: idx[i][0], ...r.value } : null).filter(Boolean);
      const stocks = sr.map((r, i) => r.status === 'fulfilled' ? { name: String(held[i].symbol).toUpperCase(), symbol: String(held[i].symbol).toUpperCase(), full: held[i].name, price: r.value.price, pct: r.value.pct } : null).filter(Boolean);
      const asOf = indices[0] ? new Date(indices[0].t * 1000).toISOString().slice(0, 10) : '';
      const res = json({ success: indices.length + stocks.length > 0, asOf, indices, stocks });
      res.headers.set('Cache-Control', 'public, max-age=900');
      if (indices.length) await cache.put(key, res.clone());
      return security(res);
    }
    const sm = url.pathname.match(/^\/api\/stock\/([A-Za-z0-9&%-]+)$/);
    if (sm && request.method === 'GET') {
      const sym = decodeURIComponent(sm[1]).toUpperCase();
      if (!heldSymbols().includes(sym)) return security(json({ success: false, message: 'Not tracked' }, 404));
      const cache = caches.default, key = new Request(`https://cache.local/stock/${sym}`);
      const hit = await cache.match(key);
      if (hit) return security(hit);
      try {
        const res = json({ success: true, data: await technicals(sym) });
        res.headers.set('Cache-Control', 'public, max-age=21600');
        await cache.put(key, res.clone());
        return security(res);
      } catch (e) { return security(json({ success: false, message: 'Price data is unavailable right now. Please try again later.' }, 502)); }
    }
    if (url.pathname.startsWith('/api/')) return security(api(url, request));
    if (MEMBER_PAGES.some((m) => url.pathname === m || url.pathname.startsWith(m + '/')))
      return Response.redirect(new URL('/', url).toString(), 302);
    if (url.pathname === '/.well-known/security.txt') return new Response(`Contact: https://www.instagram.com/equityinvestorclub/\nExpires: 2027-11-14T00:00:00.000Z\nPreferred-Languages: en, ta\n`, { headers: { 'content-type': 'text/plain' } });
    if (url.pathname === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nDisallow: /cms\nDisallow: /api/\n\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
    if (url.pathname === '/sitemap.xml') {
      const r = await env.ASSETS.fetch(new Request(new URL('/sitemap.xml', url)));
      let x = (await r.text()).replace(/https?:\/\/(www\.)?equityinvestorclub\.com/g, url.origin);
      const extra = [...posts.map((p) => `/articles/${p.slug}/`), '/holdings/', ...heldSymbols().map((s) => `/stocks/${encodeURIComponent(s)}/`)]
        .map((u) => `  <url><loc>${url.origin}${u}</loc></url>`).join('\n');
      x = x.replace('</urlset>', `${extra}\n</urlset>`);
      return new Response(x, { headers: { 'content-type': 'application/xml' } });
    }
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/cms')) {
      const r = security(res);
      r.headers.delete('Content-Security-Policy'); // the CMS loads its editor from unpkg and talks to GitHub
      r.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return r;
    }
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/html'))
      return security(new HTMLRewriter().on('a[href="/login"]', new Remove()).on('a[href="/register"]', new Remove()).on('.footer-grid', new Instagram()).on('.nav-links', new StandardNav(url.pathname)).on('header .actions', new StandardActions()).on('head', new HideUnused()).on('link[rel="canonical"]', new HostFix(url.origin)).on('meta[property^="og:"]', new HostFix(url.origin)).on('meta[name^="twitter:"]', new HostFix(url.origin)).on('form#contactForm', new ContactCta()).on('form#inquiryForm', new ContactCta()).on('.hero-visual', new MarketBoard()).on('section.hero', new HeatMap()).on('body', new FxAssets()).on('script[src="/public/js/active.js"]', new Remove()).transform(res));
    return security(res);
  },
};
