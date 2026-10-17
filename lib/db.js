import { neon } from '@neondatabase/serverless';

let sqlClient = null;
let schemaPromise = null;

export const JOBS = [
  'Paladin',
  'Lord Knight',
  'High Priest',
  'Champion',
  'High Wizard',
  'Professor',
  'Biochemist',
  'Mastersmith',
  'Sniper',
  'Bard/Gypsy',
  'Stalker',
  'Assassin Cross',
  'Doram',
  'Gunslinger',
];

export function getSql() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('DATABASE_URL is not configured');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }

  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }

  return sqlClient;
}

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS member_profiles (
          discord_id TEXT PRIMARY KEY,
          discord_username TEXT NOT NULL,
          display_name TEXT,
          ign VARCHAR(64) NOT NULL,
          job VARCHAR(32) NOT NULL,
          hp BIGINT NOT NULL DEFAULT 0,
          pattack BIGINT NOT NULL DEFAULT 0,
          mattack BIGINT NOT NULL DEFAULT 0,
          pdamage NUMERIC(12,4) NOT NULL DEFAULT 0,
          mdamage NUMERIC(12,4) NOT NULL DEFAULT 0,
          pdef BIGINT NOT NULL DEFAULT 0,
          mdef BIGINT NOT NULL DEFAULT 0,
          equipment_pdef BIGINT NOT NULL DEFAULT 0,
          equipment_mdef BIGINT NOT NULL DEFAULT 0,
          ignore_pdef NUMERIC(12,4) NOT NULL DEFAULT 0,
          ignore_mdef NUMERIC(12,4) NOT NULL DEFAULT 0,
          crit_resist NUMERIC(12,4) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS member_profiles_job_idx
        ON member_profiles (job)
      `;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

export function databaseError(res, error) {
  if (error?.code === 'DATABASE_NOT_CONFIGURED') {
    return res.status(503).json({
      error: 'database_not_configured',
      message: 'The TRIAD database connection has not been completed yet.',
    });
  }

  console.error('TRIAD database error:', error);
  return res.status(500).json({
    error: 'database_error',
    message: 'The database request could not be completed.',
  });
}

export function publicProfile(row) {
  if (!row) return null;
  return {
    discordId: row.discord_id,
    ign: row.ign,
    job: row.job,
    updatedAt: row.updated_at,
  };
}

export function fullProfile(row) {
  if (!row) return null;

  const number = (value) => value === null || value === undefined ? 0 : Number(value);

  return {
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    displayName: row.display_name,
    ign: row.ign,
    job: row.job,
    hp: number(row.hp),
    pattack: number(row.pattack),
    mattack: number(row.mattack),
    pdamage: number(row.pdamage),
    mdamage: number(row.mdamage),
    pdef: number(row.pdef),
    mdef: number(row.mdef),
    equipmentPdef: number(row.equipment_pdef) / 100,
    equipmentMdef: number(row.equipment_mdef) / 100,
    ignorePdef: number(row.ignore_pdef),
    ignoreMdef: number(row.ignore_mdef),
    critResist: number(row.crit_resist),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
