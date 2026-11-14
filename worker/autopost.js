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
async function latestVideo() {
  const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: { 'User-Agent': UA } })).text();
  const entry = xml.split('<entry>')[1];
  if (!entry) return null;
  const pick = (tag) => decode((entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || '');
  return { id: pick('yt:videoId'), title: pick('title'), published: pick('published'), description: pick('media:description') };
}

// ---------- AI ----------
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

const slugify = (s) => { const x = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return x.length <= 60 ? x : x.slice(0, 60).replace(/-[^-]*$/, ''); };

// ---------- Gemini (watches the YouTube video directly, writes English + Tamil) ----------
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];
const PROMPT = `You are the editor of Equity Investor Club, a financial-literacy website for beginner investors in India.
Watch this video (it is usually in Tamil) and write an ORIGINAL educational article in your own words about its main ideas.
Rules: do not copy sentences from the video; only use facts and numbers actually said in the video; never give buy/sell/hold advice on a specific stock - explain the idea and what a beginner should understand instead; keep the tone calm and simple.
Return JSON with these keys:
"understood": true if you could actually watch and follow the video, otherwise false,
"title" (max 70 chars), "summary" (1-2 sentences), "category" (one of: Basics, Stock market, Mutual funds, Personal finance, Market update),
"body" (English markdown, 350-600 words, with ## headings "What happened", "What it means for you", "Key takeaways" (bullet list) and "Jargon buster" (2-3 terms)),
"title_ta", "summary_ta", "body_ta" (natural, fluent Tamil versions of the same, same headings in Tamil, markdown),
"quiz" (array of 3 objects {"q", "options" (4 short options), "answer" (index 0-3)}, in English, based on the article),
"image_prompt" (a short description of a clean editorial illustration for the cover; no text, no logos, no real people),
"check" (one short sentence naming the specific fact or number from the video the editor should verify before publishing, for example a rupee figure or a date; or "" if there is nothing).`;

async function geminiArticle(env, video) {
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ file_data: { file_uri: `https://www.youtube.com/watch?v=${video.id}` } }, { text: `Video title: ${video.title}\n\n${PROMPT}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
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
export async function createDraft(env, { force = false } = {}) {
  if (!env.GITHUB_TOKEN) return { ok: false, reason: 'GITHUB_TOKEN secret missing' };
  if (!env.GEMINI_API_KEY) return { ok: false, reason: 'GEMINI_API_KEY secret missing' };
  const today = londonParts().date;
  const existing = (await gh(env, `contents/${DIR}`)) || [];
  if (!force && existing.some((f) => f.name.startsWith(`${today}-auto-`))) return { ok: true, skipped: 'already posted today' };

  const video = await latestVideo();
  if (!video) return { ok: false, reason: 'could not read the channel feed' };
  if (londonParts(new Date(video.published)).date !== today && !force) return { ok: true, skipped: `no new video today (latest: ${video.published})` };

  const a = await geminiArticle(env, video);
  if (!a.understood || !a.title || !a.body) {
    // Don't guess. Leave a held note in the CMS instead of an article.
    const slug = `${today}-auto-robot-note`;
    const fm = { title: `Robot note: could not read today's video`, date: new Date().toISOString(), draft: true, hold: true, auto: true,
      note: `The robot could not properly follow today's video ("${video.title}"), so it did not write an article. You can write one yourself or delete this note.` };
    await putFile(env, `${DIR}/${slug}.md`, b64(`---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\nhttps://www.youtube.com/watch?v=${video.id}\n`), 'Robot note: video not understood');
    return { ok: true, note: slug };
  }

  const slug = `${today}-auto-${slugify(a.title)}`;
  let cover = '';
  let note = a.check ? `Robot's check: ${a.check}` : '';
  try {
    const img = await coverImage(env, a.image_prompt || a.title);
    if (img) { await putFile(env, `site/public/uploads/auto/${slug}.jpg`, img, `Cover image for ${a.title}`); cover = `/public/uploads/auto/${slug}.jpg`; }
  } catch (e) { note += ' (Cover image could not be generated.)'; }

  const fm = {
    title: a.title, date: new Date().toISOString(), summary: a.summary || '', category: a.category || 'Market update', cover,
    draft: true, hold: false, auto: true, note: note.trim(),
    source: `Money Pechu (Anand Srinivasan), video of ${today}`,
    title_ta: a.title_ta || '', summary_ta: a.summary_ta || '',
    quiz: Array.isArray(a.quiz) ? a.quiz.slice(0, 3) : [],
    body_ta: a.body_ta || '',
  };
  // YAML is a superset of JSON, so each value is written as JSON.
  const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  await putFile(env, `${DIR}/${slug}.md`, b64(`---\n${yaml}\n---\n${String(a.body).trim()}\n`), `Robot draft: ${a.title}`);
  return { ok: true, created: slug, video: video.title };
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
