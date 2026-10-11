import { sql, transaction } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { resolveRouteId } from '../_lib/route.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

export default withErrors(async (req, res) => {
  const claims = requireRole(req, res, 'admin');
  if (!claims) return;

  const routeId = await resolveRouteId(req);
  if (!routeId) return badRequest(res, 'No route found');

  if (req.method === 'GET') {
    const stops = await sql`select id, name, lat, lng from stops where route_id = ${routeId} order by position asc`;
    return send(res, 200, { stops });
  }

  if (req.method === 'PUT') {
    const stops = req.body?.stops;
    if (!Array.isArray(stops) || stops.length < 2) return badRequest(res, 'At least 2 stops required');
    for (const s of stops) {
      if (!s?.name || typeof s.lat !== 'number' || typeof s.lng !== 'number') {
        return badRequest(res, 'Each stop needs a name, lat and lng');
      }
    }

    await transaction([
      sql`delete from stops where route_id = ${routeId}`,
      ...stops.map(
        (s, i) => sql`
          insert into stops (route_id, position, name, lat, lng)
          values (${routeId}, ${i}, ${s.name}, ${s.lat}, ${s.lng})
        `
      ),
    ]);
    return send(res, 200, { ok: true });
  }

  methodNotAllowed(res, ['GET', 'PUT']);
});
