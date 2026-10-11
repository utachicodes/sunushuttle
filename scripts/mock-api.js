// Mock API for frontend-only testing. Serves the same shapes as the real
// Vercel functions so the student/driver/admin views can be exercised
// without a database. Simulated buses drive each route in a loop.
//
// Usage (two terminals):
//   npm run mock:api     # serves :5174
//   npm run dev:mock     # vite dev with /api proxied to :5174
//
// Demo credentials (also printed on start):
//   driver PINs: 1234 (Main Line), 5678 (Airport Express)
//   admin: admin / admin123

import http from 'node:http';

const PORT = 5174;
const TICK_MS = 2000;
const BUS_SPEED_KMH = 24;

const state = {
  routes: [
    { id: 'r1', name: 'DAUST Main Line' },
    { id: 'r2', name: 'Airport Express' },
  ],
  stops: {
    r1: [
      { id: 's1', name: 'Campus Gate', lat: 14.6937, lng: -17.4441 },
      { id: 's2', name: 'Market Junction', lat: 14.7012, lng: -17.4378 },
      { id: 's3', name: 'Library Square', lat: 14.7089, lng: -17.4315 },
      { id: 's4', name: 'Roundabout', lat: 14.7163, lng: -17.4252 },
      { id: 's5', name: 'Town Terminal', lat: 14.7238, lng: -17.4189 },
    ],
    r2: [
      { id: 't1', name: 'Campus Gate', lat: 14.6937, lng: -17.4441 },
      { id: 't2', name: 'Stadium', lat: 14.6862, lng: -17.4553 },
      { id: 't3', name: 'Airport', lat: 14.6772, lng: -17.4909 },
    ],
  },
  departures: {
    r1: ['07:30', '12:30', '18:15', '20:30'],
    r2: ['08:00', '13:00', '19:00'],
  },
  messages: {
    r1: 'Welcome aboard — mock data running',
    r2: 'Express service, limited stops',
  },
  buses: [
    { id: 'bus-1', routeId: 'r1', label: 'Bus 1', seg: 0, frac: 0.0, boarded: 3, speedKmh: BUS_SPEED_KMH, driven: false },
    { id: 'bus-2', routeId: 'r1', label: 'Bus 2', seg: 2, frac: 0.5, boarded: 7, speedKmh: BUS_SPEED_KMH, driven: false },
    { id: 'bus-3', routeId: 'r2', label: 'Navette A', seg: 0, frac: 0.3, boarded: 11, speedKmh: 30, driven: false },
  ],
  drivers: [
    { id: 'd1', routeId: 'r1', label: 'Bus 1', driverName: 'Demo Driver' },
    { id: 'd2', routeId: 'r1', label: 'Bus 2', driverName: 'Awa Diallo' },
    { id: 'd3', routeId: 'r2', label: 'Navette A', driverName: 'Moussa Sy' },
  ],
  trips: [
    { id: 't3', routeId: 'r1', driverName: 'Awa Diallo', label: 'Bus 2', startedAt: new Date(Date.now() - 90 * 60000).toISOString(), endedAt: new Date(Date.now() - 55 * 60000).toISOString(), boarded: 21 },
    { id: 't2', routeId: 'r1', driverName: 'Demo Driver', label: 'Bus 1', startedAt: new Date(Date.now() - 200 * 60000).toISOString(), endedAt: new Date(Date.now() - 165 * 60000).toISOString(), boarded: 18 },
    { id: 't1', routeId: 'r2', driverName: 'Moussa Sy', label: 'Navette A', startedAt: new Date(Date.now() - 400 * 60000).toISOString(), endedAt: new Date(Date.now() - 370 * 60000).toISOString(), boarded: 26 },
  ],
  openTrip: null,
};

function routeIdOf(url) {
  const q = url.searchParams.get('route');
  if (q && state.routes.some((r) => r.id === q)) return q;
  return state.routes[0].id;
}

function haversineKm(a, b) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function busPosition(bus) {
  if (bus.driven && Number.isFinite(bus.lat) && Number.isFinite(bus.lng)) {
    return { lat: bus.lat, lng: bus.lng };
  }
  const stops = state.stops[bus.routeId];
  const a = stops[bus.seg];
  const b = stops[(bus.seg + 1) % stops.length];
  return {
    lat: a.lat + (b.lat - a.lat) * bus.frac,
    lng: a.lng + (b.lng - a.lng) * bus.frac,
  };
}

setInterval(() => {
  for (const bus of state.buses) {
    if (bus.driven) continue; // a real driver tab is steering this one
    const stops = state.stops[bus.routeId];
    const a = stops[bus.seg];
    const b = stops[(bus.seg + 1) % stops.length];
    const segKm = haversineKm(a, b) || 0.001;
    bus.frac += ((bus.speedKmh / 3600) * (TICK_MS / 1000)) / segKm;
    if (bus.frac >= 1) {
      bus.frac = 0;
      bus.seg = (bus.seg + 1) % stops.length;
    }
  }
}, TICK_MS);

