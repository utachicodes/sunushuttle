import { sql } from './db.js';

/**
 * Resolves which route an endpoint should operate on: an explicit
 * `?route=<id>` wins, otherwise the oldest route. Returns null when the
 * requested route does not exist (or no route exists at all).
 */
export async function resolveRouteId(req) {
  const requested = typeof req.query?.route === 'string' ? req.query.route.trim() : '';
  if (requested) {
    const [route] = await sql`select id from routes where id = ${requested}`;
    return route?.id ?? null;
  }
  const [route] = await sql`select id from routes order by created_at asc limit 1`;
  return route?.id ?? null;
}
