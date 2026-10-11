import { createMap, drawRoute, fitToStops, createBusMarker, createLayerGroup } from '../map.js';
import { haversineMeters } from '../geo.js';
import { nextDeparture } from '../schedule.js';
import { api, setDriverToken, setStoredDriverBus, ApiError } from '../api.js';
import { showToast } from '../toast.js';

let map = null;
let routeLayer = null;
let busLayer = null;
let ownMarker = null;
let drawnStopsKey = '';

let watchId = null;
let wakeLock = null;
let lastFix = null; // { lat, lng, t }
let sendTimer = null;
let pendingFix = null;

function skeletonIdle(t, bus) {
  return `
    <section class="driver-view" id="driverIdle">
      <div class="announcement" id="driverReminder" hidden></div>
      <div class="driver-badge">
        <span class="driver-avatar" id="driverAvatar">?</span>
        <span class="driver-id"><b>${t('hello', { name: bus?.driverName ?? '' })}</b><span class="mute">${bus?.label ?? ''}</span></span>
      </div>
      <div class="trip-plate">
        <div class="mute trip-label">${t('nextDeparture')}</div>
        <div class="num" id="nextDepartureNum"></div>
      </div>
      <button class="text-link" id="signOutBtn">${t('notYouSignOut')}</button>
    </section>
  `;
}

function skeletonLive(t) {
  return `
    <section class="driver-view" id="driverLive">
      <div class="plate-head">
        <img src="/logo-daust.png" alt="DAUST" class="student-logo" onerror="this.remove()" />
        <div class="live-pill on"><i></i><span>${t('trackingOn')}</span></div>
      </div>
      <div class="speed-plate">
        <div class="num speed-num"><span id="speedVal">0</span><span class="unit">km/h</span></div>
        <div class="driver-kv">
          <div><span class="mute">${t('nextStop')}</span><b id="nextStopName">–</b></div>
          <div><span class="mute">${t('boarded')}</span><b id="boardedCount">0</b></div>
        </div>
      </div>
      <div class="map-shell">
        <div id="driverMap"></div>
        <button class="map-recenter" id="driverRecenterBtn" aria-label="Recenter map">⌖</button>
        <div class="map-caption">${t('figLine')}</div>
      </div>
      <div class="mute" id="lastStopReached" style="margin-top:10px;color:var(--ok);font-weight:700" hidden>${t('lastStopReached')}</div>
    </section>
  `;
}

export function render(root, { store, t, go }) {
  const { state, setDriver } = store;
  const d = state.driver;

  if (!d.live) {
    if (root.dataset.view === 'driver-live') destroy();
    root.innerHTML = skeletonIdle(t, d.bus);
    root.dataset.view = 'driver-idle';
    const avatar = document.getElementById('driverAvatar');
    if (avatar) {
      const initials = (d.bus?.driverName ?? '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
      avatar.textContent = initials || '–';
    }
    document.getElementById('signOutBtn').addEventListener('click', () => {
      setDriverToken(null);
      setStoredDriverBus(null);
      setDriver({ authenticated: false, bus: null });
      go('home');
    });

    const next = nextDeparture(state.data?.departures ?? []);
    document.getElementById('nextDepartureNum').textContent = next?.time ?? '--:--';
    const reminder = document.getElementById('driverReminder');
    if (next && next.minutesUntil <= 10 && next.minutesUntil >= 0) {
      reminder.hidden = false;
      reminder.textContent = t('tripReminder', { time: next.time });
    } else {
      reminder.hidden = true;
    }
    return;
  }

  if (root.dataset.view !== 'driver-live') {
    root.innerHTML = skeletonLive(t);
    root.dataset.view = 'driver-live';
    map = createMap(document.getElementById('driverMap'));
    routeLayer = createLayerGroup(map);
    busLayer = createLayerGroup(map);
    drawnStopsKey = '';
  }

  const stops = state.data?.stops ?? [];
  const stopsKey = stops.map((s) => s.id).join(',');
  if (stopsKey && stopsKey !== drawnStopsKey) {
    drawRoute(map, routeLayer, stops, -1, null);
    fitToStops(map, stops);
    drawnStopsKey = stopsKey;
  }

  document.getElementById('speedVal').textContent = Math.round(d.speedKmh);
  document.getElementById('boardedCount').textContent = d.boarded;

  if (d.lastPosition && stops.length) {
    if (!ownMarker) {
      ownMarker = createBusMarker(busLayer, [d.lastPosition.lat, d.lastPosition.lng]);
    } else {
      ownMarker._moveTo([d.lastPosition.lat, d.lastPosition.lng], 1000);
    }
    let nearest = stops[0];
    let nearestDist = Infinity;
    for (const s of stops) {
      const dist = haversineMeters(d.lastPosition, s);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = s;
      }
    }
    document.getElementById('nextStopName').textContent = nearest.name;
    document.getElementById('lastStopReached').hidden = !(nearest === stops[stops.length - 1] && nearestDist < 60);
  }

  const driverRecenterBtn = document.getElementById('driverRecenterBtn');
  if (driverRecenterBtn) {
    driverRecenterBtn.onclick = () => {
      if (map && stops.length) fitToStops(map, stops);
    };
  }
}

