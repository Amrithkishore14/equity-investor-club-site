// Daily auto-post robot for Equity Investor Club.
// 3pm UK: if Money Pechu (Anand Srinivasan) posted a video today, read its transcript,
// write an original article in our own words (English + Tamil), a quiz and a cover image,
// and save it to the CMS as a DRAFT. 9pm UK: publish today's robot draft unless it is on hold.

const CHANNEL_ID = 'UC7fQFl37yAOaPaoxQm-TqSA'; // Money Pechu
const REPO = 'Amrithkishore14/equity-investor-club-site';
const DIR = 'content/articles';
const LLM = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const TRANSLATE = '@cf/meta/m2m100-1.2b';
const IMAGE = '@cf/black-forest-labs/flux-1-schnell';
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

async function captionTracks(id) {
  // 1) Innertube player API (Android client) usually returns caption URLs that work server-side.
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip' },
      body: JSON.stringify({ videoId: id, context: { client: { clientName: 'ANDROID', clientVersion: '19.44.38', androidSdkVersion: 34, hl: 'en', gl: 'IN' } } }),
    });
    const j = await r.json();
    const t = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (t?.length) return t;
  } catch (e) {}
  // 2) Watch page.
  try {
    const html = await (await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', Cookie: 'CONSENT=YES+1' } })).text();
    const m = html.match(/"captionTracks":(\[.*?\])/);
    if (m) return JSON.parse(m[1]);
  } catch (e) {}
  return [];
}

async function transcript(id) {
  const tracks = await captionTracks(id);
  const order = (t) => (t.languageCode === 'en' ? 0 : t.languageCode === 'ta' ? 1 : 2) + (t.kind === 'asr' ? 0.5 : 0);
  for (const t of tracks.sort((a, b) => order(a) - order(b))) {
    try {
      const url = t.baseUrl.replace(/\\u0026/g, '&');
      const body = await (await fetch(url + (url.includes('fmt=') ? '' : '&fmt=json3'), { headers: { 'User-Agent': UA } })).text();
      let text = '';
      if (body.trim().startsWith('{')) text = (JSON.parse(body).events || []).flatMap((e) => (e.segs || []).map((s) => s.utf8)).join(' ');
      else text = [...body.matchAll(/<(?:text|s)[^>]*>([^<]*)<\/(?:text|s)>/g)].map((m) => decode(m[1])).join(' ');
      text = text.replace(/\s+/g, ' ').trim();
      if (text.length > 400) return { text, lang: t.languageCode };
    } catch (e) {}
  }
  return null;
}

// ---------- AI ----------
function chunks(text, size) {
  const out = []; let cur = '';
  for (const w of text.split(' ')) { if ((cur + ' ' + w).length > size) { out.push(cur); cur = w; } else cur += (cur ? ' ' : '') + w; }
  if (cur) out.push(cur);
  return out;
}
async function translate(env, text, from, to) {
  const parts = [];
  for (const c of chunks(text, 900)) {
    const r = await env.AI.run(TRANSLATE, { text: c, source_lang: from, target_lang: to });
    parts.push(r.translated_text || '');
  }
  return parts.join(' ');
}
async function translateMarkdown(env, md) {
  const out = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(\s*(?:#{1,6}\s|[-*]\s|\d+\.\s)?)(.*)$/);
    if (!m[2].trim()) { out.push(line); continue; }
    out.push(m[1] + (await translate(env, m[2].replace(/\*\*/g, ''), 'en', 'ta')));
  }
  return out.join('\n');
}

function extractJson(s) {
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}

async function writeArticle(env, video, source) {
  const system = `You are the editor of Equity Investor Club, a financial-literacy website for beginner investors in India.
Write an ORIGINAL educational article in your own words based only on the notes provided. Do not copy sentences from the notes and do not invent facts, numbers or news that are not in the notes.
Never give buy/sell/hold advice on a specific stock; explain ideas and what a beginner should understand instead.
Reply with ONLY a JSON object with these keys:
"title" (max 70 chars), "summary" (1-2 sentences), "category" (one of: Basics, Stock market, Mutual funds, Personal finance, Market update),
"body" (markdown, 350-600 words, with ## headings: "What happened", "What it means for you", "Key takeaways" as a bullet list, and "Jargon buster" explaining 2-3 terms),
"image_prompt" (a short description of a clean, modern editorial illustration for the cover; no text, no logos, no real people),
"quiz" (array of 3 objects: {"q": question, "options": [4 short options], "answer": index 0-3}),
"check" (one sentence on anything the editor should double-check, or "" if nothing).`;
  const user = `Video title: ${video.title}\nPublished: ${video.published}\n\nNotes (${source.kind}):\n${source.text.slice(0, 14000)}`;
  const r = await env.AI.run(LLM, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 2200, temperature: 0.4 });
  return extractJson(r.response || '');
}

