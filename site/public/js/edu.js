async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  return res.json();
}

// Daily quote
(async () => {
  const box = document.querySelector('#quoteBox');
  const timeEl = document.querySelector('#quoteTime');
  if (!box) return;
  const data = await fetchJSON('/api/quote/latest');
  if (data.quote) {
    box.textContent = data.quote.content;
    if (timeEl) timeEl.textContent = new Date(data.quote.publish_at).toLocaleString();
  } else {
    box.textContent = 'No quote yet. Check back soon.';
  }
})();

// Weekly summary
(async () => {
  const box = document.querySelector('#weeklyBox');
  const timeEl = document.querySelector('#weeklyTime');
  if (!box) return;
  const data = await fetchJSON('/api/weekly/latest');
  if (data.summary) {
    box.innerHTML = data.summary.content.replace(/\n/g, '<br>');
    if (timeEl) timeEl.textContent = new Date(data.summary.publish_at).toLocaleDateString();
  } else {
    box.textContent = 'No weekly summary for this week yet.';
  }
})();

// Polls
(async () => {
  const pollContainer = document.querySelector('#pollContainer');
  if (!pollContainer) return;
  const data = await fetchJSON('/api/poll');
  if (!data.poll) {
    pollContainer.innerHTML = '<p class="small">No poll available right now.</p>';
    return;
  }
  const poll = data.poll;
  const list = document.createElement('div');
  list.className = 'cards';
  poll.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.textContent = `${opt.option_text} (${opt.pct}% / ${opt.count})`;
    btn.onclick = async () => {
      const res = await fetchJSON(`/api/poll/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: opt.id }),
      });
      const msg = document.createElement('div');
      msg.className = 'alert';
      if (res.success) {
        msg.classList.add('success');
        msg.textContent = 'Vote recorded. Refreshing results...';
        pollContainer.appendChild(msg);
        setTimeout(() => location.reload(), 600);
      } else {
        msg.classList.add('error');
        msg.textContent = res.message || 'Vote failed';
        pollContainer.appendChild(msg);
      }
    };
    list.appendChild(btn);
  });
  pollContainer.innerHTML = `<h3>${poll.question}</h3>`;
  pollContainer.appendChild(list);
})();

// Newsletter
const newsletterForm = document.querySelector('#newsletterForm');
if (newsletterForm) {
  const alertEl = document.querySelector('#newsletterAlert');
  newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = newsletterForm.email.value;
    if (!email || !email.includes('@')) {
      alertEl.textContent = 'Please enter a valid email.';
      alertEl.className = 'alert error';
      alertEl.style.display = 'block';
      return;
    }
    const res = await fetchJSON('/api/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.success) {
      alertEl.textContent = 'Subscribed! Check your inbox for weekly learning emails.';
      alertEl.className = 'alert success';
      alertEl.style.display = 'block';
      newsletterForm.reset();
    } else {
      alertEl.textContent = res.message || 'Subscription failed';
      alertEl.className = 'alert error';
      alertEl.style.display = 'block';
    }
  });
}

// Articles list
(async () => {
  const listWrap = document.querySelector('#articleList');
  if (!listWrap) return;
  const data = await fetchJSON('/api/articles');
  if (!data.articles || !data.articles.length) {
    listWrap.innerHTML = '<p class="small">No articles yet.</p>';
    return;
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cats = [...new Set(data.articles.map((a) => a.category).filter(Boolean))];
  const search = `<input id="artSearch" type="search" placeholder="Search articles, e.g. ITC, gold, dividend" aria-label="Search articles" style="grid-column:1/-1;width:100%;padding:12px 16px;border-radius:999px;border:1px solid var(--line, rgba(255,255,255,.12));background:var(--card);color:var(--text);font:inherit;">`;
  const filters = cats.length > 1 ? `<div class="art-filters" role="group" aria-label="Filter by topic"><button class="btn art-f" data-c="">All</button>${cats.map((c) => `<button class="btn btn-outline art-f" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
  const card = (a) => `<a class="card art-card" data-c="${esc(a.category || '')}" href="/articles/${esc(a.slug)}/">
      ${a.cover ? `<img src="${esc(a.cover)}" alt="" loading="lazy">` : ''}
      <div class="art-body"><p class="small">${esc(a.category || 'Article')} · ${new Date(a.publish_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
      <h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><span class="art-more">Read article →</span></div></a>`;
  const html = `<style>
    .art-filters{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px}
    #articleList.cards{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
    .art-card{display:flex;flex-direction:column;padding:0;overflow:hidden;text-decoration:none;color:inherit;transition:transform .2s,border-color .2s}
    .art-card:hover,.art-card:focus-visible{transform:translateY(-3px);border-color:rgba(124,240,255,.5)}
    .art-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
    .art-body{padding:16px 18px 20px}.art-body h3{margin:6px 0 8px;line-height:1.3}.art-body p:last-of-type{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .art-more{font-weight:600;font-size:.9rem;opacity:.85}
    @media (prefers-reduced-motion:reduce){.art-card{transition:none}.art-card:hover{transform:none}}
  </style>${search}${filters}<div id="artGrid" class="cards" style="display:contents">${data.articles.map(card).join('')}</div>`;
  listWrap.innerHTML = html;
  let cat = '', q = '';
  const apply = () => listWrap.querySelectorAll('.art-card').forEach((c) => { c.hidden = (!!cat && c.dataset.c !== cat) || (!!q && !c.textContent.toLowerCase().includes(q)); });
  listWrap.querySelectorAll('.art-f').forEach((b) => b.addEventListener('click', () => {
    listWrap.querySelectorAll('.art-f').forEach((x) => x.classList.toggle('btn-outline', x !== b));
    cat = b.dataset.c; apply();
  }));
  const si = document.getElementById('artSearch');
  if (si) si.addEventListener('input', () => { q = si.value.trim().toLowerCase(); apply(); });
})();

// Smart dashboard widgets (placeholder logic)
(async () => {
  const recentWrap = document.querySelector('#recentReads');
  const suggestWrap = document.querySelector('#suggestedTopics');
  if (!recentWrap && !suggestWrap) return;
  if (recentWrap) recentWrap.innerHTML = '<p class="small">Your recently read items appear here after you view articles.</p>';
  if (suggestWrap) suggestWrap.innerHTML = '<ul class="list"><li>Start with: Basics</li><li>Next: Risk Management Basics</li><li>Macro: Economy & rates overview</li></ul>';
})();

// Continue learning card
(async () => {
  const card = document.querySelector('#continueCard');
  if (!card) return;
  try {
    const data = await fetchJSON('/api/user/continue-learning');
    if (!data.success) throw new Error('Failed');
    if (data.status === 'completed') {
      card.innerHTML = '<p class="small">Great job! You have completed all available articles.</p>';
      return;
    }
    const last = data.last_read_id ? `<p class="small">Last read article ID: ${data.last_read_id}</p>` : '';
    const next = data.next;
    card.innerHTML = `
      ${last}
      <h3>${next.title}</h3>
      <p class="small">${next.description || ''}</p>
      <div class="actions" style="margin-top:10px;">
        <a class="btn" href="/articles/${next.slug}">Continue</a>
        <button class="btn btn-outline" id="markCompletedBtn">Mark as completed</button>
      </div>
    `;
    const markBtn = card.querySelector('#markCompletedBtn');
    if (markBtn) {
      markBtn.addEventListener('click', async () => {
        try {
          const res = await fetchJSON('/api/user/complete-article', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ article_id: next.id }),
          });
          if (res.success) {
            card.innerHTML = '<p class="small">Marked as completed. Refresh to fetch your next suggestion.</p>';
          } else {
            card.innerHTML = '<p class="small">Could not mark as completed right now. Please try again.</p>';
          }
        } catch (err) {
          card.innerHTML = '<p class="small">Could not mark as completed right now. Please try again.</p>';
        }
      });
    }
  } catch (err) {
    card.innerHTML = '<p class="small">Unable to load continue-learning right now.</p>';
  }
})();

// Contact form
const contactForm = document.querySelector('#contactForm');
const contactAlert = document.querySelector('#contactAlert');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(contactForm));
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (data.success) {
      contactAlert.className = 'alert success';
      contactAlert.textContent = 'Thanks, we received your note.';
      contactAlert.style.display = 'block';
      contactForm.reset();
    } else {
      contactAlert.className = 'alert error';
      contactAlert.textContent = data.message || 'Message failed, please try later.';
      contactAlert.style.display = 'block';
    }
  });
}

// Stock report handler is in report-form.js (loaded where needed)

// Completion feedback handling (article list context)
const completePanel = document.querySelector('#articleCompletePanel');
async function markArticleCompleted(articleId) {
  if (!completePanel) return;
  const res = await fetchJSON('/api/user/complete-article', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_id: articleId }),
  });
  if (!res.success) return;
  completePanel.style.display = 'block';
  const msg = document.querySelector('#completeMessage');
  const nextWrap = document.querySelector('#nextSuggestion');
  const nextLink = document.querySelector('#nextLink');
  if (res.status === 'path_completed') {
    msg.textContent = 'You have completed all available articles in this path.';
    nextWrap.innerHTML = '';
    if (nextLink) nextLink.style.display = 'none';
    return;
  }
  const next = res.next;
  msg.textContent = 'Completed! Keep the momentum going.';
  if (next) {
    nextWrap.innerHTML = `<p class="small">Next up: ${next.title} — ⏱️ ${next.read_time_minutes} min read</p>`;
    if (nextLink) {
      nextLink.href = `/articles/${next.slug}`;
      nextLink.style.display = 'inline-flex';
    }
  }
}

// Explain Like I'm New toggle (hide advanced blocks, highlight basic)
(function explainToggle() {
  const toggle = document.querySelector('#explainToggle');
  if (!toggle) return;
  const basicBlocks = document.querySelectorAll('.basic');
  const advancedBlocks = document.querySelectorAll('.advanced');
  function applyState() {
    const on = toggle.checked;
    advancedBlocks.forEach((el) => (el.style.display = on ? 'none' : ''));
    basicBlocks.forEach((el) => {
      if (on) el.classList.add('basic-highlight');
      else el.classList.remove('basic-highlight');
    });
  }
  toggle.addEventListener('change', applyState);
  applyState();
})();
