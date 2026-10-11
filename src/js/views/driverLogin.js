import { api, setDriverToken, setStoredDriverBus, ApiError } from '../api.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'x'];

export function render(root, { store, t, go }) {
  const { state, setDriver } = store;
  const pin = state.driver.pin;

  root.innerHTML = `
    <section class="login-view">
      <div class="mute">${t('enterPin')}</div>
      <div class="pin-dots" aria-live="polite">
        ${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'filled' : ''}"></i>`).join('')}
      </div>
      <div class="pin-error" role="alert">${state.driver.pinError ?? ''}</div>
      <div class="pin-pad">
        ${KEYS.map((k) => (k === '' ? '<span></span>' : `<button data-k="${k}" aria-label="${k === 'x' ? 'Delete' : k}">${k === 'x' ? '⌫' : k}</button>`)).join('')}
      </div>
    </section>
  `;

  root.querySelectorAll('[data-k]').forEach((btn) => {
    btn.addEventListener('click', () => handleKey(btn.dataset.k));
  });

  async function handleKey(key) {
    let next = state.driver.pin;
    if (key === 'x') next = next.slice(0, -1);
    else if (next.length < 4) next += key;
    setDriver({ pin: next, pinError: null });

    if (next.length === 4) {
      try {
        const { token, bus } = await api.driverLogin(next);
        setDriverToken(token);
        setStoredDriverBus(bus);
        setDriver({ pin: '', pinError: null, authenticated: true, bus });
        go('driver');
      } catch (err) {
        let message = t('wrongPin');
        if (err instanceof ApiError) {
          if (err.status === 429) message = t('tooManyAttempts', { n: err.retryAfter });
          else if (err.status !== 401) message = t('connectionError');
        } else {
          message = t('connectionError');
        }
        setDriver({ pin: '', pinError: message });
      }
    }
  }
}

export function renderBar(bar) {
  bar.innerHTML = '';
}

export function destroy() {}
