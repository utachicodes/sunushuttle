import { sql } from './_lib/db.js';
import { withErrors, methodNotAllowed, send } from './_lib/http.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const routes = await sql`select id, name from routes order by created_at asc`;
  send(res, 200, { routes: routes.map((r) => ({ id: r.id, name: r.name })) });
});
