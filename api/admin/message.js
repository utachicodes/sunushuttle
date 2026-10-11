import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { resolveRouteId } from '../_lib/route.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

export default withErrors(async (req, res) => {
  const claims = requireRole(req, res, 'admin');
  if (!claims) return;

  const routeId = await resolveRouteId(req);
  if (!routeId) return badRequest(res, 'No route found');

  if (req.method === 'GET') {
    const [row] = await sql`select message from announcements where route_id = ${routeId}`;
    return send(res, 200, { message: row?.message ?? '' });
  }

  if (req.method === 'PUT') {
    const message = String(req.body?.message ?? '').slice(0, 160);
    await sql`
      insert into announcements (route_id, message, updated_at) values (${routeId}, ${message}, now())
      on conflict (route_id) do update set message = excluded.message, updated_at = now()
    `;
    return send(res, 200, { ok: true });
  }

  methodNotAllowed(res, ['GET', 'PUT']);
});
