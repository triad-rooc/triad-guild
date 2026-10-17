import { requireSession } from '../../lib/api-auth.js';
import { JOBS, databaseError, ensureSchema, fullProfile, getSql } from '../../lib/db.js';

const integerFields = ['hp','pattack','mattack','pdef','mdef'];
const decimalFields = ['pdamage','mdamage','pdamageReduction','mdamageReduction','equipmentPdef','equipmentMdef','ignorePdef','ignoreMdef','critResist'];

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function cleanNumber(value, integer = false) {
  const normalized = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  if (normalized === '' || normalized === null || normalized === undefined) return 0;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return null;
  return integer ? Math.trunc(number) : number;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = requireSession(req, res);
  if (!session) return;

  try {
    await ensureSchema();
    const sql = getSql();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT *
        FROM member_profiles
        WHERE discord_id = ${session.uid}
        LIMIT 1
      `;

      return res.status(200).json({
        profile: fullProfile(rows[0] || null),
        jobs: JOBS,
      });
    }

    if (req.method !== 'PUT' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, PUT, POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const body = readBody(req);
    if (!body) return res.status(400).json({ error: 'invalid_json' });

    const ign = String(body.ign || '').trim();
    const job = String(body.job || '').trim();

    if (!ign || ign.length > 64) {
      return res.status(400).json({ error: 'invalid_ign', message: 'IGN is required and must be 64 characters or fewer.' });
    }

    if (!JOBS.includes(job)) {
      return res.status(400).json({ error: 'invalid_job', message: 'Please select a valid job.' });
    }

    const values = {};
    for (const field of integerFields) {
      values[field] = cleanNumber(body[field], true);
      if (values[field] === null) {
        return res.status(400).json({ error: 'invalid_stat', field });
      }
    }

    for (const field of decimalFields) {
      values[field] = cleanNumber(body[field], false);
      if (values[field] === null) {
        return res.status(400).json({ error: 'invalid_stat', field });
      }
    }

    // equipment_pdef / equipment_mdef are stored as basis points:
    // 40.25% => 4025. This preserves two decimal places while keeping the existing BIGINT schema.
    const equipmentPdefBasisPoints = Math.round(values.equipmentPdef * 100);
    const equipmentMdefBasisPoints = Math.round(values.equipmentMdef * 100);

    const rows = await sql`
      INSERT INTO member_profiles (
        discord_id,
        discord_username,
        display_name,
        ign,
        job,
        hp,
        pattack,
        mattack,
        pdamage,
        mdamage,
        pdamage_reduction,
        mdamage_reduction,
        pdef,
        mdef,
        equipment_pdef,
        equipment_mdef,
        ignore_pdef,
        ignore_mdef,
        crit_resist,
        updated_at
      ) VALUES (
        ${session.uid},
        ${session.username || ''},
        ${session.name || session.username || ''},
        ${ign},
        ${job},
        ${values.hp},
        ${values.pattack},
        ${values.mattack},
        ${values.pdamage},
        ${values.mdamage},
        ${values.pdamageReduction},
        ${values.mdamageReduction},
        ${values.pdef},
        ${values.mdef},
        ${equipmentPdefBasisPoints},
        ${equipmentMdefBasisPoints},
        ${values.ignorePdef},
        ${values.ignoreMdef},
        ${values.critResist},
        NOW()
      )
      ON CONFLICT (discord_id) DO UPDATE SET
        discord_username = EXCLUDED.discord_username,
        display_name = EXCLUDED.display_name,
        ign = EXCLUDED.ign,
        job = EXCLUDED.job,
        hp = EXCLUDED.hp,
        pattack = EXCLUDED.pattack,
        mattack = EXCLUDED.mattack,
        pdamage = EXCLUDED.pdamage,
        mdamage = EXCLUDED.mdamage,
        pdamage_reduction = EXCLUDED.pdamage_reduction,
        mdamage_reduction = EXCLUDED.mdamage_reduction,
        pdef = EXCLUDED.pdef,
        mdef = EXCLUDED.mdef,
        equipment_pdef = EXCLUDED.equipment_pdef,
        equipment_mdef = EXCLUDED.equipment_mdef,
        ignore_pdef = EXCLUDED.ignore_pdef,
        ignore_mdef = EXCLUDED.ignore_mdef,
        crit_resist = EXCLUDED.crit_resist,
        updated_at = NOW()
      RETURNING *
    `;

    return res.status(200).json({
      saved: true,
      profile: fullProfile(rows[0]),
    });
  } catch (error) {
    return databaseError(res, error);
  }
}
