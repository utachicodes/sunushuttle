import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function firstRouteId() {
  const [route] = await sql`select id from routes order by created_at asc limit 1`;
  return route?.id ?? null;
}

export default withErrors(async (req, res) => {
  const claims = requireRole(req, res, 'admin');
  if (!claims) return;

  const routeId = await firstRouteId();
  if (!routeId) return badRequest(res, 'No route found');

  if (req.method === 'GET') {
    const rows = await sql`
      select to_char(departs_at, 'HH24:MI') as time from departures
      where route_id = ${routeId} order by departs_at asc
    `;
    return send(res, 200, { departures: rows.map((r) => r.time) });
  }

  if (req.method === 'POST') {
    const time = String(req.body?.time ?? '');
    if (!TIME_RE.test(time)) return badRequest(res, 'Time must be HH:MM');
    await sql`
      insert into departures (route_id, departs_at) values (${routeId}, ${time})
      on conflict (route_id, departs_at) do nothing
    `;
    return send(res, 200, { ok: true });
  }

  if (req.method === 'DELETE') {
    const time = String(req.body?.time ?? '');
    if (!TIME_RE.test(time)) return badRequest(res, 'Time must be HH:MM');
    await sql`delete from departures where route_id = ${routeId} and departs_at = ${time}`;
    return send(res, 200, { ok: true });
  }

  methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
});