function send(res, status, json) {
  const body = JSON.stringify(json);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const routeId = routeIdOf(url);

  if (req.method === 'GET' && path === '/api/routes') {
    return send(res, 200, { routes: state.routes });
  }

  // Public state — the student view polls this.
  if (req.method === 'GET' && path === '/api/state') {
    const route = state.routes.find((r) => r.id === routeId);
    return send(res, 200, {
      route: { id: route.id, name: route.name },
      stops: state.stops[routeId],
      departures: state.departures[routeId] ?? [],
      message: state.messages[routeId] ?? '',
      buses: state.buses
        .filter((b) => b.routeId === routeId)
        .map((b) => ({ ...busPosition(b), id: b.id, label: b.label, speedKmh: b.speedKmh, heading: null, boarded: b.boarded, updatedAt: new Date().toISOString() })),
    });
  }

  if (req.method === 'POST' && path === '/api/board') {
    const { busId } = await readBody(req);
    const bus = state.buses.find((b) => b.id === busId) ?? state.buses[0];
    if (!bus) return send(res, 400, { error: 'No active trip' });
    bus.boarded += 1;
    return send(res, 200, { boarded: bus.boarded });
  }

  // Driver auth + trip endpoints. Any token is accepted.
  if (req.method === 'POST' && path === '/api/driver/login') {
    const { pin } = await readBody(req);
    const pins = { 1234: state.drivers[0], 5678: state.drivers[2] };
    const driver = pins[pin];
    if (driver) {
      return send(res, 200, { token: 'mock-driver-token', bus: { id: driver.id === 'd3' ? 'bus-3' : 'bus-1', label: driver.label, driverName: driver.driverName, routeId: driver.routeId } });
    }
    return send(res, 401, { error: 'Wrong PIN' });
  }
  if (req.method === 'POST' && path === '/api/driver/trip-start') {
    state.openTrip = { tripId: `t${Date.now()}`, startedAt: new Date().toISOString() };
    state.buses[0].driven = true;
    return send(res, 200, state.openTrip);
  }
  if (req.method === 'POST' && path === '/api/driver/position') {
    if (!state.openTrip) return send(res, 400, { error: 'No active trip' });
    const { lat, lng, speedKmh } = await readBody(req);
    const bus = state.buses[0];
    bus.driven = true;
    bus.lat = lat;
    bus.lng = lng;
    if (Number.isFinite(speedKmh)) bus.speedKmh = speedKmh;
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/api/driver/trip-end') {
    const trip = state.openTrip;
    state.openTrip = null;
    for (const b of state.buses) b.driven = false;
    return send(res, 200, { tripId: trip?.tripId ?? null, boarded: state.buses[0].boarded });
  }

  // Admin auth + CRUD (in-memory).
  if (req.method === 'POST' && path === '/api/admin/login') {
    const { username, password } = await readBody(req);
    if (username === 'admin' && password === 'admin123') return send(res, 200, { token: 'mock-admin-token' });
    return send(res, 401, { error: 'Wrong credentials' });
  }
  if (path === '/api/admin/routes') {
    if (req.method === 'GET') return send(res, 200, { routes: state.routes });
    const body = await readBody(req);
    if (req.method === 'POST' && String(body.name ?? '').trim()) {
      const route = { id: `r${Date.now()}`, name: String(body.name).trim().slice(0, 80) };
      state.routes.push(route);
      state.stops[route.id] = [];
      state.departures[route.id] = [];
      state.messages[route.id] = '';
      return send(res, 200, { route });
    }
    return send(res, 200, { ok: true });
  }
  if (path === '/api/admin/stops') {
    if (req.method === 'GET') return send(res, 200, { stops: state.stops[routeId] ?? [] });
    if (req.method === 'PUT') {
      const { stops } = await readBody(req);
      if (Array.isArray(stops) && stops.length >= 2) {
        state.stops[routeId] = stops.map((s, i) => ({ id: `s${i + 1}`, name: s.name, lat: s.lat, lng: s.lng }));
        for (const b of state.buses.filter((x) => x.routeId === routeId)) {
          b.seg = 0;
          b.frac = 0;
        }
      }
      return send(res, 200, { ok: true });
    }
  }
  if (path === '/api/admin/departures') {
    if (req.method === 'GET') return send(res, 200, { departures: state.departures[routeId] ?? [] });
    const { time } = await readBody(req);
    state.departures[routeId] = state.departures[routeId] ?? [];
    if (req.method === 'POST' && time && !state.departures[routeId].includes(time)) {
      state.departures[routeId].push(time);
      state.departures[routeId].sort();
    }
    if (req.method === 'DELETE' && time) state.departures[routeId] = state.departures[routeId].filter((d) => d !== time);
    return send(res, 200, { ok: true });
  }
  if (path === '/api/admin/drivers') {
    if (req.method === 'GET') return send(res, 200, { drivers: state.drivers.filter((d) => d.routeId === routeId) });
    const body = await readBody(req);
    if (req.method === 'POST') {
      const driver = { id: `d${Date.now()}`, routeId, driverName: body.driverName, label: body.label };
      state.drivers.push(driver);
      return send(res, 200, { driver });
    }
    if (req.method === 'DELETE') {
      state.drivers = state.drivers.filter((d) => d.id !== body.id);
      return send(res, 200, { ok: true });
    }
  }
  if (path === '/api/admin/message') {
    if (req.method === 'GET') return send(res, 200, { message: state.messages[routeId] ?? '' });
    if (req.method === 'PUT') {
      const { message } = await readBody(req);
      state.messages[routeId] = String(message ?? '').slice(0, 160);
      return send(res, 200, { ok: true });
    }
  }
  if (req.method === 'GET' && path === '/api/admin/trips') {
    return send(res, 200, { trips: state.trips.filter((x) => x.routeId === routeId) });
  }

  return send(res, 404, { error: 'Not found (mock)' });
});

server.listen(PORT, () => {
  console.log(`Mock SunuShuttle API on http://localhost:${PORT}`);
  console.log('  driver PINs: 1234 / 5678      admin: admin / admin123');
});
