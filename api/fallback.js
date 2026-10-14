import { sql } from './_lib/db.js';
import { withErrors, methodNotAllowed } from './_lib/http.js';
import { fetchFonekLocations } from './_lib/fonek.js';

// Backup locator for buses with no live GPS from the driver's phone right
// now: their last known position from a fonek (github.com/lodjim/fonek) BLE
// tag, if one is mounted. fonek reports lag minutes to hours, so this is
// polled at a much lower rate than /api/live and dropped once too stale to
// be useful.
const LIVE_WINDOW_SECONDS = 20;
const MAX_FALLBACK_AGE_HOURS = 6;

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');

  const requested = typeof req.query?.route === 'string' ? req.query.route.trim() : '';
  const [route] = requested
    ? await sql`select id from routes where id = ${requested}`
    : await sql`select id from routes order by created_at asc limit 1`;
  if (!route) return res.status(200).json({ buses: [], at: new Date().toISOString() });

  // Buses on this route with a fonek tag and no live position right now.
  const buses = await sql`
    select b.id, b.label, b.fonek_device_name
    from buses b
    left join positions p on p.bus_id = b.id
      and p.updated_at > now() - make_interval(secs => ${LIVE_WINDOW_SECONDS})
    where b.route_id = ${route.id}
      and b.fonek_device_name is not null
      and p.bus_id is null
  `;
  if (!buses.length) return res.status(200).json({ buses: [], at: new Date().toISOString() });

  const locations = await fetchFonekLocations();
  const byName = new Map(locations.map((loc) => [loc.name, loc]));
  const cutoff = Date.now() - MAX_FALLBACK_AGE_HOURS * 3600_000;

  const result = buses
    .map((b) => {
      const loc = byName.get(b.fonek_device_name);
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
      if (new Date(loc.timestamp).getTime() < cutoff) return null;
      return {
        id: b.id,
        label: b.label,
        lat: loc.lat,
        lng: loc.lon,
        accuracy: loc.accuracy ?? null,
        updatedAt: loc.timestamp,
      };
    })
    .filter(Boolean);

  res.status(200).json({ buses: result, at: new Date().toISOString() });
});
