# SunuShuttle

A live shuttle tracking PWA for campus bus routes. Students see the bus move on a map and get an ETA to their stop. Drivers start a trip and their phone becomes the tracker. Admins manage routes, stops, schedules, drivers and a message banner.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## How it works

The app has three roles:

- **Student**: picks a route and a stop, sees it on a map with the live bus position, gets an ETA, and can turn on a notification for when the bus is close. No account needed.
- **Driver**: signs in with a 4 digit PIN, taps "Start trip", and the phone's GPS streams position updates to the server for the length of the trip. Each driver is locked to their bus's route.
- **Admin**: signs in with a username and password to edit routes, stops, departure times, drivers, and a short announcement shown to students.

Each route supports more than one bus running at the same time. Each bus shows up as its own marker as soon as its driver starts a trip, and disappears once the trip ends or its last position update goes stale (20 seconds).

## Architecture

- **Frontend**: a vanilla JavaScript PWA built with Vite, no framework. Views are small modules under `src/js/views/` that render into a shared header/body/action-bar shell. State lives in a tiny pub-sub store (`src/js/store.js`), not a framework.
- **Map**: Leaflet with OpenStreetMap tiles, no API key required. Bus markers animate between GPS fixes instead of jumping.
- **Backend**: Vercel serverless functions under `api/`, one file per endpoint (see `docs/API.md`). Deployed region is pinned near the riders in `vercel.json`.
- **Database**: Neon (serverless Postgres). See `db/schema.sql`.
- **Auth**: a driver PIN or an admin password issues a signed, short-lived token (HMAC, not a third-party JWT library) that the frontend stores and sends as a bearer token. PINs and passwords are hashed with bcrypt before they ever touch the database.

Route progress and ETA are computed by projecting the bus's GPS position onto the route polyline (`src/js/geo.js`), not by trusting the device's raw speed reading, since that is frequently null or noisy on phones. GPS jumps implying >160 km/h are rejected server-side, and the client smooths speed over recent fixes before computing the ETA.

### Backup locator (fonek)