export function renderBar(bar, { store, t }) {
  const { state, setDriver } = store;
  const d = state.driver;

  if (!d.live) {
    const next = nextDeparture(state.data?.departures ?? []);
    bar.innerHTML = `<button class="btn btn-primary" id="startTripBtn">${t('startTrip', { time: next?.time ?? '--:--' })}</button>`;
    document.getElementById('startTripBtn').addEventListener('click', () => startTrip(store));
    return;
  }

  bar.innerHTML = `<button class="btn btn-danger${d.armEndTrip ? ' armed' : ''}" id="endTripBtn">${d.armEndTrip ? t('confirmEnd') : t('endTrip')}</button>`;
  document.getElementById('endTripBtn').addEventListener('click', () => {
    if (d.armEndTrip) {
      endTrip(store);
    } else {
      setDriver({ armEndTrip: true });
      setTimeout(() => setDriver({ armEndTrip: false }), 4000);
    }
  });
}

async function startTrip(store) {
  const { setDriver } = store;
  try {
    await api.tripStart();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setDriverToken(null);
      setStoredDriverBus(null);
      setDriver({ authenticated: false, bus: null });
      return;
    }
    showToast('Could not start the trip');
    return;
  }
  setDriver({ live: true, boarded: 0, armEndTrip: false });
  beginTracking(store);
}

async function endTrip(store) {
  const { setDriver } = store;
  stopTracking();
  try {
    await api.tripEnd();
  } catch { /* best effort, UI already reflects the end */ }
  setDriver({ live: false, armEndTrip: false, lastPosition: null, speedKmh: 0 });
}

function beginTracking(store) {
  const { setDriver } = store;

  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
        let speedKmh = pos.coords.speed != null ? pos.coords.speed * 3.6 : estimateSpeed(fix);
        lastFix = fix;
        pendingFix = { ...fix, heading: pos.coords.heading, speedKmh };
        setDriver({ lastPosition: fix, speedKmh: Math.max(0, speedKmh) });
      },
      () => showToast('Could not read your location'),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
  }

  try {
    navigator.wakeLock?.request('screen').then((lock) => (wakeLock = lock));
  } catch { /* wake lock unsupported */ }

  sendTimer = setInterval(() => {
    if (!pendingFix) return;
    const fix = pendingFix;
    api.sendPosition(fix.lat, fix.lng, fix.speedKmh, fix.heading).catch(() => {});
  }, 4000);
}

function estimateSpeed(fix) {
  if (!lastFix) return 0;
  const dtSeconds = (fix.t - lastFix.t) / 1000;
  if (dtSeconds <= 0) return 0;
  const meters = haversineMeters(lastFix, fix);
  return (meters / dtSeconds) * 3.6;
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (sendTimer) {
    clearInterval(sendTimer);
    sendTimer = null;
  }
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  lastFix = null;
  pendingFix = null;
}

export function destroy() {
  stopTracking();
  if (map) {
    map.remove();
    map = null;
  }
  routeLayer = null;
  busLayer = null;
  ownMarker = null;
  drawnStopsKey = '';
}
