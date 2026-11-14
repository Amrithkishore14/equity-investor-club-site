// Daily auto-post robot for Equity Investor Club.
// 3pm UK: if Money Pechu (Anand Srinivasan) posted a video today, Gemini watches it and
// writes an original article in our own words (English + Tamil) with a quiz; Workers AI makes the cover image,
// and save it to the CMS as a DRAFT. 9pm UK: publish today's robot draft unless it is on hold,
// then remove robot posts older than KEEP_DAYS.

const CHANNEL_ID = 'UC7fQFl37yAOaPaoxQm-TqSA'; // Money Pechu
const REPO = 'Amrithkishore14/equity-investor-club-site';
const DIR = 'content/articles';
const IMAGE = '@cf/black-forest-labs/flux-1-schnell';
export const KEEP_DAYS = 30; // robot posts older than this are removed to keep the site light
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

export const londonParts = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------- GitHub ----------
const b64 = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
const unb64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
async function gh(env, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'eic-autopost', Accept: 'application/vnd.github+json', ...(init.headers || {}) },
  });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub ${path} ${res.status}`);
  return res.status === 404 ? null : res.json();
}
const putFile = (env, path, contentB64, message, sha) =>
  gh(env, `contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: contentB64, branch: 'main', ...(sha ? { sha } : {}) }) });

// ---------- YouTube ----------
function extractJson(s) {
  if (s && typeof s === 'object') return s;
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  const raw = s.slice(a, b + 1);
  try { return JSON.parse(raw); } catch (e) {}
  // Escape raw control characters that appear inside string values.
  let out = '', inStr = false, esc = false;
  for (const ch of raw) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      if (ch.charCodeAt(0) < 32) continue;
      out += ch;
    } else { if (ch === '"') inStr = true; out += ch; }
  }
  return JSON.parse(out);
}

async function coverImage(env, prompt) {
  const r = await env.AI.run(IMAGE, { prompt: `${prompt}. Flat editorial illustration, deep navy and emerald green palette, finance theme, no text`, steps: 6 });
  return r.image; // base64 jpeg
}

async function priceChart(symbol) {
  const sym = String(symbol || '').toUpperCase().replace(/[^A-Z0-9&-]/g, '');
  if (!sym) return null;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}.NS?range=1mo&interval=1d`, { headers: { 'User-Agent': UA } });
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const ts = res?.timestamp || [], close = res?.indicators?.quote?.[0]?.close || [];
    const points = ts.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), close[i] == null ? null : Math.round(close[i] * 100) / 100]).filter((p) => p[1] != null);
    return points.length >= 5 ? { symbol: sym, points } : null;
  } catch (e) { return null; }
}

const slugify = (s) => { const x = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return x.length <= 60 ? x : x.slice(0, 60).replace(/-[^-]*$/, ''); };

// ---------- Gemini (watches the YouTube video directly, writes English + Tamil) ----------
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];
const PROMPT = `You write for Equity Investor Club, a financial-literacy website for beginner investors in India, founded by Amrith Kishore M.
Watch this video (usually in Tamil) to learn today's topic, then write an ORIGINAL educational article in your own words, as Equity Investor Club.
Rules:
- Never mention the video, YouTube, any channel, presenter, speaker or "an expert said". Write as our own explanation of the topic.
- Do not copy sentences. Only use facts and numbers actually stated in the video; if unsure of a number, leave it out.
- Never give buy/sell/hold advice on a specific stock; explain the idea and what a beginner should understand.
- Calm, simple language for beginners.
- Use Google Search to check the key facts against reputable news (for example The Economic Times, Mint, Business Standard, The Hindu BusinessLine, Moneycontrol, Times of India). Where a news outlet reported a fact, say so naturally in the article, e.g. "as reported by The Economic Times". Never cite or mention the video or its creator.
Return JSON with these keys:
"understood": true if you could actually watch and follow the video, otherwise false,
"title" (max 70 chars), "summary" (1-2 sentences), "category" (one of: Basics, Stock market, Mutual funds, Personal finance, Market update),
"body" (English markdown, 350-600 words, with ## headings "What happened", "What it means for you", "Key takeaways" (bullet list) and "Jargon buster" (2-3 terms)),
"title_ta", "summary_ta", "body_ta" (natural, fluent Tamil versions of the same, same headings in Tamil, markdown),
"quiz" (array of 3 objects {"q", "options" (4 short options), "answer" (index 0-3)}, in English),
"tip" (one short, original money lesson for beginners linked to this topic, max 25 words, not a quote and not attributed to anyone),
"companies" (array of up to 2 objects {"name", "nse_symbol"} for Indian listed companies that are the main subject, e.g. {"name":"Tata Steel","nse_symbol":"TATASTEEL"}; empty array if none),
"image_prompt" (a specific scene for the cover that matches the subject, e.g. for a steel company "a modern steel plant with glowing molten steel and rolled steel coils"; no text, no logos, no real people),
"check" (one short sentence naming the specific fact or number the editor should verify, e.g. a rupee figure or date; or "").`;

async function geminiArticle(env, video) {
  // First try with Google Search (for news citations); fall back to video-only JSON mode.
  for (const withSearch of [true, false]) {
    try { return await geminiOnce(env, video, withSearch); } catch (e) { if (!withSearch) throw e; }
  }
}

async function geminiOnce(env, video, withSearch) {
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ file_data: { file_uri: `https://www.youtube.com/watch?v=${video.id}` } }, { text: `Video title: ${video.title}\n\n${PROMPT}\nReply with the JSON object only.` }] }],
        ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: withSearch ? { temperature: 0.4 } : { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    });
    if (!res.ok) { lastErr = `${model}: ${res.status} ${(await res.text()).slice(0, 200)}`; continue; }
    const j = await res.json();
    const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return extractJson(text);
  }
  throw new Error(`Gemini failed - ${lastErr}`);
}

