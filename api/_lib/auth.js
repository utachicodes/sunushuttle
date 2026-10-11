import { verifyToken, bearerToken } from './token.js';
import { unauthorized } from './http.js';

/** Returns the token claims if they match `role`, otherwise responds 401 and returns null. */
export function requireRole(req, res, role) {
  const claims = verifyToken(bearerToken(req));
  if (!claims || claims.sub !== role) {
    unauthorized(res);
    return null;
  }
  return claims;
}
