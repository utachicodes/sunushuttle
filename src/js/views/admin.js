import { api, setAdminToken } from '../api.js';
import { showToast } from '../toast.js';

let cache = null; // { routes, stops, departures, drivers, trips, message }
let adminRouteId = null;
let needsBuild = true;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadAll(routeId) {
  const routesRes = await api.getRoutes();
  const routes = routesRes.routes ?? [];
  if (!routes.some((r) => r.id === routeId)) routeId = routes[0]?.id ?? null;
  adminRouteId = routeId;
  if (!routeId) {
    cache = { routes, stops: [], departures: [], drivers: [], trips: [], message: '' };
    return;
  }
  const [stopsRes, departuresRes, driversRes, tripsRes, messageRes] = await Promise.all([
    api.getStops(routeId),
    api.getDepartures(routeId),
    api.getDrivers(routeId),
    api.getTrips(routeId),
    api.getMessage(routeId),
  ]);
  cache = {
    routes,
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
      <nav class="admin-nav" aria-label="Sections">
        <button data-target="sec-routes">${t('routes')}</button>
        <button data-target="sec-message">${t('message')}</button>
        <button data-target="sec-departures">${t('departures')}</button>
        <button data-target="sec-stops">${t('stopNames')}</button>
        <button data-target="sec-drivers">${t('drivers')}</button>
        <button data-target="sec-trips">${t('recentTrips')}</button>
      </nav>
      <div class="admin-section" id="sec-routes">
        <h2>${t('routes')}</h2>
        <div class="route-picker">
          ${(cache.routes ?? [])
            .map(
              (r) => `<button class="stop-chip route-chip${r.id === adminRouteId ? ' sel' : ''}" data-route="${r.id}">${escapeHtml(r.name)}</button>`
            )
            .join('')}
        </div>
        <div class="admin-row" style="margin-top:8px">
          <input class="field" id="newRouteName" placeholder="${t('routeName')}" maxlength="80" />
          <button class="chip-btn" id="addRouteBtn">${t('add')}</button>
        </div>
      </div>
      <div class="admin-section" id="sec-message">
        <h2>${t('message')}</h2>
        <div class="admin-row">
          <input class="field" id="messageInput" maxlength="160" value="${escapeHtml(cache.message ?? '')}" />
          <button class="chip-btn" id="sendMessageBtn">${t('send')}</button>
        </div>
      </div>

      <div class="admin-section" id="sec-departures">
        <h2>${t('departures')}</h2>
        ${departureRows}
        <div class="admin-row">
          <input class="field" id="newDepartureInput" type="time" />
          <button class="chip-btn" id="addDepartureBtn">${t('add')}</button>
        </div>
      </div>

      <div class="admin-section" id="sec-stops">
        <h2>${t('stopNames')}</h2>
        ${stopsRows}
        <div class="admin-row">
          <button class="chip-btn" id="addStopBtn" style="flex:1">${t('add')}</button>
          <button class="chip-btn" id="locateStopBtn" style="flex:1">◎ ${t('useMyLocation')}</button>
        </div>
        <button class="btn btn-primary" id="saveStopsBtn" style="margin-top:10px">${t('saveStops')}</button>
      </div>

      <div class="admin-section" id="sec-drivers">
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

      <div class="admin-section" id="sec-trips">
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
        await loadAll(adminRouteId);
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
  const refresh = async (reload = true, routeId = adminRouteId) => {
    needsBuild = true;
    if (reload) await loadAll(routeId);
    root.innerHTML = sectionHtml(t);
    wireEvents(root, t, go);
    needsBuild = false;
  };

  root.querySelector('#sendMessageBtn').addEventListener('click', async () => {
    await api.setMessage(root.querySelector('#messageInput').value.trim(), adminRouteId);
    cache.message = root.querySelector('#messageInput').value.trim();
    showToast('✓');
  });

  root.querySelector('#addDepartureBtn').addEventListener('click', async () => {
    const value = root.querySelector('#newDepartureInput').value;
    if (!value) return;
    await api.addDeparture(value, adminRouteId);
    await refresh();
  });

  root.querySelectorAll('[data-remove-departure]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.removeDeparture(btn.dataset.removeDeparture, adminRouteId);
      await refresh();
    });
  });

  root.querySelectorAll('.admin-section .route-picker [data-route]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await refresh(true, btn.dataset.route);
    });
  });

  root.querySelector('#addRouteBtn').addEventListener('click', async () => {
    const name = root.querySelector('#newRouteName').value.trim();
    if (!name) return;
    try {
      const { route } = await api.addRoute(name);
      showToast('✓');
      await refresh(true, route.id);
    } catch {
      showToast('Could not add route');
    }
  });

  root.querySelectorAll('.admin-nav [data-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelector(`#${btn.dataset.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  root.querySelector('#addStopBtn').addEventListener('click', () => {
    cache.stops.push({ name: '', lat: 0, lng: 0 });
    refresh(false);
  });

  root.querySelector('#locateStopBtn').addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast(t('locationDenied'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cache.stops.push({
          name: '',
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
        });
        refresh(false);
      },
      () => showToast(t('locationDenied')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
      await api.saveStops(stops, adminRouteId);
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
      await api.addDriver(driverName, label, pin, adminRouteId);
      await refresh();
    } catch (err) {
      showToast(err.message === 'PIN already in use' ? err.message : 'PIN must be 4 digits, name and bus label required');
    }
  });

  root.querySelectorAll('[data-remove-driver]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.removeDriver(btn.dataset.removeDriver, adminRouteId);
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
  adminRouteId = null;
  needsBuild = true;
}