// ---------- Jobs ----------
async function recentVideos() {
  const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: { 'User-Agent': UA } })).text();
  return xml.split('<entry>').slice(1).map((entry) => {
    const pick = (tag) => decode((entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || '');
    return { id: pick('yt:videoId'), title: pick('title'), published: pick('published') };
  });
}

export async function createDraft(env, { force = false, videoId = '', publish = false, replace = false } = {}) {
  if (!env.GITHUB_TOKEN) return { ok: false, reason: 'GITHUB_TOKEN secret missing' };
  if (!env.GEMINI_API_KEY) return { ok: false, reason: 'GEMINI_API_KEY secret missing' };
  const videos = await recentVideos();
  const video = videoId ? videos.find((v) => v.id === videoId) : videos[0];
  if (!video) return { ok: false, reason: 'video not found in the channel feed' };
  const today = londonParts().date;
  const day = londonParts(new Date(video.published)).date;
  const existing = (await gh(env, `contents/${DIR}`)) || [];
  const sameDay = existing.filter((f) => f.name.startsWith(`${day}-auto-`));
  if (!videoId && !force && day !== today) return { ok: true, skipped: `no new video today (latest: ${video.published})` };
  if (sameDay.length && !replace && !force) return { ok: true, skipped: `already have a post for ${day}` };

  const a = await geminiArticle(env, video);
  if (!a.understood || !a.title || !a.body) {
    if (videoId) return { ok: true, skipped: `video not understood: ${video.title}` };
    const slug = `${day}-auto-robot-note`;
    const fm = { title: `Robot note: could not read today's topic`, date: new Date().toISOString(), draft: true, hold: true, auto: true,
      note: `The robot could not properly follow today's source, so it did not write an article. You can write one yourself or delete this note.` };
    await putFile(env, `${DIR}/${slug}.md`, b64(`---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n`), 'Robot note');
    return { ok: true, note: slug };
  }

  if (replace) for (const f of sameDay) {
    await gh(env, `contents/${f.path}`, { method: 'DELETE', body: JSON.stringify({ message: `Replace ${f.name}`, sha: f.sha, branch: 'main' }) });
    const img = await gh(env, `contents/site/public/uploads/auto/${f.name.replace(/\.md$/, '.jpg')}`);
    if (img && img.sha) await gh(env, `contents/${img.path}`, { method: 'DELETE', body: JSON.stringify({ message: `Remove ${img.name}`, sha: img.sha, branch: 'main' }) });
  }

  const slug = `${day}-auto-${slugify(a.title)}`;
  let cover = '';
  let note = a.check ? `Please verify: ${a.check}` : '';
  try {
    const img = await coverImage(env, a.image_prompt || a.title);
    if (img) { await putFile(env, `site/public/uploads/auto/${slug}.jpg`, img, `Cover image for ${a.title}`); cover = `/public/uploads/auto/${slug}.jpg`; }
  } catch (e) { note += ' (Cover image could not be generated.)'; }
  const companies = Array.isArray(a.companies) ? a.companies.slice(0, 2) : [];
  let chart = null;
  for (const c of companies) { chart = await priceChart(c.nse_symbol); if (chart) { chart.name = c.name; break; } }

  const when = day === today ? new Date() : new Date(video.published);
  const fm = {
    title: a.title, date: when.toISOString(), summary: a.summary || '', category: a.category || 'Market update', cover,
    draft: !publish, hold: false, auto: true, note: note.trim(),
    title_ta: a.title_ta || '', summary_ta: a.summary_ta || '', tip: a.tip || '',
    quiz: Array.isArray(a.quiz) ? a.quiz.slice(0, 3) : [],
    ...(chart ? { chart } : {}),
    body_ta: a.body_ta || '',
  };
  const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  await putFile(env, `${DIR}/${slug}.md`, b64(`---\n${yaml}\n---\n${String(a.body).trim()}\n`), `${publish ? 'New article' : 'Robot draft'}: ${a.title}`);
  return { ok: true, created: slug, chart: chart ? chart.symbol : null };
}

