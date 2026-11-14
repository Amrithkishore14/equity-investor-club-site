// Equity Investor Club - Cloudflare showcase.
// Public pages, calculators, quiz and stock search work fully.
// Accounts, payments and emails are switched off here, so this build holds no secrets.
// Articles come from the CMS at /cms (content/articles/*.md, built by build.js).
import stocks from './stocks.json';
import posts from './posts.json';

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
    el.append(`<p class="small"><a href="${IG}" target="_blank" rel="noopener">Follow @equityinvestorclub on Instagram</a></p>`, { html: true });
  }
}

class Remove {
  element(el) {
    el.remove();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
      return security(new HTMLRewriter().on('a[href="/login"]', new Remove()).on('a[href="/register"]', new Remove()).on('.footer-grid', new Instagram()).transform(res));
    return security(res);
  },
};
