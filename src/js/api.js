const DRIVER_TOKEN_KEY = 'sunushuttle:driverToken';
const DRIVER_BUS_KEY = 'sunushuttle:driverBus';
const ADMIN_TOKEN_KEY = 'sunushuttle:adminToken';

export class ApiError extends Error {
  constructor(message, status, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 0);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty body */
  }

  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? 0);
    throw new ApiError(data?.error ?? 'request_failed', response.status, retryAfter);
  }
  return data;
}

export function getDriverToken() {
  try {
    return localStorage.getItem(DRIVER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setDriverToken(token) {
  try {
    if (token) localStorage.setItem(DRIVER_TOKEN_KEY, token);
    else localStorage.removeItem(DRIVER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredDriverBus() {
  try {
    const raw = localStorage.getItem(DRIVER_BUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredDriverBus(bus) {
  try {
    if (bus) localStorage.setItem(DRIVER_BUS_KEY, JSON.stringify(bus));
    else localStorage.removeItem(DRIVER_BUS_KEY);
  } catch {
    /* ignore */
  }
}

export function getAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export const api = {
  state: (routeId) => request(routeId ? `/api/state?route=${routeId}` : '/api/state'),

  driverLogin: (pin) => request('/api/driver/login', { method: 'POST', body: { pin } }),
  tripStart: () => request('/api/driver/trip-start', { method: 'POST', token: getDriverToken() }),
  tripEnd: () => request('/api/driver/trip-end', { method: 'POST', token: getDriverToken() }),
  sendPosition: (lat, lng, speedKmh, heading) =>
    request('/api/driver/position', {
      method: 'POST',
      token: getDriverToken(),
      body: { lat, lng, speedKmh, heading },
    }),
  board: (busId) => request('/api/board', { method: 'POST', body: { busId } }),

  adminLogin: (username, password) =>
    request('/api/admin/login', { method: 'POST', body: { username, password } }),
  getStops: () => request('/api/admin/stops', { token: getAdminToken() }),
  saveStops: (stops) =>
    request('/api/admin/stops', { method: 'PUT', token: getAdminToken(), body: { stops } }),
  getDepartures: () => request('/api/admin/departures', { token: getAdminToken() }),
  addDeparture: (time) =>
    request('/api/admin/departures', { method: 'POST', token: getAdminToken(), body: { time } }),
  removeDeparture: (time) =>
    request('/api/admin/departures', { method: 'DELETE', token: getAdminToken(), body: { time } }),
  getDrivers: () => request('/api/admin/drivers', { token: getAdminToken() }),
  addDriver: (driverName, label, pin) =>
    request('/api/admin/drivers', {
      method: 'POST',
      token: getAdminToken(),
      body: { driverName, label, pin },
    }),
  removeDriver: (id) =>
    request('/api/admin/drivers', { method: 'DELETE', token: getAdminToken(), body: { id } }),
  getMessage: () => request('/api/admin/message', { token: getAdminToken() }),
  setMessage: (message) =>
    request('/api/admin/message', { method: 'PUT', token: getAdminToken(), body: { message } }),
  getTrips: () => request('/api/admin/trips', { token: getAdminToken() }),
};
