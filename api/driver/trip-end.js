import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, send } from '../_lib/http.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const claims = requireRole(req, res, 'driver');
  if (!claims) return;

  const [trip] = await sql`
    update trips set ended_at = now()
    where bus_id = ${claims.busId} and ended_at is null
    returning id, boarded_count
  `;
  if (trip) {
    await sql`delete from trip_alerts where trip_id = ${trip.id}`;
  }

  send(res, 200, { tripId: trip?.id ?? null, boarded: trip?.boarded_count ?? 0 });
});
