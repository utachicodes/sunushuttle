# Contributing to SunuShuttle

Thanks for helping out. Small, focused pull requests beat big rewrites.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (any Postgres works locally, Neon for deploy) and `AUTH_SECRET` (`openssl rand -base64 32`).
3. `npm run db:migrate && npm run db:seed`
4. `npx vercel dev` for full-stack local dev (frontend + `/api` together).

No database handy? Run the stub instead:

```
npm run mock:api   # :5174, two demo routes with live simulated buses
npm run dev:mock   # vite with /api proxied to the stub
```

Demo logins against the mock or a fresh seed: driver PIN `1234` (Main Line) / `5678` (Airport Express), admin `admin` / `admin123` (mock) or the generated password printed by `seed.js`.

## Conventions

- Vanilla JS, no framework. One module per view under `src/js/views/`, each exporting `render(root, ctx)`, `renderBar(bar, ctx)` (optional) and `destroy()` (optional).
- Shared state lives in `src/js/store.js` (tiny pub-sub). Persist user choices in `localStorage` directly in the view, following `student.js`.
- Every string users see goes through `src/js/i18n.js` in **both** `en` and `fr`.
- Design system is "Plinth": flat paper surfaces, 2px ink outlines, hard offset shadows, press-and-lift interaction. Keep every class/ID referenced by the views (they are queried by name).
- Backend: one file per endpoint under `api/`, shared helpers in `api/_lib/`. Admin endpoints scope with `resolveRouteId(req)` (`?route=`, oldest fallback). Never trust client input: validate shapes, use parameterized queries (the `sql` tag).
- Americans and Europeans welcome: keep times 24h `HH:MM`, coordinates decimal degrees.

## Pull requests

- Describe what you tested and how (mock and/or real DB).
- Update `docs/API.md` if you change an endpoint, and the README if you change setup or scripts.
- `npm run build` must pass. No new runtime dependencies without discussion.

## License

MIT. By contributing you agree your work is released under the same license.
