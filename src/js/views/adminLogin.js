import { api, setAdminToken, ApiError } from '../api.js';

let submit = () => {};

export function render(root, { store, t, go }) {
  const { state, setAdmin } = store;

  root.innerHTML = `
    <section class="admin-login-view">
      <div class="mute" style="margin-bottom:12px">${t('adminSignIn')}</div>
      <input class="field" id="username" placeholder="${t('username')}" autocomplete="username" />
      <input class="field" id="password" type="password" placeholder="${t('password')}" autocomplete="current-password" />
      <div class="field-error" role="alert">${state.admin.loginError}</div>
    </section>
  `;

  root.querySelector('#password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  submit = async () => {
    const username = root.querySelector('#username').value.trim();
    const password = root.querySelector('#password').value;
    try {
      const { token } = await api.adminLogin(username, password);
      setAdminToken(token);
      setAdmin({ authenticated: true, loginError: '' });
      go('admin');
    } catch (err) {
      let message = t('wrongCredentials');
      if (err instanceof ApiError) {
        if (err.status === 429) message = t('tooManyAttempts', { n: err.retryAfter });
        else if (err.status !== 401 && err.status !== 400) message = t('connectionError');
      } else {
        message = t('connectionError');
      }
      setAdmin({ loginError: message });
    }
  };
}

export function renderBar(bar, { t }) {
  bar.innerHTML = `<button class="btn btn-primary" id="adminLoginBtn">${t('signIn')}</button>`;
  document.getElementById('adminLoginBtn').addEventListener('click', () => submit());
}

export function destroy() {
  submit = () => {};
}
