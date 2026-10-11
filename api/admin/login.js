import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { issueToken } from '../_lib/token.js';
import { withErrors, methodNotAllowed, badRequest, unauthorized, send } from '../_lib/http.js';
import { clientIp, checkRateLimit, recordFailure, clearFailures } from '../_lib/rateLimit.js';

const SCOPE = 'admin-login';
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!username || !password) return badRequest(res, 'Username and password required');

  const ip = clientIp(req);
  const gate = await checkRateLimit(SCOPE, ip);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfter));
    return send(res, 429, { error: 'Too many attempts, try again later' });
  }

  const [admin] = await sql`select id, password_hash from admins where username = ${username}`;
  const ok = admin ? await bcrypt.compare(password, admin.password_hash) : false;

  if (!ok) {
    await recordFailure(SCOPE, ip);
    return unauthorized(res, 'Wrong username or password');
  }

  await clearFailures(SCOPE, ip);
  const token = issueToken({ sub: 'admin', adminId: admin.id }, TOKEN_TTL_SECONDS);
  send(res, 200, { token });
});
