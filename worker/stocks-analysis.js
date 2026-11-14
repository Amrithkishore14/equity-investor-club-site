// Technical analysis (live, from delayed daily prices) and fundamentals (weekly, AI-compiled
// from public sources) for the founder's holdings only.
import holdings from '../content/holdings.json';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const REPO = 'Amrithkishore14/equity-investor-club-site';
export const heldSymbols = () => (holdings.stocks || []).map((s) => String(s.symbol).toUpperCase());
const yahooSym = (s) => encodeURIComponent(s.toUpperCase()) + '.NS';

const sma = (a, n) => (a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : null);
function ema(a, n) { if (a.length < n) return []; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((x, y) => x + y, 0) / n; const out = [e]; for (const v of a.slice(n)) { e = v * k + e * (1 - k); out.push(e); } return out; }
function rsi(a, n = 14) {
  if (a.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < a.length; i++) { const d = a[i] - a[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
const r2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

export async function technicals(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym(symbol)}?range=1y&interval=1d`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`price data ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts = r?.timestamp || [], q = r?.indicators?.quote?.[0] || {};
  const rows = ts.map((t, i) => ({ d: new Date(t * 1000).toISOString().slice(0, 10), c: q.close?.[i], v: q.volume?.[i] })).filter((x) => x.c != null);
  if (rows.length < 30) throw new Error('not enough price history');
  const c = rows.map((x) => x.c), last = c[c.length - 1], prev = c[c.length - 2];
  const e12 = ema(c, 12), e26 = ema(c, 26);
  const macdLine = e26.map((v, i) => e12[i + 14] - v);
  const signal = ema(macdLine, 9);
  const vols = rows.map((x) => x.v || 0);
  const t = {
    symbol, asOf: rows[rows.length - 1].d, close: r2(last), change1d: r2(((last - prev) / prev) * 100),
    change1m: c.length > 21 ? r2(((last - c[c.length - 22]) / c[c.length - 22]) * 100) : null,
    high52: r2(Math.max(...c)), low52: r2(Math.min(...c)),
    sma20: r2(sma(c, 20)), sma50: r2(sma(c, 50)), sma200: r2(sma(c, 200)), rsi14: r2(rsi(c)),
    macd: r2(macdLine[macdLine.length - 1]), macdSignal: r2(signal[signal.length - 1]),
    volume: vols[vols.length - 1], avgVolume20: Math.round(sma(vols, 20) || 0),
    series: rows.slice(-120).map((x) => [x.d, r2(x.c)]),
  };
  const notes = [];
  for (const [k, label] of [['sma50', '50-day'], ['sma200', '200-day']]) if (t[k]) notes.push(`Price is ${last >= t[k] ? 'above' : 'below'} its ${label} moving average (₹${t[k]}).`);
  if (t.rsi14 != null) notes.push(`RSI (14) is ${t.rsi14}${t.rsi14 >= 70 ? ', in the range usually called "overbought"' : t.rsi14 <= 30 ? ', in the range usually called "oversold"' : ', in the neutral range'}.`);
  if (t.macd != null && t.macdSignal != null) notes.push(`MACD (${t.macd}) is ${t.macd >= t.macdSignal ? 'above' : 'below'} its signal line (${t.macdSignal}).`);
  notes.push(`It is ${r2(((t.high52 - last) / t.high52) * 100)}% below its 52-week high and ${r2(((last - t.low52) / t.low52) * 100)}% above its 52-week low.`);
  t.notes = notes;
  return t;
}

// ---- Weekly fundamentals via Gemini with Google Search grounding ----
const FPROMPT = (name, sym) => `Using Google Search, compile the latest publicly reported fundamentals for ${name} (NSE: ${sym}), an Indian listed company or ETF.
Return ONLY a JSON object with keys:
"as_of" (date of the latest data you used, YYYY-MM-DD), "sector", "about" (2 plain sentences on what the business does),
"market_cap_cr" (₹ crore, number or null), "pe" (number or null), "pb" (number or null), "roe_pct" (number or null), "roce_pct" (number or null),
"debt_to_equity" (number or null), "dividend_yield_pct" (number or null),
"revenue_growth_yoy_pct" (latest reported quarter vs same quarter last year, number or null), "profit_growth_yoy_pct" (same, number or null),
"latest_results" (1-2 factual sentences on the most recent quarterly results),
"strengths" (2-3 short factual points), "risks" (2-3 short factual points).
Use null rather than guessing. Do not give any buy, sell, hold or target-price opinion.`;

export async function fundamentals(env, name, sym) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: FPROMPT(name, sym) }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j = await res.json();
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  const data = JSON.parse(text.slice(a, b + 1));
  data.sources = (cand?.groundingMetadata?.groundingChunks || []).map((g) => g.web && { title: g.web.title, uri: g.web.uri }).filter(Boolean).slice(0, 4);
  data.compiled = new Date().toISOString().slice(0, 10);
  return data;
}

const b64 = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin); };
async function gh(env, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { ...init, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'eic-fundamentals', Accept: 'application/vnd.github+json', ...(init.headers || {}) } });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub ${res.status}`);
  return res.status === 404 ? null : res.json();
}

// Refresh fundamentals for all holdings (or one symbol) and commit them as one JSON file.
export async function refreshFundamentals(env, only = '') {
  const path = 'content/fundamentals.json';
  const cur = await gh(env, `contents/${path}`);
  let all = {};
  if (cur?.content) { try { all = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)))); } catch (e) {} }
  const done = [], failed = [];
  for (const s of holdings.stocks || []) {
    const sym = String(s.symbol).toUpperCase();
    if (only && sym !== only.toUpperCase()) continue;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try { all[sym] = await fundamentals(env, s.name, sym); done.push(sym); ok = true; }
      catch (e) {
        if (attempt === 1 || !/429|503/.test(e.message)) failed.push(`${sym}: ${e.message}`);
        else await new Promise((r) => setTimeout(r, 30000)); // rate limited: wait and try once more
      }
    }
    if (!only) await new Promise((r) => setTimeout(r, 8000)); // stay under the free per-minute limit
  }
  if (!done.length) return { ok: false, updated: 0, failed }; // nothing new: don't commit
  for (const k of Object.keys(all)) if (!heldSymbols().includes(k)) delete all[k];
  await gh(env, `contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `Fundamentals refresh (${done.length} updated)`, content: b64(JSON.stringify(all, null, 1)), branch: 'main', ...(cur?.sha ? { sha: cur.sha } : {}) }) });
  return { ok: true, updated: done.length, failed };
}
