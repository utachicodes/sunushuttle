export function render(root, { t, go }) {
  root.innerHTML = `
    <section class="home-view">
      <div class="masthead">
        <img src="/logo-daust.png" alt="DAUST" class="landing-logo" onerror="this.remove()" />
        <div class="folio">${t('folio')}</div>
        <h1>${t('hero')}</h1>
        <div class="rule-double" aria-hidden="true"></div>
        <p class="hero-sub">${t('heroSub')}</p>
      </div>
      <button class="choice-btn primary" data-go="student">
        <span class="plate-no">Nº 1</span>
        <span class="choice-text"><b>${t('imStudent')}</b><span>${t('studentDesc')}</span></span>
        <span class="choice-arrow" aria-hidden="true">→</span>
      </button>
      <button class="choice-btn secondary" data-go="driver">
        <span class="plate-no">Nº 2</span>
        <span class="choice-text"><b>${t('imDriver')}</b><span>${t('driverDesc')}</span></span>
        <span class="choice-arrow" aria-hidden="true">→</span>
      </button>
      <button class="text-link" data-go="admin">— ${t('admin')} —</button>
    </section>
  `;
  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.go));
  });
}

export function destroy() {}
