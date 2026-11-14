// Equity Investor Club - Cloudflare showcase.
// Public pages, calculators, quiz and stock search work fully.
// Accounts, payments and emails are switched off here, so this build holds no secrets.
// Articles come from the CMS at /cms (content/articles/*.md, built by build.js).
import stocks from './stocks.json';
import posts from './posts.json';
import { technicals, refreshFundamentals, heldSymbols } from './stocks-analysis.js';
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

class ToolsLink {
  element(el) {
    el.append('<a href="/articles">Articles</a><a href="/holdings">My stocks</a><a href="/tools">Tools</a>', { html: true });
  }
}

class HideUnused {
  element(el) {
    el.append('<style>section:has(#pollContainer),section:has(#newsletterForm),#dailyPreview{display:none!important}</style>', { html: true });
  }
}

class Remove {
  element(el) {
    el.remove();
  }
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === '0 3 * * 0') { ctx.waitUntil(refreshFundamentals(env).then((r) => console.log('fundamentals', JSON.stringify(r)))); return; }
    const { hour } = londonParts();
    if (hour === 15) ctx.waitUntil(createDraft(env).then((r) => console.log('autopost', JSON.stringify(r))));
    if (hour === 21) ctx.waitUntil(publishToday(env).then((r) => console.log('autopublish', JSON.stringify(r))).then(() => pruneOld(env)).then((r) => console.log('prune', JSON.stringify(r))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/robot/run' && request.method === 'POST') {
      if (!env.RUN_KEY || request.headers.get('X-Run-Key') !== env.RUN_KEY) return json({ ok: false }, 403);
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
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/cms')) {
      const r = security(res);
      r.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return r;
    }
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/html'))
      return security(new HTMLRewriter().on('a[href="/login"]', new Remove()).on('a[href="/register"]', new Remove()).on('.footer-grid', new Instagram()).on('.nav-links a[href="/articles"]', new Remove()).on('.nav-links a[href="/tools"]', new Remove()).on('.nav-links', new ToolsLink()).on('head', new HideUnused()).on('script[src="/public/js/active.js"]', new Remove()).transform(res));
    return security(res);
  },
};
