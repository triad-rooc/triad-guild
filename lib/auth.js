import crypto from 'node:crypto';

export const SESSION_COOKIE = 'triad_session';
export const STATE_COOKIE = 'triad_oauth_state';
export const NEXT_COOKIE = 'triad_login_next';
export const SESSION_MAX_AGE = 60 * 60 * 12;

export function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function sanitizeNext(value) {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function serializeCookie(name, value, options = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
  cookie += `; Path=${options.path || '/'}`;
  if (options.httpOnly !== false) cookie += '; HttpOnly';
  if (options.secure !== false) cookie += '; Secure';
  cookie += `; SameSite=${options.sameSite || 'Lax'}`;
  return cookie;
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

export function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body, secret)}`;
}

export function verifySession(token, secret) {
  if (!token || !secret) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;

  const expected = hmac(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function getRole(memberRoles = []) {
  const roles = new Set(memberRoles || []);
  const mapping = [
    ['Admin', process.env.DISCORD_ADMIN_ROLE_ID],
    ['Council', process.env.DISCORD_COUNCIL_ROLE_ID],
    ['Officer', process.env.DISCORD_OFFICER_ROLE_ID],
    ['Member', process.env.DISCORD_MEMBER_ROLE_ID],
  ];

  for (const [name, id] of mapping) {
    if (id && roles.has(id)) return name;
  }
  return 'Member';
}

export function isAllowedMember(memberRoles = []) {
  const configured = [
    process.env.DISCORD_MEMBER_ROLE_ID,
    process.env.DISCORD_OFFICER_ROLE_ID,
    process.env.DISCORD_COUNCIL_ROLE_ID,
    process.env.DISCORD_ADMIN_ROLE_ID,
    ...(process.env.DISCORD_ALLOWED_ROLE_IDS || '').split(',').map((v) => v.trim()),
  ].filter(Boolean);

  if (configured.length === 0) return true;
  const roles = new Set(memberRoles || []);
  return configured.some((id) => roles.has(id));
}
