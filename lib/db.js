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

export const DEFAULT_GUILD_SETTINGS = {
  thresholds: {
    dps: {
      pdef: { redMax: 3699, midStart: 3700, greenStart: 3850, midColor: 'yellow' },
      mdef: { redMax: 1199, midStart: 1200, greenStart: 1350, midColor: 'yellow' },
      pdamageReduction: { redMax: 149, midStart: 150, greenStart: 160, midColor: 'orange' },
      mdamageReduction: { redMax: 99, midStart: 100, greenStart: 110, midColor: 'orange' },
    },
    sniper: {
      pdef: { redMax: 2899, midStart: 2900, greenStart: 3000, midColor: 'yellow' },
      mdef: { redMax: 999, midStart: 1000, greenStart: 1250, midColor: 'yellow' },
      pdamageReduction: { redMax: 149, midStart: 150, greenStart: 160, midColor: 'orange' },
      mdamageReduction: { redMax: 99, midStart: 100, greenStart: 110, midColor: 'orange' },
    },
    support: {
      pdef: { redMax: 7399, midStart: 7400, greenStart: 7500, midColor: 'yellow' },
      mdef: { redMax: 1999, midStart: 2000, greenStart: 2200, midColor: 'yellow' },
      pdamageReduction: { redMax: 179, midStart: 180, greenStart: 190, midColor: 'yellow' },
      mdamageReduction: { redMax: 109, midStart: 110, greenStart: 120, midColor: 'yellow' },
    },
    bio: {
      pdef: { redMax: 7399, midStart: 7400, greenStart: 7500, midColor: 'yellow' },
      mdef: { redMax: 1999, midStart: 2000, greenStart: 2200, midColor: 'yellow' },
      pdamageReduction: { redMax: 179, midStart: 180, greenStart: 190, midColor: 'yellow' },
      mdamageReduction: { redMax: 109, midStart: 110, greenStart: 120, midColor: 'yellow' },
    },
  },
  freshness: {
    orangeStartDays: 14,
    redStartDays: 21,
  },
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_GUILD_SETTINGS));
}

function mergeKnown(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target;
  for (const key of Object.keys(target)) {
    if (!(key in source)) continue;
    if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      mergeKnown(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export function normalizeGuildSettings(value) {
  return mergeKnown(cloneDefaults(), value);
}

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
          guild_role VARCHAR(16) NOT NULL DEFAULT 'Member',
          hp BIGINT NOT NULL DEFAULT 0,
          pattack BIGINT NOT NULL DEFAULT 0,
          mattack BIGINT NOT NULL DEFAULT 0,
          pdamage NUMERIC(12,4) NOT NULL DEFAULT 0,
          mdamage NUMERIC(12,4) NOT NULL DEFAULT 0,
          pdamage_reduction NUMERIC(12,4) NOT NULL DEFAULT 0,
          mdamage_reduction NUMERIC(12,4) NOT NULL DEFAULT 0,
          pdef BIGINT NOT NULL DEFAULT 0,
          mdef BIGINT NOT NULL DEFAULT 0,
          equipment_pdef BIGINT NOT NULL DEFAULT 0,
          equipment_mdef BIGINT NOT NULL DEFAULT 0,
          ignore_pdef NUMERIC(12,4) NOT NULL DEFAULT 0,
          ignore_mdef NUMERIC(12,4) NOT NULL DEFAULT 0,
          crit_resist NUMERIC(12,4) NOT NULL DEFAULT 0,
          verification_status VARCHAR(24) NOT NULL DEFAULT 'unverified',
          verified_at TIMESTAMPTZ,
          verified_by TEXT,
          verification_note VARCHAR(240),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS guild_settings (
          setting_key TEXT PRIMARY KEY,
          setting_value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_by TEXT
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS bidding_assignments (
          discord_id TEXT PRIMARY KEY REFERENCES member_profiles(discord_id) ON DELETE CASCADE,
          category VARCHAR(40) NOT NULL,
          page_number INTEGER NOT NULL,
          slot_number INTEGER NOT NULL,
          event_key VARCHAR(24) NOT NULL,
          bidding_date DATE NOT NULL,
          updated_by TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS bidding_assignments_date_idx
        ON bidding_assignments (bidding_date)
      `;

      await sql`
        ALTER TABLE member_profiles
        ADD COLUMN IF NOT EXISTS guild_role VARCHAR(16) NOT NULL DEFAULT 'Member'
      `;
      await sql`
        ALTER TABLE member_profiles
        ADD COLUMN IF NOT EXISTS pdamage_reduction NUMERIC(12,4) NOT NULL DEFAULT 0
      `;
      await sql`
        ALTER TABLE member_profiles
        ADD COLUMN IF NOT EXISTS mdamage_reduction NUMERIC(12,4) NOT NULL DEFAULT 0
      `;
      await sql`
        ALTER TABLE member_profiles
        ADD COLUMN IF NOT EXISTS verification_status VARCHAR(24) NOT NULL DEFAULT 'unverified'
      `;
      await sql`
        ALTER TABLE member_profiles
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ
      `;
      await sql`
        ALTER TABLE member_profiles
        ADD COLUMN IF NOT EXISTS verified_by TEXT
      `;
      await sql`
        ALTER TABLE member_profiles
        ADD COLUMN IF NOT EXISTS verification_note VARCHAR(240)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS member_profiles_job_idx
        ON member_profiles (job)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS member_profiles_verification_idx
        ON member_profiles (verification_status)
      `;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

export async function getGuildSettings() {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT setting_value
    FROM guild_settings
    WHERE setting_key = 'app'
    LIMIT 1
  `;

  return normalizeGuildSettings(rows[0]?.setting_value || null);
}

export async function saveGuildSettings(settings, updatedBy = '') {
  await ensureSchema();
  const sql = getSql();
  const normalized = normalizeGuildSettings(settings);
  const serialized = JSON.stringify(normalized);

  await sql`
    INSERT INTO guild_settings (setting_key, setting_value, updated_at, updated_by)
    VALUES ('app', ${serialized}::jsonb, NOW(), ${updatedBy})
    ON CONFLICT (setting_key) DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_at = NOW(),
      updated_by = EXCLUDED.updated_by
  `;

  return normalized;
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
    ign: row.ign,
    job: row.job,
    role: ['Council', 'Officer', 'Member'].includes(row.guild_role) ? row.guild_role : 'Member',
  };
}

export function fullProfile(row) {
  if (!row) return null;

  const number = (value) => value === null || value === undefined ? 0 : Number(value);
  const status = ['unverified', 'pending', 'verified', 'update_required'].includes(row.verification_status)
    ? row.verification_status
    : 'unverified';

  return {
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    displayName: row.display_name,
    ign: row.ign,
    job: row.job,
    guildRole: ['Council', 'Officer', 'Member'].includes(row.guild_role) ? row.guild_role : 'Member',
    hp: number(row.hp),
    pattack: number(row.pattack),
    mattack: number(row.mattack),
    pdamage: number(row.pdamage),
    mdamage: number(row.mdamage),
    pdamageReduction: number(row.pdamage_reduction),
    mdamageReduction: number(row.mdamage_reduction),
    pdef: number(row.pdef),
    mdef: number(row.mdef),
    equipmentPdef: number(row.equipment_pdef) / 100,
    equipmentMdef: number(row.equipment_mdef) / 100,
    ignorePdef: number(row.ignore_pdef),
    ignoreMdef: number(row.ignore_mdef),
    critResist: number(row.crit_resist),
    verificationStatus: status,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    verificationNote: row.verification_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
