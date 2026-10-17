import {
  SESSION_COOKIE,
  parseCookies,
  verifySession,
} from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cookies = parseCookies(req.headers.cookie || '');
  const session = verifySession(cookies[SESSION_COOKIE], process.env.SESSION_SECRET);

  if (!session) {
    return res.status(401).json({ authenticated: false });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      id: session.uid,
      name: session.name,
      username: session.username,
      role: session.role,
    },
  });
}
