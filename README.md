# SunuShuttle

A live shuttle tracking PWA for a campus bus route. Students see the bus move on a map and get an ETA to their stop. Drivers start a trip and their phone becomes the tracker. Admins manage stops, schedules, drivers and a message banner.

## How it works

The app has three roles:

- **Student**: picks a stop, sees it on a map with the live bus position, gets an ETA, and can turn on a notification for when the bus is close. No account needed.
- **Driver**: signs in with a 4 digit PIN, taps "Start trip", and the phone's GPS streams position updates to the server every few seconds for the length of the trip.
- **Admin**: signs in with a username and password to edit stops, departure times, drivers, and a short announcement shown to students.

The route supports more than one bus running at the same time. Each bus shows up as its own marker as soon as its driver starts a trip, and disappears once the trip ends or its last position update goes stale (20 seconds).

## Architecture

- **Frontend**: a vanilla JavaScript PWA built with Vite, no framework. Views are small modules under `src/js/views/` that render into a shared header/body/action-bar shell. State lives in a tiny pub-sub store (`src/js/store.js`), not a framework.
- **Map**: Leaflet with OpenStreetMap tiles, no API key required. Bus markers animate between GPS fixes instead of jumping.
- **Backend**: Vercel serverless functions under `api/`, one file per endpoint.
- **Database**: Neon (serverless Postgres). See `db/schema.sql`.
- **Auth**: a driver PIN or an admin password issues a signed, short-lived token (HMAC, not a third-party JWT library) that the frontend stores and sends as a bearer token. PINs and passwords are hashed with bcrypt before they ever touch the database.

Route progress and ETA are computed by projecting the bus's GPS position onto the route polyline (`src/js/geo.js`), not by trusting the device's raw speed reading, since that is frequently null or noisy on phones.

## Project layout

```
api/                  Vercel serverless functions (the backend)
  _lib/                 shared helpers: db client, auth, rate limiting
  driver/               driver-only endpoints (require a driver token)
  admin/                admin-only endpoints (require an admin token)
  state.js              public endpoint the student view polls
  board.js              public endpoint for "I'm boarding"
db/
  schema.sql            Postgres schema
src/
  css/main.css          design system and layout
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
  seed.js               creates a starter route, demo driver and admin
```

## Setting up locally

Requirements: Node 20+, a [Neon](https://neon.tech) project (free tier is enough).

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`: your Neon connection string.
   - `AUTH_SECRET`: a random string, e.g. `openssl rand -base64 32`.

3. Apply the schema and seed a starter route:

   ```
   npm run db:migrate
   npm run db:seed
   ```

   The seed script prints a demo driver PIN and a generated admin password. Save the admin password, it is not shown again. Update the seeded stop coordinates to match your real route from the admin panel, or edit `scripts/seed.js` before seeding.

4. Run the app. Local development needs both the static frontend and the `/api` functions running together, which is what the Vercel CLI's dev server does:

   ```
   npx vercel dev
   ```

   On the first run it asks you to link a Vercel project; you can link to a throwaway project for local dev. It reads the same `.env` file through `vercel env pull` or by adding the variables with `vercel env add`.

   Running `npm run dev` (plain Vite) also works for frontend-only work, but `/api` calls will 404 since nothing serves them.

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
