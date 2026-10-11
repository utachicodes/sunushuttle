import { sql } from './_lib/db.js';
import { withErrors, methodNotAllowed } from './_lib/http.js';

// Tiny high-frequency endpoint: live buses only, no static data.
// Students poll this every few seconds; static route data comes from
// /api/state (cached) so each poll is a single small indexed query.
// A 2s edge cache absorbs simultaneous polls from many students.
const LIVE_WINDOW_SECONDS = 20;

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const requested = typeof req.query?.route === 'string' ? req.query.route.trim() : '';
  const [route] = requested
    ? await sql`select id from routes where id = ${requested}`
    : await sql`select id from routes order by created_at asc limit 1`;
  if (!route) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ buses: [], at: new Date().toISOString() });
  }

  const buses = await sql`
    select b.id, b.label,
           p.lat, p.lng, p.speed_kmh, p.heading, p.updated_at,
           t.boarded_count
    from buses b
    join positions p on p.bus_id = b.id
    join trips t on t.id = p.trip_id and t.ended_at is null
    where b.route_id = ${route.id}
      and p.updated_at > now() - make_interval(secs => ${LIVE_WINDOW_SECONDS})
  `;

  res.setHeader('Cache-Control', 'public, max-age=1, s-maxage=2, stale-while-revalidate=10');
  res.status(200).json({
    buses: buses.map((b) => ({
      id: b.id,
      label: b.label,
      lat: b.lat,
      lng: b.lng,
      speedKmh: b.speed_kmh,
      heading: b.heading,
      boarded: b.boarded_count,
      updatedAt: b.updated_at,
    })),
    at: new Date().toISOString(),
  });
});
