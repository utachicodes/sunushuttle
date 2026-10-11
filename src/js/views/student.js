import { createMap, drawRoute, fitToStops, createBusMarker, createLayerGroup } from '../map.js';
import { etaMinutes, routeFraction, cumulativeStopDistances } from '../geo.js';
import { showToast } from '../toast.js';
import { translate } from '../i18n.js';
import { api } from '../api.js';

let map = null;
let routeLayer = null;
let busLayer = null;
let busMarkers = new Map();
let drawnStopsKey = '';
let fitted = false;
let fittedRoute = null;

function persistStopIndex(i) {
  try { localStorage.setItem('sunushuttle:stopIndex', String(i)); } catch { /* ignore */ }
}

function persistNotify(on) {
  try { localStorage.setItem('sunushuttle:notify', on ? '1' : '0'); } catch { /* ignore */ }
}

function skeleton(t) {
  return `
    <section class="student-view">
      <div class="announcement" id="announcement" hidden></div>
      <div class="status-strip">
        <div class="route-picker" id="routePicker" role="listbox"></div>
        <div class="plate-head">
          <img src="/logo-daust.png" alt="DAUST" class="student-logo" onerror="this.remove()" />
          <div class="live-pill" id="livePill"><i></i><span id="liveLabel"></span></div>
        </div>
      </div>
      <div class="map-shell">
        <div id="studentMap"></div>
        <div class="eta-float">
          <div class="num" id="etaNumber" aria-live="polite"></div>
          <div class="mute sub" id="etaSub"></div>
        </div>
        <button class="map-recenter" id="recenterBtn" aria-label="Recenter map">⌖</button>
        <div class="map-caption">${t('figLine')}</div>
      </div>
      <div class="route-wrap">
        <div class="route-diagram" id="routeDiagram" aria-hidden="true">
          <div class="route-line"></div>
          <div class="route-fill" id="routeFill"></div>
          <div class="route-stops" id="routeStops"></div>
        </div>
        <div class="mute line-legend">${t('lineLegend')}</div>
      </div>
      <div class="stop-picker" id="stopPicker" role="listbox" aria-label="${t('yourStop')}"></div>
      <div class="departures-row" id="departuresRow"></div>
    </section>
  `;
}

function activeBus(data) {
  return data?.buses?.[0] ?? null;
}

