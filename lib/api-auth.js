import {
  SESSION_COOKIE,
  parseCookies,
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
