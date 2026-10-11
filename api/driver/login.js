import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { issueToken } from '../_lib/token.js';
import { withErrors, methodNotAllowed, badRequest, unauthorized, send } from '../_lib/http.js';
import { clientIp, checkRateLimit, recordFailure, clearFailures } from '../_lib/rateLimit.js';

const SCOPE = 'driver-login';
const TOKEN_TTL_SECONDS = 60 * 60 * 12;

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const pin = String(req.body?.pin ?? '');
  if (!/^\d{4}$/.test(pin)) return badRequest(res, 'PIN must be 4 digits');

  const ip = clientIp(req);
  const gate = await checkRateLimit(SCOPE, ip);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfter));
    return send(res, 429, { error: 'Too many attempts, try again later' });
  }

  const buses = await sql`select id, route_id, label, driver_name, pin_hash from buses`;
  let match = null;
  for (const bus of buses) {
    if (await bcrypt.compare(pin, bus.pin_hash)) {
      match = bus;
      break;
    }
  }

  if (!match) {
    await recordFailure(SCOPE, ip);
    return unauthorized(res, 'Wrong PIN');
  }

  await clearFailures(SCOPE, ip);
  const token = issueToken(
    { sub: 'driver', busId: match.id, routeId: match.route_id },
    TOKEN_TTL_SECONDS
  );
  send(res, 200, {
    token,
    bus: { id: match.id, label: match.label, driverName: match.driver_name, routeId: match.route_id },
  });
});
