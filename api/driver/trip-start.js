import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, send } from '../_lib/http.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const claims = requireRole(req, res, 'driver');
  if (!claims) return;

  await sql`update trips set ended_at = now() where bus_id = ${claims.busId} and ended_at is null`;
  const [trip] = await sql`
    insert into trips (bus_id) values (${claims.busId})
    returning id, started_at
  `;

  send(res, 200, { tripId: trip.id, startedAt: trip.started_at });
});
