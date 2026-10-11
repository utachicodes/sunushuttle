import { sql } from './_lib/db.js';
import { withErrors, methodNotAllowed, badRequest, send } from './_lib/http.js';

// Public endpoint: a student taps "I'm boarding" in their own browser, no
// account involved, so there is nothing to authenticate here. Worst case a
// bad actor inflates a headcount, which is low stakes and self-correcting
// once the trip ends.
export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const busId = String(req.body?.busId ?? '');
  if (!busId) return badRequest(res, 'busId required');

  const [trip] = await sql`
    update trips set boarded_count = boarded_count + 1
    where bus_id = ${busId} and ended_at is null
    returning boarded_count
  `;
  if (!trip) return badRequest(res, 'No active trip for this bus');

  send(res, 200, { boarded: trip.boarded_count });
});
