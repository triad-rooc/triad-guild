import { requireSameOrigin, requireStaff } from './api-auth.js';
import { databaseError, ensureSchema, getSql } from './db.js';

const EVENT_TEMPLATE = [
  { order: 1, offset: 0, type: 'GL', label: 'GL #1 · Tuesday', cap: 15 },
  { order: 2, offset: 2, type: 'GL', label: 'GL #2 · Thursday', cap: 15 },
  { order: 3, offset: 5, type: 'EO', label: 'EO #1 · Sunday', cap: 10 },
  { order: 4, offset: 7, type: 'GL', label: 'GL #3 · Tuesday', cap: 15 },
  { order: 5, offset: 9, type: 'GL', label: 'GL #4 · Thursday', cap: 15 },
  { order: 6, offset: 12, type: 'EO', label: 'EO #2 · Sunday', cap: 10 },
];

const JOBS = [
  'Paladin','Lord Knight','High Priest','Champion','High Wizard','Professor',
  'Biochemist','Mastersmith','Sniper','Bard/Gypsy','Stalker','Assassin Cross',
  'Doram','Gunslinger',
];

const STATUSES = new Set(['draft','open','locked','completed']);
const OUTCOMES = new Set(['pending','won','lost','missed']);

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function plusDays(value, days) {
  const parts = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function intValue(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function eventCapacity(event, cycle) {
  const f = Math.floor(Number(event.fragment_stock || 0) / Math.max(1, Number(cycle.fragment_per_member || 3)));
  const l = Math.floor(Number(event.light_dark_stock || 0) / Math.max(1, Number(cycle.light_dark_per_member || 12)));
  const t = Math.floor(Number(event.time_space_stock || 0) / Math.max(1, Number(cycle.time_space_per_member || 15)));
  return Math.max(0, Math.min(Number(event.base_capacity || 0), f, l, t));
}

function slotIndex(page, slot) {
  const p = Number(page);
  const s = Number(slot);
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(s) || s < 1 || s > 4) return null;
  return ((p - 1) * 4) + (s - 1);
}

function slotFromIndex(index) {
  return {
    page: Math.floor(index / 4) + 1,
    slot: (index % 4) + 1,
  };
}

function pageSlots(position, amount, range) {
  if (!position || !amount || !range) return [];
  const rangeStart = slotIndex(range.startPage, range.startSlot);
  const rangeEnd = slotIndex(range.endPage, range.endSlot);
  if (rangeStart === null || rangeEnd === null || rangeEnd < rangeStart) return [];

  const start = rangeStart + ((Number(position) - 1) * Number(amount));
  const end = start + Number(amount) - 1;
  if (end > rangeEnd) return [];

  const result = [];
  for (let absolute = start; absolute <= end; absolute += 1) {
    result.push(slotFromIndex(absolute));
  }
  return result;
}

function eventRange(event, prefix) {
  return {
    startPage: Number(event[prefix + '_start_page'] || 1),
    startSlot: Number(event[prefix + '_start_slot'] || 1),
    endPage: Number(event[prefix + '_end_page'] || 1),
    endSlot: Number(event[prefix + '_end_slot'] || 1),
  };
}

function rangeLength(range) {
  const start = slotIndex(range.startPage, range.startSlot);
  const end = slotIndex(range.endPage, range.endSlot);
  if (start === null || end === null || end < start) return -1;
  return end - start + 1;
}

function makeSlotMap(position, cycle, event) {
  return {
    fragment: pageSlots(position, Number(cycle.fragment_per_member || 3), eventRange(event, 'fragment')),
    lightDark: pageSlots(position, Number(cycle.light_dark_per_member || 12), eventRange(event, 'light_dark')),
    timeSpace: pageSlots(position, Number(cycle.time_space_per_member || 15), eventRange(event, 'time_space')),
  };
}

function ffaRange(range, totalStock, allocatedQty) {
  const total = Math.max(0, Number(totalStock || 0));
  const allocated = Math.max(0, Number(allocatedQty || 0));
  const quantity = Math.max(0, total - allocated);
  if (!quantity) return { quantity: 0, start: null, end: null };

  const startIndex = slotIndex(range.startPage, range.startSlot);
  const endIndex = slotIndex(range.endPage, range.endSlot);
  if (startIndex === null || endIndex === null || endIndex < startIndex) {
    return { quantity, start: null, end: null };
  }

  const ffaStart = startIndex + Math.min(allocated, total);
  const ffaEnd = Math.min(endIndex, ffaStart + quantity - 1);
  if (ffaStart > endIndex) return { quantity, start: null, end: null };

  return {
    quantity,
    start: slotFromIndex(ffaStart),
    end: slotFromIndex(ffaEnd),
  };
}

function cycleJson(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    limits: {
      fragment: Number(row.fragment_per_member),
      lightDark: Number(row.light_dark_per_member),
      timeSpace: Number(row.time_space_per_member),
    },
    isMock: true,
  };
}

function eventJson(row) {
  return {
    id: Number(row.id),
    order: Number(row.event_order),
    type: row.event_type,
    label: row.event_label,
    biddingDate: row.bidding_date,
    baseCapacity: Number(row.base_capacity),
    effectiveCapacity: Number(row.effective_capacity),
    stock: {
      fragment: Number(row.fragment_stock),
      lightDark: Number(row.light_dark_stock),
      timeSpace: Number(row.time_space_stock),
    },
    ranges: {
      fragment: eventRange(row, 'fragment'),
      lightDark: eventRange(row, 'light_dark'),
      timeSpace: eventRange(row, 'time_space'),
    },
  };
}

function assignmentJson(row) {
  return {
    id: Number(row.id),
    discordId: row.mock_member_id,
    ign: row.ign,
    job: row.job,
    guildRole: row.guild_role,
    eventId: row.event_id === null ? null : Number(row.event_id),
    eventOrder: row.event_order === null ? null : Number(row.event_order),
    eventLabel: row.event_label || 'Needs Reschedule',
    biddingDate: row.bidding_date || null,
    bidPosition: row.bid_position === null ? null : Number(row.bid_position),
    scheduleStatus: row.schedule_status,
    outcomeStatus: row.outcome_status,
    locked: Boolean(row.locked),
    fairnessScore: Number(row.fairness_score || 0),
    slotMap: row.slot_map || {},
  };
}

