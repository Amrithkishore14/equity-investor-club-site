// Equity Investor Club - Cloudflare showcase.
// Public pages, calculators, quiz and stock search work fully.
// Accounts, payments and emails are switched off here, so this build holds no secrets.
// Articles come from the CMS at /cms (content/articles/*.md, built by build.js).
import stocks from './stocks.json';
import posts from './posts.json';
import { createDraft, publishToday, pruneOld, londonParts } from './autopost.js';

const IG = 'https://www.instagram.com/equityinvestorclub/';
const NOTICE = 'Member accounts are not open yet. Follow @equityinvestorclub on Instagram for updates.';
const MEMBER_PAGES = ['/admin', '/user', '/watchlist', '/subscription-request'];

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
    if (p === '/api/daily/latest') return json({ success: true, update: null });
    if (p === '/api/news/latest') return json({ success: true, news: null });
    if (p === '/api/digest/latest') return json({ success: true, latest: null, archive: [] });
    if (p === '/api/poll') return json({ success: true, poll: null });
    if (p === '/api/articles') return json({ success: true, articles: posts });
    if (/^\/api\/articles\/\d+\/comments$/.test(p)) return json({ success: true, comments: [] });
    if (p.startsWith('/api/admin') || p.startsWith('/api/user') || p.startsWith('/api/watchlist') || p === '/api/certificate')
      return json({ success: false, message: 'Sign-in is switched off on this showcase.' }, 401);
    return json({ success: false, message: 'Not found' }, 404);
  }
  if (request.method === 'POST') return json({ success: false, message: NOTICE }, 403);
  return json({ success: false }, 405);
}

class Instagram {
  element(el) {
    el.append(`<p class="small"><a href="${IG}" target="_blank" rel="noopener">Follow @equityinvestorclub on Instagram</a><br>Founded by <a href="https://2026-updated-portfolio.amrithkishore6.workers.dev" target="_blank" rel="noopener">Amrith Kishore M</a></p>`, { html: true });
  }
}

class ToolsLink {
  element(el) {
    el.append('<a href="/tools">Tools</a>', { html: true });
  }
}

class Remove {
  element(el) {
    el.remove();
  }
}

export default {
  async scheduled(event, env, ctx) {
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
        const r = task === 'publish' ? await publishToday(env) : await createDraft(env, { force: url.searchParams.get('force') === '1' });
        return json(r);
      } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
    }
    if (url.pathname.startsWith('/api/')) return security(api(url, request));
    if (MEMBER_PAGES.some((m) => url.pathname === m || url.pathname.startsWith(m + '/')))
      return Response.redirect(new URL('/login', url).toString(), 302);
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/cms')) {
      const r = security(res);
      r.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return r;
    }
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/html'))
      return security(new HTMLRewriter().on('a[href="/login"]', new Remove()).on('a[href="/register"]', new Remove()).on('.footer-grid', new Instagram()).on('.nav-links', new ToolsLink()).on('script[src="/public/js/active.js"]', new Remove()).transform(res));
    return security(res);
  },
};
