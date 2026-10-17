import { requireSession } from '../lib/api-auth.js';
import { databaseError, ensureSchema, getSql, publicProfile } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = requireSession(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT discord_id, ign, job, updated_at
      FROM member_profiles
      ORDER BY LOWER(ign), ign
    `;

    return res.status(200).json({
      members: rows.map(publicProfile),
    });
  } catch (error) {
    return databaseError(res, error);
  }
}