let mockSchemaPromise = null;

async function ensureMockSchema() {
  if (!mockSchemaPromise) {
    mockSchemaPromise = (async () => {
      await ensureSchema();
      const sql = getSql();

      await sql`
        CREATE TABLE IF NOT EXISTS mock_bidding_members (
          mock_member_id TEXT PRIMARY KEY,
          ign VARCHAR(64) NOT NULL,
          job VARCHAR(32) NOT NULL,
          guild_role VARCHAR(16) NOT NULL DEFAULT 'Member',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
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
        )
      `;

      await sql`
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
        )
      `;

      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS fragment_start_page INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS fragment_start_slot INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS fragment_end_page INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS fragment_end_slot INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS light_dark_start_page INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS light_dark_start_slot INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS light_dark_end_page INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS light_dark_end_slot INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS time_space_start_page INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS time_space_start_slot INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS time_space_end_page INTEGER`;
      await sql`ALTER TABLE mock_bidding_events ADD COLUMN IF NOT EXISTS time_space_end_slot INTEGER`;

      await sql`
        UPDATE mock_bidding_events
        SET fragment_start_page = COALESCE(fragment_start_page, 1),
            fragment_start_slot = COALESCE(fragment_start_slot, 1),
            fragment_end_page = COALESCE(fragment_end_page, GREATEST(1, FLOOR((GREATEST(fragment_stock, 1) - 1) / 4.0)::INTEGER + 1)),
            fragment_end_slot = COALESCE(fragment_end_slot, ((GREATEST(fragment_stock, 1) - 1) % 4) + 1),
            light_dark_start_page = COALESCE(light_dark_start_page, 1),
            light_dark_start_slot = COALESCE(light_dark_start_slot, 1),
            light_dark_end_page = COALESCE(light_dark_end_page, GREATEST(1, FLOOR((GREATEST(light_dark_stock, 1) - 1) / 4.0)::INTEGER + 1)),
            light_dark_end_slot = COALESCE(light_dark_end_slot, ((GREATEST(light_dark_stock, 1) - 1) % 4) + 1),
            time_space_start_page = COALESCE(time_space_start_page, 1),
            time_space_start_slot = COALESCE(time_space_start_slot, 1),
            time_space_end_page = COALESCE(time_space_end_page, GREATEST(1, FLOOR((GREATEST(time_space_stock, 1) - 1) / 4.0)::INTEGER + 1)),
            time_space_end_slot = COALESCE(time_space_end_slot, ((GREATEST(time_space_stock, 1) - 1) % 4) + 1)
        WHERE fragment_start_page IS NULL OR fragment_start_slot IS NULL OR fragment_end_page IS NULL OR fragment_end_slot IS NULL
           OR light_dark_start_page IS NULL OR light_dark_start_slot IS NULL OR light_dark_end_page IS NULL OR light_dark_end_slot IS NULL
           OR time_space_start_page IS NULL OR time_space_start_slot IS NULL OR time_space_end_page IS NULL OR time_space_end_slot IS NULL
      `;

      await sql`
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
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS mock_bidding_actions (
          id BIGSERIAL PRIMARY KEY,
          cycle_id BIGINT NOT NULL REFERENCES mock_bidding_cycles(id) ON DELETE CASCADE,
          action_type VARCHAR(40) NOT NULL,
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
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
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS mock_bidding_requests_cycle_idx
        ON mock_bidding_requests (cycle_id, status, created_at DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS mock_bidding_roulette_results (
          id BIGSERIAL PRIMARY KEY,
          cycle_id BIGINT NOT NULL REFERENCES mock_bidding_cycles(id) ON DELETE CASCADE,
          event_id BIGINT REFERENCES mock_bidding_events(id) ON DELETE SET NULL,
          category VARCHAR(80),
          mock_member_id TEXT NOT NULL REFERENCES mock_bidding_members(mock_member_id) ON DELETE CASCADE,
          pool_scope VARCHAR(24) NOT NULL,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      for (let i = 1; i <= 80; i += 1) {
        const id = 'mock-' + String(i).padStart(3, '0');
        const ign = 'Player ' + i;
        const job = JOBS[(i - 1) % JOBS.length];
        await sql`
          INSERT INTO mock_bidding_members (mock_member_id, ign, job, guild_role)
          VALUES (${id}, ${ign}, ${job}, 'Member')
          ON CONFLICT (mock_member_id) DO UPDATE SET
            ign = EXCLUDED.ign,
            job = EXCLUDED.job,
            guild_role = 'Member'
        `;
      }
    })().catch((error) => {
      mockSchemaPromise = null;
      throw error;
    });
  }
  return mockSchemaPromise;
}

async function saveAction(sql, cycleId, type, payload, uid) {
  const json = JSON.stringify(payload || {});
  await sql`
    INSERT INTO mock_bidding_actions (cycle_id, action_type, payload, created_by)
    VALUES (${cycleId}, ${type}, ${json}::jsonb, ${uid})
  `;
}

async function latestCycle(sql) {
  const rows = await sql`SELECT * FROM mock_bidding_cycles ORDER BY start_date DESC, id DESC LIMIT 1`;
  return rows[0] || null;
}

async function preferredViewerCycle(sql) {
  const rows = await sql`
    SELECT c.*, COUNT(a.id)::INTEGER AS assignment_count
    FROM mock_bidding_cycles c
    LEFT JOIN mock_bidding_assignments a ON a.cycle_id = c.id
    GROUP BY c.id
    ORDER BY
      CASE WHEN COUNT(a.id) > 0 THEN 0 ELSE 1 END,
      CASE c.status
        WHEN 'open' THEN 0
        WHEN 'locked' THEN 1
        WHEN 'completed' THEN 2
        ELSE 3
      END,
      c.start_date DESC,
      c.id DESC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function renumberEvent(sql, cycle, eventId, uid) {
  if (!eventId) return;
  const eventRows = await sql`SELECT * FROM mock_bidding_events WHERE id = ${eventId} AND cycle_id = ${cycle.id} LIMIT 1`;
  const event = eventRows[0];
  if (!event) return;
  const rows = await sql`
    SELECT id
    FROM mock_bidding_assignments
    WHERE cycle_id = ${cycle.id}
      AND event_id = ${eventId}
      AND schedule_status = 'scheduled'
    ORDER BY COALESCE(bid_position, 9999), id
  `;
  for (let i = 0; i < rows.length; i += 1) {
    const position = i + 1;
    const map = JSON.stringify(makeSlotMap(position, cycle, event));
    await sql`
      UPDATE mock_bidding_assignments
      SET bid_position = ${position},
          slot_map = ${map}::jsonb,
          updated_by = ${uid},
          updated_at = NOW()
      WHERE id = ${rows[i].id}
    `;
  }
}

async function loadCycle(sql, cycleId) {
  const cycleRows = await sql`SELECT * FROM mock_bidding_cycles WHERE id = ${cycleId} LIMIT 1`;
  const cycle = cycleRows[0];
  if (!cycle) return { cycle: null, events: [], assignments: [], shortages: [], summary: null };

  const eventRows = await sql`
    SELECT * FROM mock_bidding_events
    WHERE cycle_id = ${cycleId}
    ORDER BY event_order
  `;

  const assignmentRows = await sql`
    SELECT a.*, p.ign, p.job, p.guild_role, e.event_label, e.bidding_date
    FROM mock_bidding_assignments a
    JOIN mock_bidding_members p ON p.mock_member_id = a.mock_member_id
    LEFT JOIN mock_bidding_events e ON e.id = a.event_id
    WHERE a.cycle_id = ${cycleId}
    ORDER BY COALESCE(a.event_order, 999), COALESCE(a.bid_position, 999), LOWER(p.ign)
  `;

  const events = eventRows.map(eventJson);
  const assignments = assignmentRows.map(assignmentJson);
  const shortages = [];

  for (const event of events) {
    const members = assignments.filter((a) => a.eventId === event.id && a.scheduleStatus === 'scheduled');
    const bidderCount = members.length;
    event.ffa = {
      fragment: ffaRange(event.ranges.fragment, event.stock.fragment, bidderCount * Number(cycle.fragment_per_member || 3)),
      lightDark: ffaRange(event.ranges.lightDark, event.stock.lightDark, bidderCount * Number(cycle.light_dark_per_member || 12)),
      timeSpace: ffaRange(event.ranges.timeSpace, event.stock.timeSpace, bidderCount * Number(cycle.time_space_per_member || 15)),
    };

    if (members.length <= event.effectiveCapacity) continue;
    const needed = members.length - event.effectiveCapacity;
    const candidates = members
      .filter((a) => !a.locked)
      .sort((a, b) => Number(b.bidPosition || 0) - Number(a.bidPosition || 0));

    for (let i = 0; i < needed && i < candidates.length; i += 1) {
      const candidate = candidates[i];
      let target = null;
      for (const possible of events) {
        if (possible.order <= event.order) continue;
        const used = assignments.filter((a) => a.eventId === possible.id && a.scheduleStatus === 'scheduled').length;
        if (used < possible.effectiveCapacity) {
          target = possible;
          break;
        }
      }
      shortages.push({
        eventId: event.id,
        eventLabel: event.label,
        member: { discordId: candidate.discordId, ign: candidate.ign },
        targetEventId: target ? target.id : null,
        targetEventLabel: target ? target.label : null,
      });
    }
  }

  return {
    cycle: cycleJson(cycle),
    events,
    assignments,
    shortages,
    summary: {
      scheduled: assignments.filter((a) => a.scheduleStatus === 'scheduled').length,
      needsReschedule: assignments.filter((a) => a.scheduleStatus === 'needs_reschedule').length,
      totalAssignments: assignments.length,
      totalCapacity: events.reduce((sum, e) => sum + e.effectiveCapacity, 0),
      baseCapacity: events.reduce((sum, e) => sum + e.baseCapacity, 0),
    },
  };
}

async function withManagerData(sql, data) {
  const cycleRows = await sql`
    SELECT c.*, COUNT(a.id)::INTEGER AS assignment_count
    FROM mock_bidding_cycles c
    LEFT JOIN mock_bidding_assignments a ON a.cycle_id = c.id
    GROUP BY c.id
    ORDER BY c.start_date DESC, c.id DESC
    LIMIT 12
  `;
  data.cycles = cycleRows.map((row) => ({
    id: Number(row.id),
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    assignmentCount: Number(row.assignment_count || 0),
  }));

  const roster = await sql`
    SELECT mock_member_id, ign, job, guild_role
    FROM mock_bidding_members
    ORDER BY CAST(SUBSTRING(mock_member_id FROM 6) AS INTEGER)
  `;
  data.roster = roster.map((row) => ({
    discordId: row.mock_member_id,
    ign: row.ign,
    job: row.job,
    guildRole: row.guild_role,
  }));

  if (data.cycle) {
    const history = await sql`
      SELECT r.*, p.ign, p.job
      FROM mock_bidding_roulette_results r
      JOIN mock_bidding_members p ON p.mock_member_id = r.mock_member_id
      WHERE r.cycle_id = ${data.cycle.id}
      ORDER BY r.created_at DESC
      LIMIT 20
    `;
    data.rouletteHistory = history.map((row) => ({
      id: Number(row.id),
      discordId: row.mock_member_id,
      ign: row.ign,
      job: row.job,
      category: row.category,
      eventId: row.event_id ? Number(row.event_id) : null,
      poolScope: row.pool_scope,
      createdAt: row.created_at,
    }));

    const requestRows = await sql`
      SELECT r.*, p.ign, p.job,
             current_event.event_label AS current_event_label,
             target_event.event_label AS requested_event_label
      FROM mock_bidding_requests r
      JOIN mock_bidding_members p ON p.mock_member_id = r.mock_member_id
      LEFT JOIN mock_bidding_events current_event ON current_event.id = r.current_event_id
      LEFT JOIN mock_bidding_events target_event ON target_event.id = r.requested_event_id
      WHERE r.cycle_id = ${data.cycle.id}
      ORDER BY r.created_at DESC, r.id DESC
    `;

    data.requests = requestRows.map((row) => ({
      id: Number(row.id),
      discordId: row.mock_member_id,
      ign: row.ign,
      job: row.job,
      responseType: row.response_type,
      reason: row.reason || '',
      note: row.note || '',
      status: row.status,
      currentEventId: row.current_event_id ? Number(row.current_event_id) : null,
      currentEventLabel: row.current_event_label || 'Needs Reschedule',
      requestedEventId: row.requested_event_id ? Number(row.requested_event_id) : null,
      requestedEventLabel: row.requested_event_label || '',
      reviewedBy: row.reviewed_by || '',
      reviewedAt: row.reviewed_at || null,
      createdAt: row.created_at,
    }));
  } else {
    data.rouletteHistory = [];
    data.requests = [];
  }

  data.mock = true;
  return data;
}

export async function handleMockBidding(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = requireStaff(req, res);
  if (!session) return;

  try {
    await ensureMockSchema();
    const sql = getSql();

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const requestedId = Number(url.searchParams.get('cycleId') || 0);
      const portalView = url.searchParams.get('portal') === '1';
      let cycle = null;
      if (requestedId) {
        const rows = await sql`SELECT * FROM mock_bidding_cycles WHERE id = ${requestedId} LIMIT 1`;
        cycle = rows[0] || null;
      } else {
        cycle = portalView ? await preferredViewerCycle(sql) : await latestCycle(sql);
      }

      const data = cycle
        ? await loadCycle(sql, cycle.id)
        : { cycle: null, events: [], assignments: [], shortages: [], summary: null };
      return res.status(200).json(await withManagerData(sql, data));
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    if (!requireSameOrigin(req, res)) return;
    const body = readBody(req);
    if (!body) return res.status(400).json({ error: 'invalid_json' });
    const action = String(body.action || '');

    if (action === 'create_cycle') {
      const startDate = String(body.startDate || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ error: 'invalid_date', message: 'Choose the Tuesday that starts this mock cycle.' });
      }

      const fragment = Math.max(1, intValue(body.fragmentPerMember, 3));
      const lightDark = Math.max(1, intValue(body.lightDarkPerMember, 12));
      const timeSpace = Math.max(1, intValue(body.timeSpacePerMember, 15));
      const endDate = plusDays(startDate, 12);

      const rows = await sql`
        INSERT INTO mock_bidding_cycles (
          start_date, end_date, status,
          fragment_per_member, light_dark_per_member, time_space_per_member,
          created_by
        ) VALUES (
          ${startDate}, ${endDate}, 'draft',
          ${fragment}, ${lightDark}, ${timeSpace},
          ${session.uid}
        )
        RETURNING *
      `;
      const cycle = rows[0];

      for (const item of EVENT_TEMPLATE) {
        await sql`
          INSERT INTO mock_bidding_events (
            cycle_id, event_order, event_type, event_label, bidding_date, base_capacity,
            fragment_stock, light_dark_stock, time_space_stock,
            fragment_start_page, fragment_start_slot, fragment_end_page, fragment_end_slot,
            light_dark_start_page, light_dark_start_slot, light_dark_end_page, light_dark_end_slot,
            time_space_start_page, time_space_start_slot, time_space_end_page, time_space_end_slot,
            effective_capacity
          ) VALUES (
            ${cycle.id}, ${item.order}, ${item.type}, ${item.label}, ${plusDays(startDate, item.offset)},
            ${item.cap}, ${item.cap * fragment}, ${item.cap * lightDark}, ${item.cap * timeSpace},
            1, 1, ${slotFromIndex((item.cap * fragment) - 1).page}, ${slotFromIndex((item.cap * fragment) - 1).slot},
            1, 1, ${slotFromIndex((item.cap * lightDark) - 1).page}, ${slotFromIndex((item.cap * lightDark) - 1).slot},
            1, 1, ${slotFromIndex((item.cap * timeSpace) - 1).page}, ${slotFromIndex((item.cap * timeSpace) - 1).slot},
            ${item.cap}
          )
        `;
      }

      await saveAction(sql, cycle.id, 'create_cycle', { startDate, testPlayers: 80 }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycle.id)));
    }

    const cycleId = Number(body.cycleId || 0);
    if (!cycleId) return res.status(400).json({ error: 'invalid_cycle' });

    const cycleRows = await sql`SELECT * FROM mock_bidding_cycles WHERE id = ${cycleId} LIMIT 1`;
    const cycle = cycleRows[0];
    if (!cycle) return res.status(404).json({ error: 'cycle_not_found' });

    if (action === 'update_limits') {
      if (cycle.status === 'completed') return res.status(409).json({ error: 'cycle_completed' });
      const fragment = Math.max(1, intValue(body.fragmentPerMember, Number(cycle.fragment_per_member)));
      const lightDark = Math.max(1, intValue(body.lightDarkPerMember, Number(cycle.light_dark_per_member)));
      const timeSpace = Math.max(1, intValue(body.timeSpacePerMember, Number(cycle.time_space_per_member)));

      await sql`
        UPDATE mock_bidding_cycles
        SET fragment_per_member = ${fragment},
            light_dark_per_member = ${lightDark},
            time_space_per_member = ${timeSpace},
            updated_at = NOW()
        WHERE id = ${cycleId}
      `;

      const updated = { ...cycle, fragment_per_member: fragment, light_dark_per_member: lightDark, time_space_per_member: timeSpace };
      const events = await sql`SELECT * FROM mock_bidding_events WHERE cycle_id = ${cycleId}`;
      for (const event of events) {
        const cap = eventCapacity(event, updated);
        await sql`UPDATE mock_bidding_events SET effective_capacity = ${cap}, updated_at = NOW() WHERE id = ${event.id}`;
        await renumberEvent(sql, updated, event.id, session.uid);
      }

      await saveAction(sql, cycleId, 'update_limits', { fragment, lightDark, timeSpace }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'update_event_stock') {
      const eventId = Number(body.eventId || 0);
      const rows = await sql`
        SELECT * FROM mock_bidding_events
        WHERE id = ${eventId} AND cycle_id = ${cycleId}
        LIMIT 1
      `;
      const event = rows[0];
      if (!event) return res.status(404).json({ error: 'event_not_found' });

      const fragment = intValue(body.fragmentStock, 0);
      const lightDark = intValue(body.lightDarkStock, 0);
      const timeSpace = intValue(body.timeSpaceStock, 0);

      const ranges = {
        fragment: {
          startPage: intValue(body.fragmentStartPage, 1),
          startSlot: intValue(body.fragmentStartSlot, 1),
          endPage: intValue(body.fragmentEndPage, 1),
          endSlot: intValue(body.fragmentEndSlot, 1),
        },
        lightDark: {
          startPage: intValue(body.lightDarkStartPage, 1),
          startSlot: intValue(body.lightDarkStartSlot, 1),
          endPage: intValue(body.lightDarkEndPage, 1),
          endSlot: intValue(body.lightDarkEndSlot, 1),
        },
        timeSpace: {
          startPage: intValue(body.timeSpaceStartPage, 1),
          startSlot: intValue(body.timeSpaceStartSlot, 1),
          endPage: intValue(body.timeSpaceEndPage, 1),
          endSlot: intValue(body.timeSpaceEndSlot, 1),
        },
      };

      const checks = [
        ['Illusion Fragments', fragment, ranges.fragment],
        ['Light & Dark Feathers', lightDark, ranges.lightDark],
        ['Time & Space Feathers', timeSpace, ranges.timeSpace],
      ];

      for (const [label, quantity, range] of checks) {
        if (range.startSlot < 1 || range.startSlot > 4 || range.endSlot < 1 || range.endSlot > 4 ||
            range.startPage < 1 || range.endPage < 1 || rangeLength(range) < 0) {
          return res.status(400).json({ error: 'invalid_slot_range', message: label + ': enter a valid page/slot range. Slots must be 1–4.' });
        }
        if (quantity > 0 && rangeLength(range) !== quantity) {
          return res.status(400).json({
            error: 'range_quantity_mismatch',
            message: label + ': the selected page/slot range contains ' + rangeLength(range) + ' slots, but quantity is ' + quantity + '.',
          });
        }
      }

      const nextEvent = {
        ...event,
        fragment_stock: fragment,
        light_dark_stock: lightDark,
        time_space_stock: timeSpace,
        fragment_start_page: ranges.fragment.startPage,
        fragment_start_slot: ranges.fragment.startSlot,
        fragment_end_page: ranges.fragment.endPage,
        fragment_end_slot: ranges.fragment.endSlot,
        light_dark_start_page: ranges.lightDark.startPage,
        light_dark_start_slot: ranges.lightDark.startSlot,
        light_dark_end_page: ranges.lightDark.endPage,
        light_dark_end_slot: ranges.lightDark.endSlot,
        time_space_start_page: ranges.timeSpace.startPage,
        time_space_start_slot: ranges.timeSpace.startSlot,
        time_space_end_page: ranges.timeSpace.endPage,
        time_space_end_slot: ranges.timeSpace.endSlot,
      };
      const cap = eventCapacity(nextEvent, cycle);

      await sql`
        UPDATE mock_bidding_events
        SET fragment_stock = ${fragment},
            light_dark_stock = ${lightDark},
            time_space_stock = ${timeSpace},
            fragment_start_page = ${ranges.fragment.startPage},
            fragment_start_slot = ${ranges.fragment.startSlot},
            fragment_end_page = ${ranges.fragment.endPage},
            fragment_end_slot = ${ranges.fragment.endSlot},
            light_dark_start_page = ${ranges.lightDark.startPage},
            light_dark_start_slot = ${ranges.lightDark.startSlot},
            light_dark_end_page = ${ranges.lightDark.endPage},
            light_dark_end_slot = ${ranges.lightDark.endSlot},
            time_space_start_page = ${ranges.timeSpace.startPage},
            time_space_start_slot = ${ranges.timeSpace.startSlot},
            time_space_end_page = ${ranges.timeSpace.endPage},
            time_space_end_slot = ${ranges.timeSpace.endSlot},
            effective_capacity = ${cap},
            updated_at = NOW()
        WHERE id = ${eventId}
      `;

      await renumberEvent(sql, cycle, eventId, session.uid);
      await saveAction(sql, cycleId, 'update_stock', { eventId, fragment, lightDark, timeSpace, ranges, effectiveCapacity: cap }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'randomize') {
      if (cycle.status === 'locked' || cycle.status === 'completed') {
        return res.status(409).json({ error: 'cycle_locked', message: 'Change the mock cycle back to Draft or Open before randomizing.' });
      }

      const snapshot = await sql`
        SELECT mock_member_id, event_id, event_order, bid_position, schedule_status,
               outcome_status, locked, fairness_score, slot_map, note
        FROM mock_bidding_assignments
        WHERE cycle_id = ${cycleId}
        ORDER BY id
      `;

      const events = await sql`SELECT * FROM mock_bidding_events WHERE cycle_id = ${cycleId} ORDER BY event_order`;
      const roster = await sql`SELECT mock_member_id FROM mock_bidding_members ORDER BY mock_member_id`;
      const lockedRows = await sql`
        SELECT * FROM mock_bidding_assignments
        WHERE cycle_id = ${cycleId} AND locked = TRUE AND event_id IS NOT NULL
      `;
      const lockedIds = new Set(lockedRows.map((row) => row.mock_member_id));

      await sql`DELETE FROM mock_bidding_assignments WHERE cycle_id = ${cycleId} AND locked = FALSE`;

      const available = roster
        .filter((member) => !lockedIds.has(member.mock_member_id))
        .map((member) => ({ mockMemberId: member.mock_member_id, fairness: 350, random: Math.random() }))
        .sort((a, b) => a.random - b.random);

      const buckets = new Map();
      for (const event of events) buckets.set(Number(event.id), []);
      for (const locked of lockedRows) {
        const bucket = buckets.get(Number(locked.event_id));
        if (bucket) bucket.push({ mockMemberId: locked.mock_member_id, fairness: Number(locked.fairness_score || 350), locked: true });
      }

      let cursor = 0;
      for (const event of events) {
        const bucket = buckets.get(Number(event.id)) || [];
        const remaining = Math.max(0, Number(event.effective_capacity) - bucket.length);
        for (let i = 0; i < remaining && cursor < available.length; i += 1) {
          bucket.push(available[cursor++]);
        }
        buckets.set(Number(event.id), bucket);
      }

      for (const event of events) {
        const bucket = buckets.get(Number(event.id)) || [];
        for (let i = 0; i < bucket.length; i += 1) {
          const member = bucket[i];
          const position = i + 1;
          const slotMap = JSON.stringify(makeSlotMap(position, cycle, event));
          await sql`
            INSERT INTO mock_bidding_assignments (
              cycle_id, event_id, mock_member_id, event_order, bid_position,
              schedule_status, outcome_status, locked, fairness_score, slot_map, updated_by
            ) VALUES (
              ${cycleId}, ${event.id}, ${member.mockMemberId}, ${event.event_order}, ${position},
              'scheduled', 'pending', ${Boolean(member.locked)}, ${member.fairness}, ${slotMap}::jsonb, ${session.uid}
            )
            ON CONFLICT (cycle_id, mock_member_id) DO UPDATE SET
              event_id = EXCLUDED.event_id,
              event_order = EXCLUDED.event_order,
              bid_position = EXCLUDED.bid_position,
              schedule_status = 'scheduled',
              outcome_status = 'pending',
              locked = EXCLUDED.locked,
              fairness_score = EXCLUDED.fairness_score,
              slot_map = EXCLUDED.slot_map,
              updated_by = EXCLUDED.updated_by,
              updated_at = NOW()
          `;
        }
      }

      while (cursor < available.length) {
        const member = available[cursor++];
        await sql`
          INSERT INTO mock_bidding_assignments (
            cycle_id, event_id, mock_member_id, event_order, bid_position,
            schedule_status, outcome_status, locked, fairness_score, slot_map, updated_by
          ) VALUES (
            ${cycleId}, NULL, ${member.mockMemberId}, NULL, NULL,
            'needs_reschedule', 'pending', FALSE, ${member.fairness}, '{}'::jsonb, ${session.uid}
          )
          ON CONFLICT (cycle_id, mock_member_id) DO UPDATE SET
            event_id = NULL,
            event_order = NULL,
            bid_position = NULL,
            schedule_status = 'needs_reschedule',
            outcome_status = 'pending',
            locked = FALSE,
            slot_map = '{}'::jsonb,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `;
      }

      await saveAction(sql, cycleId, 'randomize', { before: snapshot }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'undo_randomize') {
      const rows = await sql`
        SELECT payload FROM mock_bidding_actions
        WHERE cycle_id = ${cycleId} AND action_type = 'randomize'
        ORDER BY id DESC LIMIT 1
      `;
      const before = rows[0]?.payload?.before;
      if (!Array.isArray(before)) {
        return res.status(409).json({ error: 'nothing_to_undo', message: 'No mock randomization snapshot is available.' });
      }

      await sql`DELETE FROM mock_bidding_assignments WHERE cycle_id = ${cycleId}`;
      for (const item of before) {
        const slotMap = JSON.stringify(item.slot_map || {});
        await sql`
          INSERT INTO mock_bidding_assignments (
            cycle_id, event_id, mock_member_id, event_order, bid_position, schedule_status,
            outcome_status, locked, fairness_score, slot_map, note, updated_by
          ) VALUES (
            ${cycleId}, ${item.event_id}, ${item.mock_member_id}, ${item.event_order}, ${item.bid_position},
            ${item.schedule_status}, ${item.outcome_status}, ${Boolean(item.locked)},
            ${Number(item.fairness_score || 0)}, ${slotMap}::jsonb, ${item.note || ''}, ${session.uid}
          )
        `;
      }
      await saveAction(sql, cycleId, 'undo_randomize', {}, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'move') {
      const memberId = String(body.discordId || '');
      const eventId = body.eventId ? Number(body.eventId) : null;
      const currentRows = await sql`
        SELECT * FROM mock_bidding_assignments
        WHERE cycle_id = ${cycleId} AND mock_member_id = ${memberId}
        LIMIT 1
      `;
      const current = currentRows[0];
      if (!current) return res.status(404).json({ error: 'assignment_not_found' });

      let event = null;
      if (eventId) {
        const rows = await sql`SELECT * FROM mock_bidding_events WHERE id = ${eventId} AND cycle_id = ${cycleId} LIMIT 1`;
        event = rows[0] || null;
        if (!event) return res.status(404).json({ error: 'event_not_found' });
      }

      await sql`
        UPDATE mock_bidding_assignments
        SET event_id = ${event ? event.id : null},
            event_order = ${event ? event.event_order : null},
            bid_position = NULL,
            schedule_status = ${event ? 'scheduled' : 'needs_reschedule'},
            slot_map = '{}'::jsonb,
            updated_by = ${session.uid},
            updated_at = NOW()
        WHERE id = ${current.id}
      `;
      if (current.event_id) await renumberEvent(sql, cycle, current.event_id, session.uid);
      if (event) await renumberEvent(sql, cycle, event.id, session.uid);
      await saveAction(sql, cycleId, 'move', { memberId, eventId }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'set_lock') {
      const memberId = String(body.discordId || '');
      const locked = Boolean(body.locked);
      await sql`
        UPDATE mock_bidding_assignments
        SET locked = ${locked}, updated_by = ${session.uid}, updated_at = NOW()
        WHERE cycle_id = ${cycleId} AND mock_member_id = ${memberId}
      `;
      await saveAction(sql, cycleId, 'set_lock', { memberId, locked }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'set_outcome') {
      const memberId = String(body.discordId || '');
      const outcome = String(body.outcome || '');
      if (!OUTCOMES.has(outcome)) return res.status(400).json({ error: 'invalid_outcome' });
      await sql`
        UPDATE mock_bidding_assignments
        SET outcome_status = ${outcome}, updated_by = ${session.uid}, updated_at = NOW()
        WHERE cycle_id = ${cycleId} AND mock_member_id = ${memberId}
      `;
      await saveAction(sql, cycleId, 'set_outcome', { memberId, outcome }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'set_status') {
      const status = String(body.status || '');
      if (!STATUSES.has(status)) return res.status(400).json({ error: 'invalid_status' });
      await sql`UPDATE mock_bidding_cycles SET status = ${status}, updated_at = NOW() WHERE id = ${cycleId}`;
      await saveAction(sql, cycleId, 'set_status', { status }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'swap') {
      const a = String(body.a || '');
      const b = String(body.b || '');
      if (!a || !b || a === b) return res.status(400).json({ error: 'invalid_swap' });

      const rows = await sql`
        SELECT * FROM mock_bidding_assignments
        WHERE cycle_id = ${cycleId} AND mock_member_id IN (${a}, ${b})
      `;
      const first = rows.find((row) => row.mock_member_id === a);
      const second = rows.find((row) => row.mock_member_id === b);
      if (!first || !second) return res.status(404).json({ error: 'assignment_not_found' });

      await sql`
        UPDATE mock_bidding_assignments
        SET event_id = ${second.event_id}, event_order = ${second.event_order}, bid_position = ${second.bid_position},
            schedule_status = ${second.schedule_status}, slot_map = ${JSON.stringify(second.slot_map || {})}::jsonb,
            updated_by = ${session.uid}, updated_at = NOW()
        WHERE id = ${first.id}
      `;
      await sql`
        UPDATE mock_bidding_assignments
        SET event_id = ${first.event_id}, event_order = ${first.event_order}, bid_position = ${first.bid_position},
            schedule_status = ${first.schedule_status}, slot_map = ${JSON.stringify(first.slot_map || {})}::jsonb,
            updated_by = ${session.uid}, updated_at = NOW()
        WHERE id = ${second.id}
      `;

      const affected = new Set([first.event_id, second.event_id].filter(Boolean).map(Number));
      for (const eventId of affected) await renumberEvent(sql, cycle, eventId, session.uid);
      await saveAction(sql, cycleId, 'swap', { a, b }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'submit_bid_response') {
      const memberId = String(body.discordId || '');
      const responseType = String(body.responseType || '');
      const reason = String(body.reason || '').slice(0, 80);
      const note = String(body.note || '').slice(0, 240);
      const requestedEventId = body.requestedEventId ? Number(body.requestedEventId) : null;

      if (!['can_bid', 'cannot_bid', 'change_date'].includes(responseType)) {
        return res.status(400).json({ error: 'invalid_response_type', message: 'Choose Can Bid, Cannot Bid, or Request Date Change.' });
      }

      const memberRows = await sql`
        SELECT * FROM mock_bidding_members WHERE mock_member_id = ${memberId} LIMIT 1
      `;
      if (!memberRows[0]) return res.status(404).json({ error: 'member_not_found' });

      const assignmentRows = await sql`
        SELECT * FROM mock_bidding_assignments
        WHERE cycle_id = ${cycleId} AND mock_member_id = ${memberId}
        LIMIT 1
      `;
      const assignment = assignmentRows[0];
      if (!assignment) return res.status(409).json({ error: 'assignment_not_found', message: 'Randomize the mock cycle before submitting availability.' });

      let targetEvent = null;
      if (responseType === 'change_date') {
        if (!requestedEventId) return res.status(400).json({ error: 'target_required', message: 'Choose a requested bidding date.' });
        const targetRows = await sql`
          SELECT * FROM mock_bidding_events WHERE id = ${requestedEventId} AND cycle_id = ${cycleId} LIMIT 1
        `;
        targetEvent = targetRows[0] || null;
        if (!targetEvent) return res.status(404).json({ error: 'event_not_found' });
        if (Number(assignment.event_id || 0) === Number(targetEvent.id)) {
          return res.status(400).json({ error: 'same_event', message: 'Choose a different bidding date.' });
        }
      }

      await sql`
        UPDATE mock_bidding_requests
        SET status = 'superseded', updated_at = NOW()
        WHERE cycle_id = ${cycleId}
          AND mock_member_id = ${memberId}
          AND status = 'pending'
      `;

      const requestStatus = responseType === 'can_bid' ? 'confirmed' : 'pending';
      await sql`
        INSERT INTO mock_bidding_requests (
          cycle_id, mock_member_id, current_event_id, requested_event_id,
          response_type, reason, note, status
        ) VALUES (
          ${cycleId}, ${memberId}, ${assignment.event_id}, ${targetEvent ? targetEvent.id : null},
          ${responseType}, ${reason}, ${note}, ${requestStatus}
        )
      `;

      await saveAction(sql, cycleId, 'submit_bid_response', {
        memberId, responseType, requestedEventId: targetEvent ? Number(targetEvent.id) : null, reason,
      }, session.uid);

      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'review_bid_request') {
      const requestId = Number(body.requestId || 0);
      const decision = String(body.decision || '');
      if (!requestId || !['approve', 'reject'].includes(decision)) {
        return res.status(400).json({ error: 'invalid_review' });
      }

      const requestRows = await sql`
        SELECT * FROM mock_bidding_requests
        WHERE id = ${requestId} AND cycle_id = ${cycleId}
        LIMIT 1
      `;
      const request = requestRows[0];
      if (!request) return res.status(404).json({ error: 'request_not_found' });
      if (request.status !== 'pending') {
        return res.status(409).json({ error: 'already_reviewed', message: 'This request is no longer pending.' });
      }

      if (decision === 'reject') {
        await sql`
          UPDATE mock_bidding_requests
          SET status = 'rejected', reviewed_by = ${session.uid}, reviewed_at = NOW(), updated_at = NOW()
          WHERE id = ${requestId}
        `;
        await saveAction(sql, cycleId, 'reject_bid_request', { requestId }, session.uid);
        return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
      }

      const assignmentRows = await sql`
        SELECT * FROM mock_bidding_assignments
        WHERE cycle_id = ${cycleId} AND mock_member_id = ${request.mock_member_id}
        LIMIT 1
      `;
      const assignment = assignmentRows[0];
      if (!assignment) return res.status(404).json({ error: 'assignment_not_found' });

      if (request.response_type === 'change_date') {
        const targetRows = await sql`
          SELECT * FROM mock_bidding_events
          WHERE id = ${request.requested_event_id} AND cycle_id = ${cycleId}
          LIMIT 1
        `;
        const target = targetRows[0];
        if (!target) return res.status(404).json({ error: 'event_not_found' });

        const countRows = await sql`
          SELECT COUNT(*)::INTEGER AS count
          FROM mock_bidding_assignments
          WHERE cycle_id = ${cycleId}
            AND event_id = ${target.id}
            AND schedule_status = 'scheduled'
            AND mock_member_id <> ${request.mock_member_id}
        `;
        const used = Number(countRows[0]?.count || 0);
        if (used >= Number(target.effective_capacity)) {
          return res.status(409).json({ error: 'event_full', message: 'That bidding date is already full. Reject the request or move/swap another bidder first.' });
        }

        const previousEventId = assignment.event_id;
        await sql`
          UPDATE mock_bidding_assignments
          SET event_id = ${target.id},
              event_order = ${target.event_order},
              bid_position = NULL,
              schedule_status = 'scheduled',
              slot_map = '{}'::jsonb,
              updated_by = ${session.uid},
              updated_at = NOW()
          WHERE id = ${assignment.id}
        `;
        if (previousEventId) await renumberEvent(sql, cycle, previousEventId, session.uid);
        await renumberEvent(sql, cycle, target.id, session.uid);
      } else if (request.response_type === 'cannot_bid') {
        const previousEventId = assignment.event_id;
        await sql`
          UPDATE mock_bidding_assignments
          SET event_id = NULL,
              event_order = NULL,
              bid_position = NULL,
              schedule_status = 'needs_reschedule',
              slot_map = '{}'::jsonb,
              updated_by = ${session.uid},
              updated_at = NOW()
          WHERE id = ${assignment.id}
        `;
        if (previousEventId) await renumberEvent(sql, cycle, previousEventId, session.uid);
      }

      await sql`
        UPDATE mock_bidding_requests
        SET status = 'approved', reviewed_by = ${session.uid}, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = ${requestId}
      `;
      await saveAction(sql, cycleId, 'approve_bid_request', { requestId, responseType: request.response_type }, session.uid);
      return res.status(200).json(await withManagerData(sql, await loadCycle(sql, cycleId)));
    }

    if (action === 'roulette') {
      const scope = String(body.scope || 'all');
      const eventId = body.eventId ? Number(body.eventId) : null;
      const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds.map(String) : [];
      const excludeWinners = Boolean(body.excludeWinners);
      const excludeAssignedEvent = Boolean(body.excludeAssignedEvent);

      let pool = [];
      if (scope === 'selected') {
        pool = selectedIds;
      } else if (scope === 'event' && eventId) {
        const rows = await sql`
          SELECT mock_member_id FROM mock_bidding_assignments
          WHERE cycle_id = ${cycleId} AND event_id = ${eventId} AND schedule_status = 'scheduled'
        `;
        pool = rows.map((row) => row.mock_member_id);
      } else {
        const rows = await sql`SELECT mock_member_id FROM mock_bidding_members`;
        pool = rows.map((row) => row.mock_member_id);
      }

      if (excludeWinners) {
        const rows = await sql`SELECT mock_member_id FROM mock_bidding_roulette_results WHERE cycle_id = ${cycleId}`;
        const excluded = new Set(rows.map((row) => row.mock_member_id));
        pool = pool.filter((id) => !excluded.has(id));
      }

      if (excludeAssignedEvent && eventId) {
        const rows = await sql`
          SELECT mock_member_id FROM mock_bidding_assignments
          WHERE cycle_id = ${cycleId} AND event_id = ${eventId} AND schedule_status = 'scheduled'
        `;
        const excluded = new Set(rows.map((row) => row.mock_member_id));
        pool = pool.filter((id) => !excluded.has(id));
      }

      pool = [...new Set(pool)];
      if (!pool.length) return res.status(409).json({ error: 'empty_pool', message: 'No eligible test players remain in this roulette pool.' });

      const winnerId = pool[Math.floor(Math.random() * pool.length)];
      const winnerRows = await sql`SELECT * FROM mock_bidding_members WHERE mock_member_id = ${winnerId} LIMIT 1`;
      const winner = winnerRows[0];
      const category = String(body.category || 'Extra / Excess').slice(0, 80);

      await sql`
        INSERT INTO mock_bidding_roulette_results (
          cycle_id, event_id, category, mock_member_id, pool_scope, created_by
        ) VALUES (
          ${cycleId}, ${eventId}, ${category}, ${winnerId}, ${scope}, ${session.uid}
        )
      `;
      await saveAction(sql, cycleId, 'roulette', { winnerId, scope, eventId, category }, session.uid);

      return res.status(200).json({
        winner: {
          discordId: winner.mock_member_id,
          ign: winner.ign,
          job: winner.job,
          guildRole: winner.guild_role,
        },
      });
    }

    return res.status(400).json({ error: 'unknown_action' });
  } catch (error) {
    return databaseError(res, error);
  }
}