export async function listRecent(days = 10) {
  const cutoff = Date.now() - days * 864e5;
  return (await recentVideos()).filter((v) => Date.parse(v.published) >= cutoff).map((v) => ({ id: v.id, title: v.title, date: londonParts(new Date(v.published)).date }));
}

export async function publishToday(env) {
  if (!env.GITHUB_TOKEN) return { ok: false };
  const today = londonParts().date;
  const files = ((await gh(env, `contents/${DIR}`)) || []).filter((f) => f.name.startsWith(`${today}-auto-`));
  const done = [];
  for (const f of files) {
    const file = await gh(env, `contents/${f.path}`);
    const text = unb64(file.content);
    const head = text.split('\n---')[0];
    if (!/^draft:\s*true/m.test(head) || /^hold:\s*true/m.test(head)) continue;
    const updated = text.replace(/^draft:\s*true/m, 'draft: false');
    await putFile(env, f.path, b64(updated), `Auto-publish: ${f.name}`, file.sha);
    done.push(f.name);
  }
  return { ok: true, published: done };
}

// Remove robot posts (and their cover images) older than KEEP_DAYS. Your own articles are never touched.
export async function pruneOld(env) {
  if (!env.GITHUB_TOKEN) return { ok: false };
  const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5);
  const old = ((await gh(env, `contents/${DIR}`)) || []).filter((f) => {
    const m = f.name.match(/^(\d{4}-\d{2}-\d{2})-auto-/);
    return m && new Date(m[1]) < cutoff;
  });
  const removed = [];
  for (const f of old) {
    await gh(env, `contents/${f.path}`, { method: 'DELETE', body: JSON.stringify({ message: `Remove robot post older than ${KEEP_DAYS} days: ${f.name}`, sha: f.sha, branch: 'main' }) });
    const img = await gh(env, `contents/site/public/uploads/auto/${f.name.replace(/\.md$/, '.jpg')}`);
    if (img && img.sha) await gh(env, `contents/${img.path}`, { method: 'DELETE', body: JSON.stringify({ message: `Remove old cover ${img.name}`, sha: img.sha, branch: 'main' }) });
    removed.push(f.name);
  }
  return { ok: true, removed };
}
