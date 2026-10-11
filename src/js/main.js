import '../css/main.css';
import { registerSW } from 'virtual:pwa-register';
import { createStore } from './store.js';
import { translate, saveLanguage } from './i18n.js';
import { api } from './api.js';
import * as homeView from './views/home.js';
import * as studentView from './views/student.js';
import * as driverLoginView from './views/driverLogin.js';
import * as driverView from './views/driver.js';
import * as adminLoginView from './views/adminLogin.js';
import * as adminView from './views/admin.js';

registerSW({ immediate: true });

const VIEWS = {
  home: homeView,
  student: studentView,
  'driver-login': driverLoginView,
  driver: driverView,
  'admin-login': adminLoginView,
  admin: adminView,
};

const STATE_POLL_MS = 3000;

const store = createStore();
let activeView = null;
let pollTimer = null;

const app = document.getElementById('app');
app.innerHTML = `
  <header class="app-header">
    <button class="icon-btn" id="backBtn" aria-label="Back" hidden>←</button>
    <div class="brand"><img src="/logo-daust.png" alt="DAUST" class="brand-logo" onerror="this.remove()" />SunuShuttle</div>
    <button class="icon-btn" id="langBtn" aria-label="Language"></button>
  </header>
  <main id="viewRoot"></main>
  <div class="action-bar" id="actionBar"></div>
`;

const viewRoot = document.getElementById('viewRoot');
const actionBar = document.getElementById('actionBar');
const backBtn = document.getElementById('backBtn');
const langBtn = document.getElementById('langBtn');

function t(key, vars) {
  return translate(store.state.lang, key, vars);
}

function go(view) {
  if (view === 'driver') {
    view = store.state.driver.authenticated ? 'driver' : 'driver-login';
  }
  if (view === 'admin') {
    view = store.state.admin.authenticated ? 'admin' : 'admin-login';
  }
  history.pushState({ view }, '', `#${view === 'home' ? '' : view}`);
  store.setState({ view });
}

function viewFromHash() {
  const hash = location.hash.replace('#', '');
  return VIEWS[hash] ? hash : 'home';
}

window.addEventListener('offline', () => store.setState({ offline: true }));
window.addEventListener('online', () => store.setState({ offline: false }));

window.addEventListener('popstate', () => {
  store.setState({ view: viewFromHash() });
});

backBtn.addEventListener('click', () => go('home'));

langBtn.addEventListener('click', () => {
  const next = store.state.lang === 'en' ? 'fr' : 'en';
  saveLanguage(next);
  store.setState({ lang: next });
});

function render() {
  const state = store.state;
  document.documentElement.lang = state.lang;
  langBtn.textContent = state.lang === 'en' ? 'FR' : 'EN';
  backBtn.hidden = state.view === 'home' || (state.view === 'driver' && state.driver.live);

  const mod = VIEWS[state.view] ?? homeView;
  if (mod !== activeView) {
    activeView?.destroy?.();
    activeView = mod;
  }

  const ctx = { store, t, go, lang: state.lang };
  mod.render(viewRoot, ctx);
  if (mod.renderBar) mod.renderBar(actionBar, ctx);
  else actionBar.innerHTML = '';

  managePolling(state);
}

function managePolling(state) {
  const needsPolling = state.view === 'student' || (state.view === 'driver' && state.driver.live);
  if (needsPolling && !pollTimer) {
    fetchState();
    pollTimer = setInterval(fetchState, STATE_POLL_MS);
  } else if (!needsPolling && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function routeIdForView(state) {
  if ((state.view === 'driver' || state.view === 'driver-login') && state.driver.bus?.routeId) {
    return state.driver.bus.routeId;
  }
  return state.selectedRouteId ?? state.data?.route?.id ?? null;
}

async function loadRoutes() {
  try {
    const { routes } = await api.routes();
    const patch = { routes: routes ?? [] };
    const ids = new Set((routes ?? []).map((r) => r.id));
    if (!ids.has(store.state.selectedRouteId)) {
      patch.selectedRouteId = routes?.[0]?.id ?? null;
      // Only reset the stop when a previously chosen route disappeared,
      // not on first boot (that would wipe a saved stop).
      if (store.state.selectedRouteId) patch.selectedStopIndex = 0;
      try {
        if (patch.selectedRouteId) localStorage.setItem('sunushuttle:routeId', patch.selectedRouteId);
      } catch { /* ignore */ }
    }
    store.setState(patch);
  } catch {
    /* routes stay empty, state falls back to the default route */
  }
}

async function fetchState() {
  try {
    const data = await api.state(routeIdForView(store.state));
    store.setState({ data, loadError: false });
  } catch {
    store.setState({ loadError: true });
  }
}

store.subscribe(render);
store.setState({ view: viewFromHash() });

// Prime routes + student data immediately so the first paint is not blank.
loadRoutes().finally(fetchState);
