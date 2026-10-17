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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS member_profiles_job_idx
ON member_profiles (job);
