export function send(res, status, body) {
  res.status(status).json(body);
}

export function badRequest(res, message) {
  send(res, 400, { error: message });
}

export function unauthorized(res, message = 'Unauthorized') {
  send(res, 401, { error: message });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  send(res, 405, { error: 'Method not allowed' });
}

/** Wraps a handler so unexpected errors become a 500 instead of a crashed function. */
export function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'Internal error' });
    }
  };
}
