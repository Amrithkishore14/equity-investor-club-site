// Watchlist: search + add/remove stocks (user dashboard widget)
(function () {
  const searchInput = document.querySelector('#watchlistSearch');
  const suggestList = document.querySelector('#watchlistSuggestions');
  const alertBox = document.querySelector('#watchlistAlert');
  const itemsBox = document.querySelector('#watchlistItems');
  if (!searchInput) return;

  let debounce;
  let selectedStock = null;

  function showAlert(msg, type) {
    alertBox.textContent = msg;
    alertBox.className = 'alert ' + (type || 'error');
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
  }

  async function loadWatchlist() {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      if (!data.success || !data.watchlist.length) {
        itemsBox.innerHTML = '<p class="small" style="color:var(--muted);">No stocks in your watchlist yet. Search above to add.</p>';
        return;
      }
      itemsBox.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        <thead><tr style="border-bottom:2px solid var(--border);">
          <th style="text-align:left;padding:6px;">Company</th>
          <th style="text-align:left;padding:6px;">Symbol</th>
          <th style="text-align:left;padding:6px;">Exchange</th>
          <th style="text-align:left;padding:6px;">Sector</th>
          <th style="padding:6px;"></th>
        </tr></thead>
        <tbody>${data.watchlist.map(s => `
          <tr style="border-bottom:1px solid var(--border);" data-id="${s.id}">
            <td style="padding:6px;">${s.stock_name}</td>
            <td style="padding:6px;">${s.symbol}</td>
            <td style="padding:6px;"><span class="badge-inline">${s.exchange}</span></td>
            <td style="padding:6px;">${s.sector || '—'}</td>
            <td style="padding:6px;text-align:right;">
              <button class="btn btn-outline" style="padding:3px 10px;font-size:0.8rem;" data-remove="${s.id}">Remove</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;

      itemsBox.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-remove');
          await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
          loadWatchlist();
        });
      });
    } catch {
      itemsBox.innerHTML = '<p class="small">Could not load watchlist.</p>';
    }
  }

  function renderSuggestions(items) {
    suggestList.innerHTML = '';
    items.forEach(s => {
      const li = document.createElement('li');
      li.className = 'suggest-item';
      li.innerHTML = `<span>${s.stock_name}</span><span class="badge-inline">${s.exchange}</span>`;
      li.addEventListener('click', async () => {
        suggestList.innerHTML = '';
        searchInput.value = s.stock_name;
        selectedStock = s;
        // Immediately add to watchlist on selection
        try {
          const res = await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock_id: s.stock_id }),
          });
          const data = await res.json();
          if (data.success) {
            showAlert(`${s.stock_name} added to watchlist.`, 'success');
            searchInput.value = '';
            loadWatchlist();
          } else {
            showAlert(data.message || 'Could not add stock.', 'error');
          }
        } catch {
          showAlert('Network error.', 'error');
        }
      });
      suggestList.appendChild(li);
    });
  }

  searchInput.addEventListener('input', e => {
    clearTimeout(debounce);
    const v = e.target.value;
    if (v.length < 2) { suggestList.innerHTML = ''; return; }
    debounce = setTimeout(async () => {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(v)}`);
      const data = await res.json();
      if (data.success) renderSuggestions(data.results || []);
    }, 150);
  });

  document.addEventListener('click', e => {
    if (!searchInput.contains(e.target) && !suggestList.contains(e.target)) {
      suggestList.innerHTML = '';
    }
  });

  loadWatchlist();
})();
