import { api, setAdminToken } from '../api.js';
import { showToast } from '../toast.js';

let cache = null; // { stops, departures, drivers, trips, message }
let needsBuild = true;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadAll() {
  const [stopsRes, departuresRes, driversRes, tripsRes, messageRes] = await Promise.all([
    api.getStops(),
    api.getDepartures(),
    api.getDrivers(),
    api.getTrips(),
    api.getMessage(),
  ]);
  cache = {
    stops: stopsRes.stops,
    departures: departuresRes.departures,
    drivers: driversRes.drivers,
    trips: tripsRes.trips,
    message: messageRes.message,
  };
}

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sectionHtml(t) {
  const stopsRows = cache.stops
    .map(
      (s, i) => `
      <div class="stop-edit-row" data-stop-row="${i}">
        <input class="field" data-field="name" value="${escapeHtml(s.name)}" placeholder="${t('stopName')}" />
        <input class="field" data-field="lat" value="${s.lat}" inputmode="decimal" placeholder="${t('latitude')}" />
        <input class="field" data-field="lng" value="${s.lng}" inputmode="decimal" placeholder="${t('longitude')}" />
        <button class="chip-btn" data-remove-stop="${i}" aria-label="Remove">✕</button>
      </div>`
    )
    .join('');

  const departureRows = cache.departures
    .map(
      (d) => `<div class="admin-row"><b>${d}</b><button class="chip-btn" data-remove-departure="${d}" aria-label="Remove ${d}">✕</button></div>`
    )
    .join('');

  const driverRows = cache.drivers
    .map(
      (d) => `<div class="admin-row"><span>${escapeHtml(d.driverName)}, ${escapeHtml(d.label)}</span><button class="chip-btn" data-remove-driver="${d.id}" aria-label="Remove ${escapeHtml(d.driverName)}">✕</button></div>`
    )
    .join('');

  const tripRows = cache.trips.length
    ? cache.trips
        .map(
          (x) => `<div class="admin-row"><span>${escapeHtml(x.driverName)}, ${escapeHtml(x.label)}</span><span class="mute">${formatTime(x.startedAt)} → ${formatTime(x.endedAt)}, ${x.boarded}</span></div>`
        )
        .join('')
    : `<div class="empty-state">${t('noTrips')}</div>`;

  return `
    <section class="admin-view">
      <div class="admin-section">
        <h2>${t('message')}</h2>
        <div class="admin-row">
          <input class="field" id="messageInput" maxlength="160" value="${escapeHtml(cache.message ?? '')}" />
          <button class="chip-btn" id="sendMessageBtn">${t('send')}</button>
        </div>
      </div>

      <div class="admin-section">
        <h2>${t('departures')}</h2>
        ${departureRows}
        <div class="admin-row">
          <input class="field" id="newDepartureInput" type="time" />
          <button class="chip-btn" id="addDepartureBtn">${t('add')}</button>
        </div>
      </div>

      <div class="admin-section">
        <h2>${t('stopNames')}</h2>
        ${stopsRows}
        <div class="admin-row">
          <button class="chip-btn" id="addStopBtn" style="width:100%">${t('add')}</button>
        </div>
        <button class="btn btn-primary" id="saveStopsBtn" style="margin-top:10px">${t('saveStops')}</button>
      </div>

      <div class="admin-section">
        <h2>${t('drivers')}</h2>
        ${driverRows}
        <div class="admin-row">
          <input class="field" id="newDriverName" placeholder="${t('driverName')}" />
          <input class="field" id="newDriverLabel" placeholder="${t('busLabel')}" />
        </div>
        <div class="admin-row">
          <input class="field" id="newDriverPin" placeholder="${t('pin')}" inputmode="numeric" maxlength="4" />
          <button class="chip-btn" id="addDriverBtn">${t('add')}</button>
        </div>
      </div>

      <div class="admin-section">
        <h2>${t('recentTrips')}</h2>
        ${tripRows}
      </div>

      <button class="text-link" id="adminSignOutBtn" style="margin-top:8px">${t('signOut')}</button>
    </section>
  `;
}

export async function render(root, { t, go }) {
  if (needsBuild || root.dataset.view !== 'admin') {
    if (!cache) {
      root.innerHTML = `<section class="admin-view"><div class="mute">${t('loading')}</div></section>`;
      root.dataset.view = 'admin';
      try {
        await loadAll();
      } catch {
        root.innerHTML = `<section class="admin-view"><div class="mute">${t('connectionError')}</div></section>`;
        return;
      }
    }
    root.innerHTML = sectionHtml(t);
    root.dataset.view = 'admin';
    needsBuild = false;
    wireEvents(root, t, go);
  }
}

function wireEvents(root, t, go) {
  const refresh = async (reload = true) => {
    needsBuild = true;
    if (reload) await loadAll();
    root.innerHTML = sectionHtml(t);
    wireEvents(root, t, go);
    needsBuild = false;
  };

  root.querySelector('#sendMessageBtn').addEventListener('click', async () => {
    await api.setMessage(root.querySelector('#messageInput').value.trim());
    cache.message = root.querySelector('#messageInput').value.trim();
    showToast('✓');
  });

  root.querySelector('#addDepartureBtn').addEventListener('click', async () => {
    const value = root.querySelector('#newDepartureInput').value;
    if (!value) return;
    await api.addDeparture(value);
    await refresh();
  });

  root.querySelectorAll('[data-remove-departure]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.removeDeparture(btn.dataset.removeDeparture);
      await refresh();
    });
  });

  root.querySelector('#addStopBtn').addEventListener('click', () => {
    cache.stops.push({ name: '', lat: 0, lng: 0 });
    refresh(false);
  });

  root.querySelectorAll('[data-remove-stop]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cache.stops.splice(Number(btn.dataset.removeStop), 1);
      refresh(false);
    });
  });

  root.querySelector('#saveStopsBtn').addEventListener('click', async () => {
    const rows = [...root.querySelectorAll('[data-stop-row]')];
    const stops = rows.map((row) => ({
      name: row.querySelector('[data-field="name"]').value.trim(),
      lat: Number(row.querySelector('[data-field="lat"]').value),
      lng: Number(row.querySelector('[data-field="lng"]').value),
    }));
    if (stops.some((s) => !s.name || Number.isNaN(s.lat) || Number.isNaN(s.lng))) {
      showToast('Each stop needs a name, latitude and longitude');
      return;
    }
    try {
      await api.saveStops(stops);
      showToast('✓');
      await refresh();
    } catch {
      showToast('Could not save stops');
    }
  });

  root.querySelector('#addDriverBtn').addEventListener('click', async () => {
    const driverName = root.querySelector('#newDriverName').value.trim();
    const label = root.querySelector('#newDriverLabel').value.trim();
    const pin = root.querySelector('#newDriverPin').value.trim();
    try {
      await api.addDriver(driverName, label, pin);
      await refresh();
    } catch (err) {
      showToast(err.message === 'PIN already in use' ? err.message : 'PIN must be 4 digits, name and bus label required');
    }
  });

  root.querySelectorAll('[data-remove-driver]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.removeDriver(btn.dataset.removeDriver);
      await refresh();
    });
  });

  root.querySelector('#adminSignOutBtn').addEventListener('click', () => {
    setAdminToken(null);
    cache = null;
    needsBuild = true;
    go('home');
  });
}

export function renderBar(bar) {
  bar.innerHTML = '';
}

export function destroy() {
  cache = null;
  needsBuild = true;
}
