export function render(root, { t, go }) {
  root.innerHTML = `
    <section class="home-view">
      <h1>${t('hero')}</h1>
      <button class="choice-btn primary" data-go="student">${t('imStudent')}</button>
      <button class="choice-btn secondary" data-go="driver">${t('imDriver')}</button>
      <button class="text-link" data-go="admin">${t('admin')}</button>
    </section>
  `;
  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.go));
  });
}

export function destroy() {}
