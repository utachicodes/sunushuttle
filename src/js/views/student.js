import { createMap, drawRoute, fitToStops, createBusMarker, createLayerGroup } from '../map.js';
import { etaMinutes } from '../geo.js';
import { showToast } from '../toast.js';
import { translate } from '../i18n.js';
import { api } from '../api.js';

let map = null;
let routeLayer = null;
let busLayer = null;
let busMarkers = new Map();
let drawnStopsKey = '';
let fitted = false;

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
        <div class="live-pill" id="livePill"><i></i><span id="liveLabel"></span></div>
        <div class="num" id="etaNumber" aria-live="polite"></div>
        <div class="mute sub" id="etaSub"></div>
      </div>
      <div class="map-shell"><div id="studentMap" style="width:100%;height:100%"></div></div>
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
    busMarkers = new Map();
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
    if (!fitted) {
      fitToStops(map, stops);
      fitted = true;
    }
  } else if (stopsKey) {
    drawRoute(map, routeLayer, stops, state.selectedStopIndex, (i) => selectStop(i));
  }

  const bus = activeBus(data);
  const liveIds = new Set(bus ? [bus.id] : []);
  for (const [id, marker] of busMarkers) {
    if (!liveIds.has(id)) {
      busLayer.removeLayer(marker);
      busMarkers.delete(id);
    }
  }
  if (bus) {
    let marker = busMarkers.get(bus.id);
    if (!marker) {
      marker = createBusMarker(busLayer, [bus.lat, bus.lng], bus.label);
      busMarkers.set(bus.id, marker);
    } else {
      marker._moveTo([bus.lat, bus.lng], 2800);
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

  document.getElementById('departuresRow').textContent = data?.departures?.length
    ? data.departures.join('   ')
    : '';

  function selectStop(i) {
    persistStopIndex(i);
    setState({ selectedStopIndex: i, notifiedForStop: null });
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
}