async function coverImage(env, prompt) {
  const r = await env.AI.run(IMAGE, { prompt: `${prompt}. Flat editorial illustration, deep navy and emerald green palette, finance theme, no text`, steps: 6 });
  return r.image; // base64 jpeg
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ---------- Jobs ----------
export async function createDraft(env, { force = false } = {}) {
  if (!env.GITHUB_TOKEN) return { ok: false, reason: 'GITHUB_TOKEN secret missing' };
  const today = londonParts().date;
  const existing = (await gh(env, `contents/${DIR}`)) || [];
  if (!force && existing.some((f) => f.name.startsWith(`${today}-auto-`))) return { ok: true, skipped: 'already posted today' };

  const video = await latestVideo();
  if (!video) return { ok: false, reason: 'could not read the channel feed' };
  if (londonParts(new Date(video.published)).date !== today && !force) return { ok: true, skipped: `no new video today (latest: ${video.published})` };

  let source; let note = '';
  const tr = await transcript(video.id);
  if (tr) {
    const text = tr.lang === 'en' ? tr.text : await translate(env, tr.text.slice(0, 12000), tr.lang, 'en');
    source = { kind: 'transcript', text };
  } else {
    source = { kind: 'title and description only', text: `${video.title}\n${video.description}` };
    note = 'The transcript was not available today, so this draft is based only on the video title and description. Please check it carefully before publishing. ';
  }

  const a = await writeArticle(env, video, source);
  if (a.check) note += `Robot's check: ${a.check}`;
  const [titleTa, summaryTa, bodyTa] = [await translate(env, a.title, 'en', 'ta'), await translate(env, a.summary, 'en', 'ta'), await translateMarkdown(env, a.body)];

  const slug = `${today}-auto-${slugify(a.title)}`;
  let cover = '';
  try {
    const img = await coverImage(env, a.image_prompt || a.title);
    if (img) { await putFile(env, `site/public/uploads/auto/${slug}.jpg`, img, `Cover image for ${a.title}`); cover = `/public/uploads/auto/${slug}.jpg`; }
  } catch (e) { note += ' (Cover image could not be generated.)'; }

  const fm = {
    title: a.title, date: new Date().toISOString(), summary: a.summary, category: a.category || 'Market update', cover,
    draft: true, hold: false, auto: true, note: note.trim(),
    source: `Money Pechu (Anand Srinivasan), video of ${today}`,
    title_ta: titleTa, summary_ta: summaryTa,
    quiz: Array.isArray(a.quiz) ? a.quiz.slice(0, 3) : [],
    body_ta: bodyTa,
  };
  // YAML is a superset of JSON, so each value is written as JSON.
  const yaml = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  const md = `---\n${yaml}\n---\n${a.body.trim()}\n`;
  await putFile(env, `${DIR}/${slug}.md`, b64(md), `Robot draft: ${a.title}`);
  return { ok: true, created: slug, transcript: !!tr };
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
