import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { resolveRouteId } from '../_lib/route.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const claims = requireRole(req, res, 'admin');
  if (!claims) return;

  const routeId = await resolveRouteId(req);
  if (!routeId) return badRequest(res, 'No route found');

  const trips = await sql`
    select t.id, b.driver_name as "driverName", b.label,
           t.started_at as "startedAt", t.ended_at as "endedAt", t.boarded_count as "boarded"
    from trips t
    join buses b on b.id = t.bus_id
    where b.route_id = ${routeId}
    order by t.started_at desc
    limit 20
  `;

  send(res, 200, { trips });
});
