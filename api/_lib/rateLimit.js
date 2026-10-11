import { sql } from './db.js';

const MAX_ATTEMPTS = 6;
const WINDOW_SECONDS = 60 * 10;
const LOCK_SECONDS = 60 * 5;

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** Returns { allowed, retryAfter } without consuming an attempt. */
export async function checkRateLimit(scope, identifier) {
  const [row] = await sql`
    select locked_until from login_attempts
    where scope = ${scope} and identifier = ${identifier}
  `;
  if (row?.locked_until && new Date(row.locked_until) > new Date()) {
    const retryAfter = Math.ceil((new Date(row.locked_until) - new Date()) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true, retryAfter: 0 };
}

export async function recordFailure(scope, identifier) {
  const rows = await sql`
    insert into login_attempts (scope, identifier, attempts, updated_at)
    values (${scope}, ${identifier}, 1, now())
    on conflict (scope, identifier) do update set
      attempts = case
        when login_attempts.updated_at < now() - make_interval(secs => ${WINDOW_SECONDS})
          then 1
        else login_attempts.attempts + 1
      end,
      locked_until = case
        when login_attempts.attempts + 1 >= ${MAX_ATTEMPTS}
          then now() + make_interval(secs => ${LOCK_SECONDS})
        else login_attempts.locked_until
      end,
      updated_at = now()
    returning attempts
  `;
  return rows[0]?.attempts ?? 1;
}

export async function clearFailures(scope, identifier) {
  await sql`delete from login_attempts where scope = ${scope} and identifier = ${identifier}`;
}
