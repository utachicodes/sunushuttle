import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

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
    const drivers = await sql`
      select id, label, driver_name as "driverName" from buses
      where route_id = ${routeId} order by label asc
    `;
    return send(res, 200, { drivers });
  }

  if (req.method === 'POST') {
    const name = String(req.body?.driverName ?? '').trim();
    const label = String(req.body?.label ?? '').trim();
    const pin = String(req.body?.pin ?? '');
    if (!name || !label) return badRequest(res, 'Name and bus label required');
    if (!/^\d{4}$/.test(pin)) return badRequest(res, 'PIN must be 4 digits');

    const existing = await sql`select pin_hash from buses where route_id = ${routeId}`;
    for (const row of existing) {
      if (await bcrypt.compare(pin, row.pin_hash)) return badRequest(res, 'PIN already in use');
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const [bus] = await sql`
      insert into buses (route_id, label, driver_name, pin_hash)
      values (${routeId}, ${label}, ${name}, ${pinHash})
      returning id, label, driver_name as "driverName"
    `;
    return send(res, 200, { driver: bus });
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id ?? '');
    if (!id) return badRequest(res, 'id required');
    await sql`delete from buses where id = ${id} and route_id = ${routeId}`;
    return send(res, 200, { ok: true });
  }

  methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
});