Live tracking depends on the driver's phone streaming GPS; if that phone is off, out of
battery, or the app isn't running, the bus simply has no live marker. As an optional
backup, a bus can carry a cheap ESP32 BLE tag running
[**fonek**](https://github.com/lodjim/fonek) by [lodjim](https://github.com/lodjim) — an
open-source tracker that rides Apple's Find My network: the tag broadcasts a public key
over Bluetooth, any nearby iPhone encrypts and uploads its location to Apple, and a
self-hosted fonek backend decrypts it with the tag's private key.

To wire a bus to a fonek tag:

1. Run a fonek backend (see [its README](https://github.com/lodjim/fonek#readme)) and
   register the bus's tag as a device there.
2. Set `FONEK_BASE_URL` and `FONEK_API_KEY` (a fonek API key, see its
   [`docs/api.md`](https://github.com/lodjim/fonek/blob/main/docs/api.md)) in SunuShuttle's
   environment.
3. In the admin panel, under **Drivers**, set that bus's fonek tag to the device's name in
   fonek.

`GET /api/fallback` (see `docs/API.md`) then serves that bus's last known fonek position
whenever it has no live GPS, polled at the same slow cadence as the rest of the idle
student view — fonek reports lag minutes to hours, so this is a "last seen here" marker,
shown muted on the map, never a substitute for the live feed. Leave `FONEK_BASE_URL` /
`FONEK_API_KEY` unset to disable this entirely.

## Performance notes

Built for hundreds of concurrent students on phones:

- Static route data (`/api/state`, edge-cached 30s) is split from the tiny live feed (`/api/live`, polled every 2.5s, edge-cached ~2s).
- Polling backs off to 15s when no bus is live and pauses when the tab is hidden.
- Drivers upload every 3s while moving, heartbeat-only every 12s while standing still.
- See `CONTRIBUTING.md` before changing polling, caching, or payload shapes.

## Project layout

```
api/                  Vercel serverless functions (the backend)
  _lib/                 shared helpers: db client, auth, rate limiting, route resolution
  driver/               driver-only endpoints (require a driver token)
  admin/                admin-only endpoints (require an admin token)
  live.js               tiny high-frequency endpoint the student view polls
  fallback.js           backup bus locator (fonek), polled at idle cadence
  state.js              cached full snapshot (stops, departures, message)
  board.js              public endpoint for "I'm boarding"
  routes.js             public route list
db/
  schema.sql            Postgres schema
docs/
  API.md                endpoint reference
src/
  css/main.css          Plinth design system (flat, press-and-lift)
  js/
    views/              one module per screen
    api.js              fetch client + token storage
    geo.js               route-progress / ETA math
    map.js               Leaflet setup and marker helpers
    store.js             app state
    main.js               wires everything together
scripts/
  generate-icons.js     builds PWA icons from scripts/logo.svg
  migrate.js            applies db/schema.sql to your database
  seed.js               creates starter routes, demo drivers and admin
  mock-api.js           frontend-only stub (no database needed)
```

## Setting up locally

Requirements: Node 20+, and for the real backend a [Neon](https://neon.tech) project (free tier is enough).

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`: your Neon connection string.
   - `AUTH_SECRET`: a random string, e.g. `openssl rand -base64 32`.

3. Apply the schema and seed starter routes:

   ```
   npm run db:migrate
   npm run db:seed
   ```

   The seed script prints demo driver PINs and a generated admin password. Save the admin password, it is not shown again. Update the seeded stop coordinates to match your real routes from the admin panel, or edit `scripts/seed.js` before seeding.

4. Run the app. Local development needs both the static frontend and the `/api` functions running together, which is what the Vercel CLI's dev server does:

   ```
   npx vercel dev
   ```

   On the first run it asks you to link a Vercel project; you can link to a throwaway project for local dev. It reads the same `.env` file through `vercel env pull` or by adding the variables with `vercel env add`.

   Running `npm run dev` (plain Vite) also works for frontend-only work, but `/api` calls will 404 since nothing serves them.

### No database? Use the mock

```
npm run mock:api   # stub API on :5174 (two demo routes, live simulated buses)
npm run dev:mock   # vite with /api proxied to the stub
```

Mock logins: driver PINs `1234` / `5678`, admin `admin` / `admin123`.

## Deploying

The project deploys to Vercel with no extra configuration: it auto-detects the Vite frontend and the `/api` folder as serverless functions.

```
npx vercel link
npx vercel env add DATABASE_URL
npx vercel env add AUTH_SECRET
npx vercel --prod
```

Run `npm run db:migrate` and `npm run db:seed` once against your production `DATABASE_URL` before the first deploy (or point them at a staging database first).

## Security notes

- Driver PINs are 4 digits by design, for a shuttle app low-value target, so they are protected by a server-side lockout (6 failed attempts per IP locks that IP out for 5 minutes) rather than by PIN length.
- The admin password is generated randomly at seed time and never stored in source control.
- Tokens are HMAC-signed and short-lived (12 hours for drivers, 8 hours for admins) but not encrypted. Do not put anything sensitive in a token's claims.
- The "I'm boarding" endpoint is intentionally public (students do not have accounts), so its boarding count is a best-effort headcount, not an audited figure.

## Browser support

Built as an installable PWA: add to home screen on iOS and Android, works offline for the app shell and cached map tiles, shows a connection banner when the network drops. Live GPS tracking and notifications need a real device; desktop browsers can still view the student map.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and small focused PRs welcome.

## Acknowledgements

- The optional backup locator is powered by [**fonek**](https://github.com/lodjim/fonek)
  by [**lodjim**](https://github.com/lodjim), an open-source ESP32 BLE tag + backend for
  tracking your own things over Apple's Find My network. See
  [Backup locator (fonek)](#backup-locator-fonek) above.
- Map tiles and data from [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors.

## License

MIT — see [LICENSE](LICENSE).
