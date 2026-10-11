import { sql } from './_lib/db.js';
import { withErrors, methodNotAllowed, badRequest } from './_lib/http.js';

const LIVE_WINDOW_SECONDS = 20;

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const [route] = req.query.route
    ? await sql`select id, name from routes where id = ${req.query.route}`
    : await sql`select id, name from routes order by created_at asc limit 1`;
  if (!route) return badRequest(res, 'No route found');

  const [stops, departures, announcement, buses] = await Promise.all([
    sql`select id, name, lat, lng from stops where route_id = ${route.id} order by position asc`,
    sql`select to_char(departs_at, 'HH24:MI') as time from departures where route_id = ${route.id} order by departs_at asc`,
    sql`select message from announcements where route_id = ${route.id}`,
    sql`
      select b.id, b.label,
             p.lat, p.lng, p.speed_kmh, p.heading, p.updated_at,
             t.id as trip_id, t.boarded_count, a.issue as alert
      from buses b
      join positions p on p.bus_id = b.id
      join trips t on t.id = p.trip_id and t.ended_at is null
      left join trip_alerts a on a.trip_id = t.id
      where b.route_id = ${route.id}
        and p.updated_at > now() - make_interval(secs => ${LIVE_WINDOW_SECONDS})
    `,
  ]);

  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
  res.status(200).json({
    route: { id: route.id, name: route.name },
    stops: stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })),
    departures: departures.map((d) => d.time),
    message: announcement[0]?.message ?? '',
    buses: buses.map((b) => ({
      id: b.id,
      label: b.label,
      lat: b.lat,
      lng: b.lng,
      speedKmh: b.speed_kmh,
      heading: b.heading,
      boarded: b.boarded_count,
      alert: b.alert ?? null,
      updatedAt: b.updated_at,
    })),
  });
});
