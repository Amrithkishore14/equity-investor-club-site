// Equity Investor Club effects: ticker tape, live hero card, stock heat-map, scroll reveal, card glow.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = (v, d = 2) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d });
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Scroll progress
  const bar = document.createElement('div'); bar.id = 'fxProgress'; document.body.appendChild(bar);
  addEventListener('scroll', () => { const h = document.documentElement; bar.style.transform = `scaleX(${h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)})`; }, { passive: true });

  // Card glow follows the cursor
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.card, .art-card');
    if (!c) return; const r = c.getBoundingClientRect();
    c.style.setProperty('--gx', `${e.clientX - r.left}px`); c.style.setProperty('--gy', `${e.clientY - r.top}px`);
  });

  // Scroll reveal for sections and cards
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
    const watch = () => document.querySelectorAll('main .section, main .card, .art-card, .fx-cell').forEach((el, i) => {
      if (el.classList.contains('fx-reveal')) return; el.classList.add('fx-reveal'); el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`; io.observe(el);
    });
    watch(); new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  }

  // Count-up animation
  function countUp(el, to, d = 2) {
    if (reduce) { el.textContent = f(to, d); return; }
    const t0 = performance.now(), from = to * 0.97, dur = 1400;
    (function step(t) { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = f(from + (to - from) * e, d); if (k < 1) requestAnimationFrame(step); })(t0);
  }

  fetch('/api/ticker').then((r) => r.json()).then((d) => {
    if (!d.success) return;
    // Ticker tape (all pages)
    const all = [...d.indices, ...d.stocks];
    const item = (x) => `<span class="eic-tk">${esc(x.name)}<b>${f(x.price)}</b><span class="${x.pct >= 0 ? 'up' : 'down'}">${x.pct >= 0 ? '▲' : '▼'} ${f(Math.abs(x.pct))}%</span></span>`;
    const tape = document.createElement('div'); tape.className = 'eic-ticker'; tape.setAttribute('aria-label', 'Market prices (delayed)');
    tape.innerHTML = `<div class="eic-track">${all.map(item).join('')}${all.map(item).join('')}</div>`;
    const header = document.querySelector('header'); header ? header.after(tape) : document.body.prepend(tape);

    // Hero card (homepage)
    const hero = document.getElementById('fxHero');
    if (hero && d.indices.length) {
      const n = d.indices[0], up = n.pct >= 0, pts = n.spark || [];
      const mn = Math.min(...pts), mx = Math.max(...pts), sp = mx - mn || 1, W = 600, H = 140;
      const xy = pts.map((v, i) => [(i * W) / (pts.length - 1), H - 10 - ((v - mn) * (H - 20)) / sp]);
      const line = xy.map((p) => p.join(',')).join(' '), col = up ? '#22C55E' : '#EF4444';
      hero.innerHTML = `<div class="fx-label"><span class="fx-dot"></span>NIFTY 50 · last close ${esc(d.asOf)}</div>
        <div class="fx-big" id="fxBig">${f(n.price)}</div>
        <div class="fx-chg ${up ? 'up' : 'down'}">${up ? '▲ +' : '▼ '}${f(n.change)} (${up ? '+' : ''}${f(n.pct)}%) today</div>
        <svg class="fx-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Nifty 50 over the last month">
          <defs><linearGradient id="fxg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
          <polygon class="ar" points="0,${H} ${line} ${W},${H}" fill="url(#fxg)"/><polyline class="ln" points="${line}" stroke="${col}"/></svg>
        <div class="fx-minis">${d.indices.slice(1).map((x) => `<div class="fx-mini"><div class="n">${esc(x.name)}</div><div class="v">${f(x.price)}</div><div class="c" style="color:${x.pct >= 0 ? 'var(--up)' : 'var(--down)'}">${x.pct >= 0 ? '▲' : '▼'} ${f(Math.abs(x.pct))}%</div></div>`).join('')}</div>`;
      countUp(document.getElementById('fxBig'), n.price);
      if (!reduce) hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        hero.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`; hero.style.setProperty('--mx', `${(x + 0.5) * 100}%`); hero.style.setProperty('--my', `${(y + 0.5) * 100}%`);
      });
      hero.addEventListener('pointerleave', () => { hero.style.transform = ''; });
    }

    // Heat-map (homepage)
    const heat = document.getElementById('fxHeat');
    if (heat && d.stocks.length) {
      const col = (p) => { const k = Math.max(-1, Math.min(1, p / 3)); const n = [42, 50, 66], g = [21, 128, 61], r = [185, 28, 28], t = k >= 0 ? g : r, a = Math.abs(k); return `rgb(${n.map((v, i) => Math.round(v + (t[i] - v) * a)).join(',')})`; };
      heat.innerHTML = d.stocks.map((s) => `<a class="fx-cell" style="background:${col(s.pct)}" href="/stocks/${encodeURIComponent(s.symbol)}/#technical" title="${esc(s.full || s.name)}"><span class="s">${esc(s.name)}</span><span class="p">${s.pct >= 0 ? '+' : ''}${f(s.pct)}%</span></a>`).join('');
    }
  }).catch(() => {});
})();
