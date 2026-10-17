import crypto from 'node:crypto';
import {
  NEXT_COOKIE,
  STATE_COOKIE,
  requestOrigin,
  sanitizeNext,
  serializeCookie,
} from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!process.env.DISCORD_CLIENT_ID) {
    return res.redirect(302, '/login.html?error=config');
  }

  const state = crypto.randomBytes(24).toString('hex');
  const next = sanitizeNext(req.query?.next || '/');
  const origin = requestOrigin(req);
  const redirectUri = `${origin}/api/auth/callback`;

  res.setHeader('Set-Cookie', [
    serializeCookie(STATE_COOKIE, state, { maxAge: 600 }),
    serializeCookie(NEXT_COOKIE, next, { maxAge: 600 }),
  ]);

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds.members.read',
    state,
    prompt: 'consent',
  });

  return res.redirect(302, `https://discord.com/oauth2/authorize?${params.toString()}`);
}
