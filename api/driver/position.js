import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const claims = requireRole(req, res, 'driver');
  if (!claims) return;

  const { lat, lng, speedKmh = 0, heading = null } = req.body ?? {};
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return badRequest(res, 'Invalid coordinates');
  }

  const [trip] = await sql`
    select id from trips where bus_id = ${claims.busId} and ended_at is null
  `;
  if (!trip) return badRequest(res, 'No active trip');

  await sql`
    insert into positions (bus_id, trip_id, lat, lng, speed_kmh, heading, updated_at)
    values (${claims.busId}, ${trip.id}, ${lat}, ${lng}, ${speedKmh}, ${heading}, now())
    on conflict (bus_id) do update set
      trip_id = excluded.trip_id,
      lat = excluded.lat,
      lng = excluded.lng,
      speed_kmh = excluded.speed_kmh,
      heading = excluded.heading,
      updated_at = excluded.updated_at
  `;

  send(res, 200, { ok: true });
});
