import bcrypt from 'bcryptjs';
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
    const drivers = await sql`
      select id, label, driver_name as "driverName", fonek_device_name as "fonekDeviceName" from buses
      where route_id = ${routeId} order by label asc
    `;
    return send(res, 200, { drivers });
  }

  if (req.method === 'POST') {
    const name = String(req.body?.driverName ?? '').trim();
    const label = String(req.body?.label ?? '').trim();
    const pin = String(req.body?.pin ?? '');
    const fonekDeviceName = String(req.body?.fonekDeviceName ?? '').trim() || null;
    if (!name || !label) return badRequest(res, 'Name and bus label required');
    if (!/^\d{4}$/.test(pin)) return badRequest(res, 'PIN must be 4 digits');

    const existing = await sql`select pin_hash from buses where route_id = ${routeId}`;
    for (const row of existing) {
      if (await bcrypt.compare(pin, row.pin_hash)) return badRequest(res, 'PIN already in use');
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const [bus] = await sql`
      insert into buses (route_id, label, driver_name, pin_hash, fonek_device_name)
      values (${routeId}, ${label}, ${name}, ${pinHash}, ${fonekDeviceName})
      returning id, label, driver_name as "driverName", fonek_device_name as "fonekDeviceName"
    `;
    return send(res, 200, { driver: bus });
  }

  if (req.method === 'PATCH') {
    const id = String(req.body?.id ?? '');
    if (!id) return badRequest(res, 'id required');
    const fonekDeviceName = String(req.body?.fonekDeviceName ?? '').trim() || null;
    const [bus] = await sql`
      update buses set fonek_device_name = ${fonekDeviceName}
      where id = ${id} and route_id = ${routeId}
      returning id, label, driver_name as "driverName", fonek_device_name as "fonekDeviceName"
    `;
    if (!bus) return badRequest(res, 'Driver not found');
    return send(res, 200, { driver: bus });
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id ?? '');
    if (!id) return badRequest(res, 'id required');
    await sql`delete from buses where id = ${id} and route_id = ${routeId}`;
    return send(res, 200, { ok: true });
  }

  methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
});
