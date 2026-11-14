(function() {
  const disclaimerText = `Disclaimer:\nEquity Investor Club and its founder are not registered with SEBI as an Investment Adviser or Research Analyst.\nAll content on this website is for education only and is not investment advice or a recommendation to buy, sell or hold any security.\nInvestments in the securities market are subject to market risks. Read all related documents carefully before investing.\nConsult a SEBI-registered investment adviser before making investment decisions.`;

  function makeBadge() {
    const wrap = document.createElement('div');
    wrap.className = 'disclaimer-badge-wrap';
    wrap.innerHTML = `
      <button class="disclaimer-chip" type="button" aria-expanded="false">Disclaimer</button>
      <div class="disclaimer-pop" hidden>
        <pre>${disclaimerText}</pre>
      </div>
    `;
    const btn = wrap.querySelector('button');
    const pop = wrap.querySelector('.disclaimer-pop');
    btn.addEventListener('click', () => {
      const isOpen = pop.hasAttribute('hidden') === false;
      pop.toggleAttribute('hidden', isOpen);
      btn.setAttribute('aria-expanded', (!isOpen).toString());
    });
    return wrap;
  }

  function inject(selector) {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.disclaimerApplied) return;
      const badge = makeBadge();
      el.appendChild(badge);
      el.dataset.disclaimerApplied = 'true';
    });
  }

  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  ready(() => {
    inject('.needs-disclaimer');
  });
})();
