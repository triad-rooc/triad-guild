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
);

CREATE TABLE IF NOT EXISTS guild_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS member_profiles_job_idx
ON member_profiles (job);

CREATE INDEX IF NOT EXISTS member_profiles_verification_idx
ON member_profiles (verification_status);


CREATE TABLE IF NOT EXISTS bidding_assignments (
  discord_id TEXT PRIMARY KEY REFERENCES member_profiles(discord_id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL,
  page_number INTEGER NOT NULL,
  slot_number INTEGER NOT NULL,
  event_key VARCHAR(24) NOT NULL,
  bidding_date DATE NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bidding_assignments_date_idx
ON bidding_assignments (bidding_date);
