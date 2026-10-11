import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

export default withErrors(async (req, res) => {
  const claims = requireRole(req, res, 'admin');
  if (!claims) return;

  if (req.method === 'GET') {
    const routes = await sql`select id, name from routes order by created_at asc`;
    return send(res, 200, { routes: routes.map((r) => ({ id: r.id, name: r.name })) });
  }

  if (req.method === 'POST') {
    const name = String(req.body?.name ?? '').trim().slice(0, 80);
    if (!name) return badRequest(res, 'Route name required');
    const [route] = await sql`
      insert into routes (name) values (${name}) returning id, name
    `;
    await sql`insert into announcements (route_id, message) values (${route.id}, '') on conflict (route_id) do nothing`;
    return send(res, 200, { route });
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id ?? '');
    if (!id) return badRequest(res, 'id required');
    const [{ count }] = await sql`select count(*)::int as count from routes`;
    if (count <= 1) return badRequest(res, 'Cannot delete the last route');
    await sql`delete from routes where id = ${id}`;
    return send(res, 200, { ok: true });
  }

  methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
});
