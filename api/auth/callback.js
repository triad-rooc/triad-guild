import { ensureSchema, getSql } from '../../lib/db.js';
import {
  NEXT_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STATE_COOKIE,
  getRole,
  isAllowedMember,
  parseCookies,
  requestOrigin,
  sanitizeNext,
  serializeCookie,
  signSession,
} from '../../lib/auth.js';

const DISCORD_API = 'https://discord.com/api/v10';

function fail(res, code) {
  res.setHeader('Set-Cookie', [
    serializeCookie(STATE_COOKIE, '', { maxAge: 0 }),
    serializeCookie(NEXT_COOKIE, '', { maxAge: 0 }),
  ]);
  return res.redirect(302, `/login.html?error=${encodeURIComponent(code)}`);
}

export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const code = req.query?.code;
  const state = req.query?.state;

  if (!code || !state || !cookies[STATE_COOKIE] || state !== cookies[STATE_COOKIE]) {
    return fail(res, 'state');
  }

  const {
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_GUILD_ID,
    SESSION_SECRET,
  } = process.env;

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_GUILD_ID || !SESSION_SECRET) {
    return fail(res, 'config');
  }

  const origin = requestOrigin(req);
  const redirectUri = `${origin}/api/auth/callback`;

  try {
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) return fail(res, 'oauth');
    const token = await tokenResponse.json();

    const headers = { Authorization: `Bearer ${token.access_token}` };
    const [userResponse, memberResponse] = await Promise.all([
      fetch(`${DISCORD_API}/users/@me`, { headers }),
      fetch(`${DISCORD_API}/users/@me/guilds/${DISCORD_GUILD_ID}/member`, { headers }),
    ]);

    if (!userResponse.ok) return fail(res, 'oauth');
    if (!memberResponse.ok) return fail(res, 'not_member');

    const user = await userResponse.json();
    const member = await memberResponse.json();

    if (!isAllowedMember(member.roles)) {
      return fail(res, 'role');
    }

    const now = Math.floor(Date.now() / 1000);
    const displayName =
      member.nick ||
      user.global_name ||
      user.username ||
      'TRIAD Member';

    const role = getRole(member.roles);

    const session = signSession({
      uid: user.id,
      name: displayName,
      username: user.username,
      avatar: user.avatar || null,
      role,
      iat: now,
      exp: now + SESSION_MAX_AGE,
    }, SESSION_SECRET);

    try {
      await ensureSchema();
      const sql = getSql();
      await sql`
        UPDATE member_profiles
        SET guild_role = ${role}
        WHERE discord_id = ${user.id}
          AND guild_role IS DISTINCT FROM ${role}
      `;
    } catch (error) {
      console.error('TRIAD role sync error:', error);
    }

    const next = sanitizeNext(cookies[NEXT_COOKIE] || '/');

    res.setHeader('Set-Cookie', [
      serializeCookie(SESSION_COOKIE, session, { maxAge: SESSION_MAX_AGE }),
      serializeCookie(STATE_COOKIE, '', { maxAge: 0 }),
      serializeCookie(NEXT_COOKIE, '', { maxAge: 0 }),
    ]);

    return res.redirect(302, next);
  } catch {
    return fail(res, 'oauth');
  }
}
