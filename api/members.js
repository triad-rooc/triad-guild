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
    await sql`
      UPDATE member_profiles
      SET guild_role = ${session.role || 'Member'}
      WHERE discord_id = ${session.uid}
        AND guild_role IS DISTINCT FROM ${session.role || 'Member'}
    `;

    const rows = await sql`
      SELECT ign, job, guild_role
      FROM member_profiles
      ORDER BY
        CASE guild_role
          WHEN 'Council' THEN 1
          WHEN 'Officer' THEN 2
          ELSE 3
        END,
        LOWER(ign),
        ign
    `;

    return res.status(200).json({
      members: rows.map(publicProfile),
    });
  } catch (error) {
    return databaseError(res, error);
  }
}
