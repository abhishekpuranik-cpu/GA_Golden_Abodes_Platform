export function pickBody(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

export function rejectUnknownFields(body, allowed, res) {
  const unknown = Object.keys(body || {}).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    res.status(422).json({ error: 'Unknown fields rejected', fields: unknown });
    return false;
  }
  return true;
}

export function validateBody(allowed) {
  return (req, res, next) => {
    if (!rejectUnknownFields(req.body, allowed, res)) return;
    req.body = pickBody(req.body, allowed);
    next();
  };
}
