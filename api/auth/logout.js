import {
  SESSION_COOKIE,
  serializeCookie,
} from '../../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }));
  return res.redirect(302, '/');
}
