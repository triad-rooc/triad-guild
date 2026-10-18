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


CREATE TABLE IF NOT EXISTS bidding_cycles (
  id BIGSERIAL PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  fragment_per_member INTEGER NOT NULL DEFAULT 3,
  light_dark_per_member INTEGER NOT NULL DEFAULT 12,
  time_space_per_member INTEGER NOT NULL DEFAULT 15,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bidding_cycle_events (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES bidding_cycles(id) ON DELETE CASCADE,
  event_order INTEGER NOT NULL,
  event_type VARCHAR(8) NOT NULL,
  event_label VARCHAR(64) NOT NULL,
  bidding_date DATE NOT NULL,
  base_capacity INTEGER NOT NULL,
  fragment_stock INTEGER NOT NULL DEFAULT 0,
  light_dark_stock INTEGER NOT NULL DEFAULT 0,
  time_space_stock INTEGER NOT NULL DEFAULT 0,
  effective_capacity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, event_order)
);

CREATE TABLE IF NOT EXISTS bidding_cycle_assignments (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES bidding_cycles(id) ON DELETE CASCADE,
  event_id BIGINT REFERENCES bidding_cycle_events(id) ON DELETE SET NULL,
  discord_id TEXT NOT NULL REFERENCES member_profiles(discord_id) ON DELETE CASCADE,
  event_order INTEGER,
  bid_position INTEGER,
  schedule_status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
  outcome_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  fairness_score NUMERIC(12,2) NOT NULL DEFAULT 0,
  slot_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  note VARCHAR(240),
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, discord_id)
);

CREATE INDEX IF NOT EXISTS bidding_cycle_assignments_event_idx
ON bidding_cycle_assignments (cycle_id, event_id, bid_position);

CREATE TABLE IF NOT EXISTS bidding_cycle_actions (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES bidding_cycles(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bidding_roulette_results (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES bidding_cycles(id) ON DELETE CASCADE,
  event_id BIGINT REFERENCES bidding_cycle_events(id) ON DELETE SET NULL,
  category VARCHAR(40),
  discord_id TEXT NOT NULL REFERENCES member_profiles(discord_id) ON DELETE CASCADE,
  pool_scope VARCHAR(24) NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Isolated mock bidding sandbox. These tables never reference or mutate live member_profiles.
CREATE TABLE IF NOT EXISTS mock_bidding_members (
  mock_member_id TEXT PRIMARY KEY,
  ign VARCHAR(64) NOT NULL,
  job VARCHAR(32) NOT NULL,
  guild_role VARCHAR(16) NOT NULL DEFAULT 'Member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mock_bidding_cycles (
  id BIGSERIAL PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  fragment_per_member INTEGER NOT NULL DEFAULT 3,
  light_dark_per_member INTEGER NOT NULL DEFAULT 12,
  time_space_per_member INTEGER NOT NULL DEFAULT 15,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stock columns are the total item quantities for the event.
-- Per-member limits live on mock_bidding_cycles; the difference becomes FFA/excess.
CREATE TABLE IF NOT EXISTS mock_bidding_events (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES mock_bidding_cycles(id) ON DELETE CASCADE,
  event_order INTEGER NOT NULL,
  event_type VARCHAR(8) NOT NULL,
  event_label VARCHAR(64) NOT NULL,
  bidding_date DATE NOT NULL,
  base_capacity INTEGER NOT NULL,
  fragment_stock INTEGER NOT NULL DEFAULT 0,
  light_dark_stock INTEGER NOT NULL DEFAULT 0,
  time_space_stock INTEGER NOT NULL DEFAULT 0,
  fragment_start_page INTEGER,
  fragment_start_slot INTEGER,
  fragment_end_page INTEGER,
  fragment_end_slot INTEGER,
  light_dark_start_page INTEGER,
  light_dark_start_slot INTEGER,
  light_dark_end_page INTEGER,
  light_dark_end_slot INTEGER,
  time_space_start_page INTEGER,
  time_space_start_slot INTEGER,
  time_space_end_page INTEGER,
  time_space_end_slot INTEGER,
  effective_capacity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, event_order)
);

CREATE TABLE IF NOT EXISTS mock_bidding_assignments (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES mock_bidding_cycles(id) ON DELETE CASCADE,
  event_id BIGINT REFERENCES mock_bidding_events(id) ON DELETE SET NULL,
  mock_member_id TEXT NOT NULL REFERENCES mock_bidding_members(mock_member_id) ON DELETE CASCADE,
  event_order INTEGER,
  bid_position INTEGER,
  schedule_status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
  outcome_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  fairness_score NUMERIC(12,2) NOT NULL DEFAULT 0,
  slot_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  note VARCHAR(240),
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, mock_member_id)
);

CREATE TABLE IF NOT EXISTS mock_bidding_actions (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES mock_bidding_cycles(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mock_bidding_requests (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES mock_bidding_cycles(id) ON DELETE CASCADE,
  mock_member_id TEXT NOT NULL REFERENCES mock_bidding_members(mock_member_id) ON DELETE CASCADE,
  current_event_id BIGINT REFERENCES mock_bidding_events(id) ON DELETE SET NULL,
  requested_event_id BIGINT REFERENCES mock_bidding_events(id) ON DELETE SET NULL,
  response_type VARCHAR(24) NOT NULL,
  reason VARCHAR(80),
  note VARCHAR(240),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mock_bidding_requests_cycle_idx
ON mock_bidding_requests (cycle_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS mock_bidding_roulette_results (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES mock_bidding_cycles(id) ON DELETE CASCADE,
  event_id BIGINT REFERENCES mock_bidding_events(id) ON DELETE SET NULL,
  category VARCHAR(80),
  mock_member_id TEXT NOT NULL REFERENCES mock_bidding_members(mock_member_id) ON DELETE CASCADE,
  pool_scope VARCHAR(24) NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
