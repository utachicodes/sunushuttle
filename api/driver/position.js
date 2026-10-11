import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
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

// Phone GPS occasionally jumps hundreds of meters in one fix. Anything
// implying >160 km/h is discarded as noise (previous fix is kept) so a
// single bad reading cannot teleport the bus or trash the ETA.
const MAX_PLAUSIBLE_KMH = 160;

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const claims = requireRole(req, res, 'driver');
  if (!claims) return;

  const { lat, lng, speedKmh = 0, heading = null } = req.body ?? {};
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return badRequest(res, 'Invalid coordinates');
  }
  const speed = Math.min(120, Math.max(0, Number(speedKmh) || 0));
  const cleanHeading = isFiniteNumber(heading) ? heading : null;

  const [trip] = await sql`
    select id from trips where bus_id = ${claims.busId} and ended_at is null
  `;
  if (!trip) return badRequest(res, 'No active trip');

  let useLat = lat;
  let useLng = lng;
  const [prev] = await sql`select lat, lng, updated_at from positions where bus_id = ${claims.busId}`;
  if (prev) {
    const dtSeconds = (Date.now() - new Date(prev.updated_at).getTime()) / 1000;
    if (dtSeconds > 0 && (haversineKm(prev, { lat, lng }) / dtSeconds) * 3600 > MAX_PLAUSIBLE_KMH) {
      useLat = prev.lat;
      useLng = prev.lng;
    }
  }

  await sql`
    insert into positions (bus_id, trip_id, lat, lng, speed_kmh, heading, updated_at)
    values (${claims.busId}, ${trip.id}, ${useLat}, ${useLng}, ${speed}, ${cleanHeading}, now())
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
