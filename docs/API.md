# SunuShuttle API reference

Base path is `/api`. All timestamps are ISO 8601, all coordinates decimal degrees (WGS84).

Auth: driver and admin endpoints take `Authorization: Bearer <token>`. Tokens are HMAC-signed, short-lived (drivers 12h, admins 8h) and carry no secrets.

Conventions: `400` validation error, `401` bad/missing token, `429` IP lockout on logins (`Retry-After` header, seconds), `405` wrong method.

## Public

### `GET /api/routes`
List routes, oldest first.
→ `{ routes: [{ id, name }] }`

### `GET /api/state?route=<id>`
Full static snapshot for one route (defaults to oldest). Cached 30s at the edge.
→ `{ route: { id, name }, stops: [{ id, name, lat, lng }], departures: ["HH:MM"], message, buses: [live…] }`
`buses` uses the same shape as `/api/live` (positions fresher than 20s only).

### `GET /api/live?route=<id>`
Tiny high-frequency feed polled every ~2.5s. Edge-cached ~2s.
→ `{ buses: [{ id, label, lat, lng, speedKmh, heading, boarded, updatedAt }], at }`

### `POST /api/board`
Body `{ busId }`. Increments the open trip's headcount (best effort, public by design).
→ `{ boarded }` · `400` when no trip is open.

## Driver (driver token)

### `POST /api/driver/login`
Body `{ pin: "1234" }` (4 digits, 6 tries per IP then 5min lockout).
→ `{ token, bus: { id, label, driverName, routeId } }`

### `POST /api/driver/trip-start`
Closes any open trip for the bus, opens a new one.
→ `{ tripId, startedAt }`

### `POST /api/driver/position`
Body `{ lat, lng, speedKmh = 0, heading = null }`. Requires an open trip. Fixes implying >160 km/h are rejected as GPS noise (previous fix kept); speed clamped to 0–120.
→ `{ ok: true }`

### `POST /api/driver/trip-end`
Idempotent close of the open trip.
→ `{ tripId | null, boarded }`

## Admin (admin token, `?route=` scoped, oldest fallback)

| Endpoint | Method | Body | Returns |
|---|---|---|---|
| `/api/admin/login` | POST | `{ username, password }` | `{ token }` |
| `/api/admin/routes` | GET | — | `{ routes }` |
| `/api/admin/routes` | POST | `{ name }` | `{ route }` |
| `/api/admin/routes` | DELETE | `{ id }` | `{ ok }` (refuses last route) |
| `/api/admin/stops` | GET | — | `{ stops }` |
| `/api/admin/stops` | PUT | `{ stops: [{ name, lat, lng }] }` (≥2, full replace) | `{ ok }` |
| `/api/admin/departures` | GET | — | `{ departures: ["HH:MM"] }` |
| `/api/admin/departures` | POST | `{ time: "HH:MM" }` | `{ ok }` |
| `/api/admin/departures` | DELETE | `{ time }` | `{ ok }` |
| `/api/admin/drivers` | GET | — | `{ drivers: [{ id, label, driverName }] }` |
| `/api/admin/drivers` | POST | `{ driverName, label, pin }` | `{ driver }` |
| `/api/admin/drivers` | DELETE | `{ id }` | `{ ok }` |
| `/api/admin/message` | GET | — | `{ message }` |
| `/api/admin/message` | PUT | `{ message }` (160 chars) | `{ ok }` |
| `/api/admin/trips` | GET | — | `{ trips: [{ id, driverName, label, startedAt, endedAt, boarded }] }` (last 20) |
