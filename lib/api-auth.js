import {
  SESSION_COOKIE,
  parseCookies,
  requestOrigin,
  verifySession,
} from './auth.js';

export function getRequestSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifySession(cookies[SESSION_COOKIE], process.env.SESSION_SECRET);
}

export function requireSession(req, res) {
  const session = getRequestSession(req);
  if (!session) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return session;
}

export function requireStaff(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;

  if (!['Council', 'Officer'].includes(session.role)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }

  return session;
}

export function requireCouncil(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;

  if (session.role !== 'Council') {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }

  return session;
}

export function requireSameOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== requestOrigin(req)) {
    res.status(403).json({ error: 'invalid_origin' });
    return false;
  }
  return true;
}
