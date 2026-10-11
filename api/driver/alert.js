import { sql } from '../_lib/db.js';
import { requireRole } from '../_lib/auth.js';
import { withErrors, methodNotAllowed, badRequest, send } from '../_lib/http.js';

const ISSUES = new Set(['traffic', 'late', 'breakdown']);

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const claims = requireRole(req, res, 'driver');
  if (!claims) return;

  const [trip] = await sql`
    select id from trips where bus_id = ${claims.busId} and ended_at is null
  `;
  if (!trip) return badRequest(res, 'No active trip');

  const issue = String(req.body?.issue ?? '');
  if (issue === 'clear' || issue === '') {
    await sql`delete from trip_alerts where trip_id = ${trip.id}`;
    return send(res, 200, { ok: true, issue: null });
  }
  if (!ISSUES.has(issue)) return badRequest(res, 'Unknown issue');

  await sql`
    insert into trip_alerts (trip_id, issue, updated_at) values (${trip.id}, ${issue}, now())
    on conflict (trip_id) do update set issue = excluded.issue, updated_at = now()
  `;
  send(res, 200, { ok: true, issue });
});