export function render(root, { store, t, lang }) {
  const { state, setState } = store;
  const data = state.data;

  if (root.dataset.view !== 'student') {
    root.innerHTML = skeleton(t);
    root.dataset.view = 'student';
    map = createMap(document.getElementById('studentMap'));
    routeLayer = createLayerGroup(map);
    busLayer = createLayerGroup(map);
    drawnStopsKey = '';
    fitted = false;
    fittedRoute = null;
    busMarkers = new Map();
  }

  const routes = state.routes ?? [];
  const pickerEl = document.getElementById('routePicker');
  if (pickerEl && routes.length > 1) {
    const routesKey = routes.map((r) => r.id).join(',') + ':' + (state.selectedRouteId ?? state.data?.route?.id);
    if (pickerEl.dataset.key !== routesKey) {
      pickerEl.dataset.key = routesKey;
      const activeId = state.selectedRouteId ?? state.data?.route?.id;
      pickerEl.innerHTML = routes
        .map(
          (r) => `<button class="stop-chip route-chip${r.id === activeId ? ' sel' : ''}" data-route="${r.id}" role="option" aria-selected="${r.id === activeId}">${escapeHtml(r.name)}</button>`
        )
        .join('');
      pickerEl.querySelectorAll('[data-route]').forEach((btn) => {
        btn.addEventListener('click', () => selectRoute(btn.dataset.route));
      });
    }
    pickerEl.hidden = false;
  } else if (pickerEl) {
    pickerEl.hidden = true;
  }

  const announcementEl = document.getElementById('announcement');
  if (state.offline) {
    announcementEl.hidden = false;
    announcementEl.textContent = t('offline');
  } else if (data?.message) {
    announcementEl.hidden = false;
    announcementEl.textContent = data.message;
  } else {
    announcementEl.hidden = true;
  }

  const stops = data?.stops ?? [];
  const stopsKey = stops.map((s) => s.id).join(',');
  if (stopsKey && stopsKey !== drawnStopsKey) {
    drawRoute(map, routeLayer, stops, state.selectedStopIndex, (i) => selectStop(i));
    drawnStopsKey = stopsKey;
    if (!fitted || fittedRoute !== (data?.route?.id ?? null)) {
      fitToStops(map, stops);
      fitted = true;
      fittedRoute = data?.route?.id ?? null;
    }
  } else if (stopsKey) {
    drawRoute(map, routeLayer, stops, state.selectedStopIndex, (i) => selectStop(i));
  }

  const buses = data?.buses ?? [];
  const bus = buses[0] ?? null;
  const liveIds = new Set(buses.map((b) => b.id));
  for (const [id, marker] of busMarkers) {
    if (!liveIds.has(id)) {
      busLayer.removeLayer(marker);
      busMarkers.delete(id);
    }
  }
  for (const b of buses) {
    const marker = busMarkers.get(b.id);
    if (!marker) {
      busMarkers.set(b.id, createBusMarker(busLayer, [b.lat, b.lng], b.label));
    } else {
      marker._moveTo([b.lat, b.lng], 2800);
    }
  }

  const pill = document.getElementById('livePill');
  const label = document.getElementById('liveLabel');
  pill.className = 'live-pill' + (bus ? ' on' : '');
  label.textContent = bus ? t('onItsWay') : t('notRunning');

  const etaEl = document.getElementById('etaNumber');
  const subEl = document.getElementById('etaSub');
  const stop = stops[state.selectedStopIndex];

  if (bus && stop) {
    const minutes = etaMinutes({ lat: bus.lat, lng: bus.lng }, stops, state.selectedStopIndex, bus.speedKmh);
    if (minutes === null) {
      etaEl.textContent = t('passedStop');
      subEl.textContent = '';
    } else if (minutes === 0) {
      etaEl.textContent = t('arriving');
      subEl.textContent = t('untilStop', { stop: stop.name });
    } else {
      etaEl.textContent = `${minutes} ${t('min')}`;
      subEl.textContent = t('untilStop', { stop: stop.name });
    }
    maybeNotify(minutes, stop, state, setState, t);
  } else if (data) {
    etaEl.textContent = data.departures?.[0] ?? '--:--';
    subEl.textContent = t('nextDeparture');
  } else {
    etaEl.textContent = state.loadError ? '--:--' : t('loading');
    subEl.textContent = state.loadError ? t('connectionError') : '';
  }

  const picker = document.getElementById('stopPicker');
  const chipsKey = stops.map((s) => s.id).join(',') + ':' + state.selectedStopIndex;
  if (picker.dataset.key !== chipsKey) {
    picker.dataset.key = chipsKey;
    picker.innerHTML = stops
      .map(
        (s, i) => `<button class="stop-chip${i === state.selectedStopIndex ? ' sel' : ''}" data-i="${i}" role="option" aria-selected="${i === state.selectedStopIndex}">${escapeHtml(s.name)}</button>`
      )
      .join('');
    picker.querySelectorAll('[data-i]').forEach((btn) => {
      btn.addEventListener('click', () => selectStop(Number(btn.dataset.i)));
    });
  }

  document.getElementById('departuresRow').innerHTML = (data?.departures ?? [])
    .map((d) => `<span class="dep-chip">${escapeHtml(d)}</span>`)
    .join('');

  const fill = document.getElementById('routeFill');
  const dots = document.getElementById('routeStops');
  if (fill && dots) {
    if (bus && stops.length > 1) {
      const dists = cumulativeStopDistances(stops);
      const total = dists[dists.length - 1] || 1;
      fill.style.width = `${Math.round(routeFraction({ lat: bus.lat, lng: bus.lng }, stops) * 100)}%`;
      const dotsKey = `${stopsKey}:${state.selectedStopIndex}`;
      if (dots.dataset.key !== dotsKey) {
        dots.dataset.key = dotsKey;
        dots.innerHTML = stops
          .map(
            (s, i) =>
              `<i style="left:${((dists[i] / total) * 100).toFixed(2)}%" class="${i === state.selectedStopIndex ? 'sel' : ''}" title="${escapeHtml(s.name)}"></i>`
          )
          .join('');
      }
    } else {
      fill.style.width = '0%';
      dots.innerHTML = '';
      dots.dataset.key = '';
    }
  }

  function selectStop(i) {
    persistStopIndex(i);
    setState({ selectedStopIndex: i, notifiedForStop: null });
  }

  async function selectRoute(id) {
    try { localStorage.setItem('sunushuttle:routeId', id); } catch { /* ignore */ }
    setState({ selectedRouteId: id, selectedStopIndex: 0, notifiedForStop: null, loadError: false });
    try {
      const next = await api.state(id);
      setState({ data: next });
    } catch {
      setState({ loadError: true });
    }
  }

  const recenterBtn = document.getElementById('recenterBtn');
  if (recenterBtn) {
    recenterBtn.onclick = () => {
      if (map && stops.length) fitToStops(map, stops);
    };
  }
}

function maybeNotify(minutes, stop, state, setState, t) {
  if (!state.notify) return;
  if (minutes === null || minutes > 5) return;
  if (state.notifiedForStop === stop.id) return;
  setState({ notifiedForStop: stop.id });
  const message = translate(state.lang, 'closeToStop', { stop: stop.name });
  showToast(message);
  try {
    if (Notification.permission === 'granted') new Notification('SunuShuttle', { body: message });
  } catch { /* notifications unsupported */ }
}

export function renderBar(bar, { store, t }) {
  const { state, setState } = store;
  const bus = activeBus(state.data);
  bar.innerHTML = `
    <button class="btn btn-primary" id="notifyBtn" aria-pressed="${state.notify}">${state.notify ? '✓ ' + t('notifyOn') : t('notify')}</button>
    <button class="btn btn-ghost" id="boardBtn" ${bus ? '' : 'hidden'}>${t('boarding')}</button>
  `;
  document.getElementById('notifyBtn').addEventListener('click', async () => {
    const next = !state.notify;
    persistNotify(next);
    setState({ notify: next, notifiedForStop: null });
    if (next) {
      try {
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch { /* ignore */ }
    }
  });
  const boardBtn = document.getElementById('boardBtn');
  if (boardBtn && bus) {
    boardBtn.addEventListener('click', async () => {
      try {
        await api.board(bus.id);
        showToast(t('boardingNoted'));
      } catch { /* best effort */ }
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function destroy() {
  if (map) {
    map.remove();
    map = null;
  }
  routeLayer = null;
  busLayer = null;
  busMarkers = new Map();
  drawnStopsKey = '';
  fitted = false;
  fittedRoute = null;
}
