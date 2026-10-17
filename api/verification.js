import { requireSameOrigin, requireStaff } from '../lib/api-auth.js';
import { databaseError, ensureSchema, fullProfile, getSql } from '../lib/db.js';

const allowedStatuses = new Set(['unverified', 'pending', 'verified', 'update_required']);

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = requireStaff(req, res);
  if (!session) return;
  if (!requireSameOrigin(req, res)) return;

  const body = readBody(req);
  const discordId = String(body?.discordId || '').trim();
  const status = String(body?.status || '').trim();
  const note = String(body?.note || '').trim().slice(0, 240);

  if (!discordId || !allowedStatuses.has(status)) {
    return res.status(400).json({ error: 'invalid_verification_request' });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = status === 'verified'
      ? await sql`
          UPDATE member_profiles
          SET verification_status = 'verified',
              verified_at = NOW(),
              verified_by = ${session.uid},
              verification_note = ${note}
          WHERE discord_id = ${discordId}
          RETURNING *
        `
      : await sql`
          UPDATE member_profiles
          SET verification_status = ${status},
              verified_at = NULL,
              verified_by = NULL,
              verification_note = ${note}
          WHERE discord_id = ${discordId}
          RETURNING *
        `;

    if (!rows[0]) {
      return res.status(404).json({ error: 'member_not_found' });
    }

    return res.status(200).json({
      saved: true,
      profile: fullProfile(rows[0]),
    });
  } catch (error) {
    return databaseError(res, error);
  }
}
