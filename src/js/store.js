import { detectLanguage } from './i18n.js';
import { getDriverToken, getStoredDriverBus } from './api.js';

function loadStoredStopIndex() {
  try {
    const raw = localStorage.getItem('sunushuttle:stopIndex');
    return raw === null ? 0 : Number(raw);
  } catch {
    return 0;
  }
}

function loadStoredNotify() {
  try {
    return localStorage.getItem('sunushuttle:notify') === '1';
  } catch {
    return false;
  }
}

export function createStore() {
  const state = {
    view: 'home',
    lang: detectLanguage(),
    data: null, // last /api/state payload
    loadError: false,
    offline: false,
    selectedStopIndex: loadStoredStopIndex(),
    notify: loadStoredNotify(),
    notifiedForStop: null,
    driver: {
      authenticated: Boolean(getDriverToken()),
      bus: getStoredDriverBus(),
      pin: '',
      pinError: false,
      live: false,
      tripId: null,
      speedKmh: 0,
      boarded: 0,
      lastPosition: null,
      armEndTrip: false,
      gpsWatchId: null,
    },
    admin: {
      authenticated: false,
      loginError: '',
      panel: null,
    },
  };

  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => fn(state));
  }

  function setState(patch) {
    Object.assign(state, patch);
    notify();
  }

  function setDriver(patch) {
    Object.assign(state.driver, patch);
    notify();
  }

  function setAdmin(patch) {
    Object.assign(state.admin, patch);
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { state, setState, setDriver, setAdmin, subscribe };
}
