
import { requireSameOrigin, requireSession, requireStaff } from '../lib/api-auth.js';
import { databaseError, ensureSchema, getSql } from '../lib/db.js';

const EVENT_TEMPLATE = [
  { order: 1, offset: 0, type: 'GL', label: 'GL #1 · Tuesday', cap: 15 },
  { order: 2, offset: 2, type: 'GL', label: 'GL #2 · Thursday', cap: 15 },
  { order: 3, offset: 5, type: 'EO', label: 'EO #1 · Sunday', cap: 10 },
  { order: 4, offset: 7, type: 'GL', label: 'GL #3 · Tuesday', cap: 15 },
  { order: 5, offset: 9, type: 'GL', label: 'GL #4 · Thursday', cap: 15 },
  { order: 6, offset: 12, type: 'EO', label: 'EO #2 · Sunday', cap: 10 },
];

const CYCLE_STATUSES = new Set(['draft', 'open', 'locked', 'completed']);
const OUTCOMES = new Set(['pending', 'won', 'lost', 'missed']);

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

function pageSlots(position, amount) {
  if (!position || !amount) return [];
  const start = ((Number(position) - 1) * Number(amount)) + 1;
  const result = [];
  for (let i = 0; i < amount; i += 1) {
    const absolute = start + i;
    result.push({
      page: Math.floor((absolute - 1) / 4) + 1,
      slot: ((absolute - 1) % 4) + 1,
    });
  }
  return result;
}

function makeSlotMap(position, cycle) {
  return {
    fragment: pageSlots(position, Number(cycle.fragment_per_member || 3)),
    lightDark: pageSlots(position, Number(cycle.light_dark_per_member || 12)),
    timeSpace: pageSlots(position, Number(cycle.time_space_per_member || 15)),
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
  };
}

function assignmentJson(row) {
  return {
    id: Number(row.id),
    discordId: row.discord_id,
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

async function renumberEvent(sql, cycle, eventId, uid) {
  if (!eventId) return;
  const rows = await sql`
    SELECT id
    FROM bidding_cycle_assignments
    WHERE cycle_id = ${cycle.id}
      AND event_id = ${eventId}
      AND schedule_status = 'scheduled'
    ORDER BY COALESCE(bid_position, 9999), id
  `;
  for (let i = 0; i < rows.length; i += 1) {
    const position = i + 1;
    const map = JSON.stringify(makeSlotMap(position, cycle));
    await sql`
      UPDATE bidding_cycle_assignments
      SET bid_position = ${position},
          slot_map = ${map}::jsonb,
          updated_by = ${uid},
          updated_at = NOW()
      WHERE id = ${rows[i].id}
    `;
  }
}

async function getLatestCycle(sql, includeDraft) {
  const rows = includeDraft
    ? await sql`SELECT * FROM bidding_cycles ORDER BY start_date DESC, id DESC LIMIT 1`
    : await sql`SELECT * FROM bidding_cycles WHERE status <> 'draft' ORDER BY start_date DESC, id DESC LIMIT 1`;
  return rows[0] || null;
}

async function loadCycle(sql, cycleId, mineId) {
  const cycleRows = await sql`SELECT * FROM bidding_cycles WHERE id = ${cycleId} LIMIT 1`;
  const cycle = cycleRows[0];
  if (!cycle) return { cycle: null, events: [], assignments: [], shortages: [], summary: null };

  const eventRows = await sql`
    SELECT *
    FROM bidding_cycle_events
    WHERE cycle_id = ${cycleId}
    ORDER BY event_order
  `;

  const assignmentRows = mineId
    ? await sql`
        SELECT a.*, p.ign, p.job, p.guild_role, e.event_label, e.bidding_date
        FROM bidding_cycle_assignments a
        JOIN member_profiles p ON p.discord_id = a.discord_id
        LEFT JOIN bidding_cycle_events e ON e.id = a.event_id
        WHERE a.cycle_id = ${cycleId}
          AND a.discord_id = ${mineId}
        ORDER BY COALESCE(a.event_order, 999), COALESCE(a.bid_position, 999)
      `
    : await sql`
        SELECT a.*, p.ign, p.job, p.guild_role, e.event_label, e.bidding_date
        FROM bidding_cycle_assignments a
        JOIN member_profiles p ON p.discord_id = a.discord_id
        LEFT JOIN bidding_cycle_events e ON e.id = a.event_id
        WHERE a.cycle_id = ${cycleId}
        ORDER BY COALESCE(a.event_order, 999), COALESCE(a.bid_position, 999), LOWER(p.ign)
      `;

  const events = eventRows.map(eventJson);
  const assignments = assignmentRows.map(assignmentJson);
  const shortages = [];

  for (const event of events) {
    const members = assignments.filter(function (a) {
      return a.eventId === event.id && a.scheduleStatus === 'scheduled';
    });
    if (members.length <= event.effectiveCapacity) continue;

    const needed = members.length - event.effectiveCapacity;
    const candidates = members
      .filter(function (a) { return !a.locked; })
      .sort(function (a, b) {
        if (a.fairnessScore !== b.fairnessScore) return a.fairnessScore - b.fairnessScore;
        return Number(b.bidPosition || 0) - Number(a.bidPosition || 0);
      });

    for (let i = 0; i < needed && i < candidates.length; i += 1) {
      const candidate = candidates[i];
      let target = null;
      for (const possible of events) {
        if (possible.order <= event.order) continue;
        const used = assignments.filter(function (a) {
          return a.eventId === possible.id && a.scheduleStatus === 'scheduled';
        }).length;
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
      scheduled: assignments.filter(function (a) { return a.scheduleStatus === 'scheduled'; }).length,
      needsReschedule: assignments.filter(function (a) { return a.scheduleStatus === 'needs_reschedule'; }).length,
      totalAssignments: assignments.length,
      totalCapacity: events.reduce(function (sum, e) { return sum + e.effectiveCapacity; }, 0),
      baseCapacity: events.reduce(function (sum, e) { return sum + e.baseCapacity; }, 0),
    },
  };
}

async function saveAction(sql, cycleId, type, payload, uid) {
  const json = JSON.stringify(payload || {});
  await sql`
    INSERT INTO bidding_cycle_actions (cycle_id, action_type, payload, created_by)
    VALUES (${cycleId}, ${type}, ${json}::jsonb, ${uid})
  `;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    await ensureSchema();
    const sql = getSql();

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const manage = url.searchParams.get('manage') === '1';
      const mine = url.searchParams.get('mine') === '1';
      const session = manage ? requireStaff(req, res) : requireSession(req, res);
      if (!session) return;

      const requestedId = Number(url.searchParams.get('cycleId') || 0);
      let cycle = null;
      if (requestedId) {
        const rows = await sql`SELECT * FROM bidding_cycles WHERE id = ${requestedId} LIMIT 1`;
        cycle = rows[0] || null;
        if (cycle && cycle.status === 'draft' && !manage) cycle = null;
      } else {
        cycle = await getLatestCycle(sql, manage);
      }

      if (!cycle) {
        return res.status(200).json({ cycle: null, events: [], assignments: [], shortages: [], summary: null });
      }

      const data = await loadCycle(sql, cycle.id, mine ? session.uid : null);

      if (manage) {
        const roster = await sql`
          SELECT discord_id, ign, job, guild_role
          FROM member_profiles
          ORDER BY LOWER(ign), ign
        `;
        data.roster = roster.map(function (row) {
          return {
            discordId: row.discord_id,
            ign: row.ign,
            job: row.job,
            guildRole: row.guild_role,
          };
        });

        const rouletteRows = await sql`
          SELECT r.*, p.ign, p.job
          FROM bidding_roulette_results r
          JOIN member_profiles p ON p.discord_id = r.discord_id
          WHERE r.cycle_id = ${cycle.id}
          ORDER BY r.created_at DESC
          LIMIT 20
        `;
        data.rouletteHistory = rouletteRows.map(function (row) {
          return {
            id: Number(row.id),
            discordId: row.discord_id,
            ign: row.ign,
            job: row.job,
            category: row.category,
            eventId: row.event_id ? Number(row.event_id) : null,
            poolScope: row.pool_scope,
            createdAt: row.created_at,
          };
        });
      }

      return res.status(200).json(data);
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const session = requireStaff(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;

    const body = readBody(req);
    if (!body) return res.status(400).json({ error: 'invalid_json' });
    const action = String(body.action || '');

    if (action === 'create_cycle') {
      const startDate = String(body.startDate || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ error: 'invalid_date', message: 'Choose the Tuesday that starts this two-week cycle.' });
      }

      const fragment = Math.max(1, intValue(body.fragmentPerMember, 3));
      const lightDark = Math.max(1, intValue(body.lightDarkPerMember, 12));
      const timeSpace = Math.max(1, intValue(body.timeSpacePerMember, 15));
      const endDate = plusDays(startDate, 12);

      const rows = await sql`
        INSERT INTO bidding_cycles (
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
        const fragmentStock = item.cap * fragment;
        const lightDarkStock = item.cap * lightDark;
        const timeSpaceStock = item.cap * timeSpace;
        await sql`
          INSERT INTO bidding_cycle_events (
            cycle_id, event_order, event_type, event_label, bidding_date, base_capacity,
            fragment_stock, light_dark_stock, time_space_stock, effective_capacity
          ) VALUES (
            ${cycle.id}, ${item.order}, ${item.type}, ${item.label}, ${plusDays(startDate, item.offset)},
            ${item.cap}, ${fragmentStock}, ${lightDarkStock}, ${timeSpaceStock}, ${item.cap}
          )
        `;
      }

      await saveAction(sql, cycle.id, 'create_cycle', { startDate, fragment, lightDark, timeSpace }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycle.id, null));
    }

    const cycleId = Number(body.cycleId || 0);
    if (!cycleId) return res.status(400).json({ error: 'invalid_cycle' });

    const cycleRows = await sql`SELECT * FROM bidding_cycles WHERE id = ${cycleId} LIMIT 1`;
    const cycle = cycleRows[0];
    if (!cycle) return res.status(404).json({ error: 'cycle_not_found' });

    if (action === 'update_limits') {
      if (cycle.status === 'completed') return res.status(409).json({ error: 'cycle_completed' });

      const fragment = Math.max(1, intValue(body.fragmentPerMember, Number(cycle.fragment_per_member)));
      const lightDark = Math.max(1, intValue(body.lightDarkPerMember, Number(cycle.light_dark_per_member)));
      const timeSpace = Math.max(1, intValue(body.timeSpacePerMember, Number(cycle.time_space_per_member)));

      await sql`
        UPDATE bidding_cycles
        SET fragment_per_member = ${fragment},
            light_dark_per_member = ${lightDark},
            time_space_per_member = ${timeSpace},
            updated_at = NOW()
        WHERE id = ${cycleId}
      `;

      const updatedCycle = {
        ...cycle,
        fragment_per_member: fragment,
        light_dark_per_member: lightDark,
        time_space_per_member: timeSpace,
      };

      const events = await sql`SELECT * FROM bidding_cycle_events WHERE cycle_id = ${cycleId}`;
      for (const event of events) {
        const cap = eventCapacity(event, updatedCycle);
        await sql`
          UPDATE bidding_cycle_events
          SET effective_capacity = ${cap}, updated_at = NOW()
          WHERE id = ${event.id}
        `;
        await renumberEvent(sql, updatedCycle, event.id, session.uid);
      }

      await saveAction(sql, cycleId, 'update_limits', { fragment, lightDark, timeSpace }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'update_event_stock') {
      if (cycle.status === 'completed') return res.status(409).json({ error: 'cycle_completed' });

      const eventId = Number(body.eventId || 0);
      const eventRows = await sql`
        SELECT *
        FROM bidding_cycle_events
        WHERE id = ${eventId} AND cycle_id = ${cycleId}
        LIMIT 1
      `;
      const event = eventRows[0];
      if (!event) return res.status(404).json({ error: 'event_not_found' });

      const fragment = intValue(body.fragmentStock, 0);
      const lightDark = intValue(body.lightDarkStock, 0);
      const timeSpace = intValue(body.timeSpaceStock, 0);
      const next = {
        ...event,
        fragment_stock: fragment,
        light_dark_stock: lightDark,
        time_space_stock: timeSpace,
      };
      const cap = eventCapacity(next, cycle);

      await sql`
        UPDATE bidding_cycle_events
        SET fragment_stock = ${fragment},
            light_dark_stock = ${lightDark},
            time_space_stock = ${timeSpace},
            effective_capacity = ${cap},
            updated_at = NOW()
        WHERE id = ${eventId}
      `;

      await saveAction(sql, cycleId, 'update_stock', { eventId, fragment, lightDark, timeSpace, effectiveCapacity: cap }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'randomize') {
      if (cycle.status === 'locked' || cycle.status === 'completed') {
        return res.status(409).json({ error: 'cycle_locked', message: 'Change the cycle back to Draft or Open before randomizing.' });
      }

      const snapshot = await sql`
        SELECT discord_id, event_id, event_order, bid_position, schedule_status,
               outcome_status, locked, fairness_score, slot_map, note
        FROM bidding_cycle_assignments
        WHERE cycle_id = ${cycleId}
        ORDER BY id
      `;

      const events = await sql`
        SELECT *
        FROM bidding_cycle_events
        WHERE cycle_id = ${cycleId}
        ORDER BY event_order
      `;
      const roster = await sql`SELECT discord_id FROM member_profiles ORDER BY discord_id`;
      const lockedRows = await sql`
        SELECT *
        FROM bidding_cycle_assignments
        WHERE cycle_id = ${cycleId}
          AND locked = TRUE
          AND event_id IS NOT NULL
      `;
      const lockedIds = new Set(lockedRows.map(function (row) { return row.discord_id; }));

      await sql`
        DELETE FROM bidding_cycle_assignments
        WHERE cycle_id = ${cycleId} AND locked = FALSE
      `;

      const previousRows = await sql`
        SELECT a.discord_id, a.event_order, a.bid_position, c.start_date
        FROM bidding_cycle_assignments a
        JOIN bidding_cycles c ON c.id = a.cycle_id
        WHERE a.cycle_id <> ${cycleId}
          AND c.start_date < ${cycle.start_date}
          AND a.schedule_status = 'scheduled'
        ORDER BY c.start_date DESC, c.id DESC
      `;
      const previous = new Map();
      for (const row of previousRows) {
        if (!previous.has(row.discord_id)) {
          previous.set(row.discord_id, (Number(row.event_order || 0) * 100) + Number(row.bid_position || 0));
        }
      }

      const available = roster
        .filter(function (member) { return !lockedIds.has(member.discord_id); })
        .map(function (member) {
          return {
            discordId: member.discord_id,
            fairness: previous.has(member.discord_id) ? previous.get(member.discord_id) : 350,
            random: Math.random(),
          };
        })
        .sort(function (a, b) {
          if (a.fairness !== b.fairness) return b.fairness - a.fairness;
          return a.random - b.random;
        });

      const buckets = new Map();
      for (const event of events) buckets.set(Number(event.id), []);
      for (const locked of lockedRows) {
        const bucket = buckets.get(Number(locked.event_id));
        if (bucket) {
          bucket.push({
            discordId: locked.discord_id,
            fairness: Number(locked.fairness_score || 999),
            locked: true,
          });
        }
      }

      let cursor = 0;
      for (const event of events) {
        const bucket = buckets.get(Number(event.id)) || [];
        const remaining = Math.max(0, Number(event.effective_capacity) - bucket.length);
        for (let i = 0; i < remaining && cursor < available.length; i += 1) {
          bucket.push(available[cursor]);
          cursor += 1;
        }
        buckets.set(Number(event.id), bucket);
      }

      for (const event of events) {
        const bucket = buckets.get(Number(event.id)) || [];
        for (let i = 0; i < bucket.length; i += 1) {
          const member = bucket[i];
          const position = i + 1;
          const slotMap = JSON.stringify(makeSlotMap(position, cycle));

          await sql`
            INSERT INTO bidding_cycle_assignments (
              cycle_id, event_id, discord_id, event_order, bid_position,
              schedule_status, outcome_status, locked, fairness_score, slot_map, updated_by
            ) VALUES (
              ${cycleId}, ${event.id}, ${member.discordId}, ${event.event_order}, ${position},
              'scheduled', 'pending', ${Boolean(member.locked)}, ${member.fairness}, ${slotMap}::jsonb, ${session.uid}
            )
            ON CONFLICT (cycle_id, discord_id) DO UPDATE SET
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
        const member = available[cursor];
        cursor += 1;
        await sql`
          INSERT INTO bidding_cycle_assignments (
            cycle_id, event_id, discord_id, event_order, bid_position,
            schedule_status, outcome_status, locked, fairness_score, slot_map, updated_by
          ) VALUES (
            ${cycleId}, NULL, ${member.discordId}, NULL, NULL,
            'needs_reschedule', 'pending', FALSE, ${member.fairness}, '{}'::jsonb, ${session.uid}
          )
          ON CONFLICT (cycle_id, discord_id) DO UPDATE SET
            event_id = NULL,
            event_order = NULL,
            bid_position = NULL,
            schedule_status = 'needs_reschedule',
            outcome_status = 'pending',
            locked = FALSE,
            fairness_score = EXCLUDED.fairness_score,
            slot_map = '{}'::jsonb,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `;
      }

      await saveAction(sql, cycleId, 'randomize', { before: snapshot }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'undo_randomize') {
      if (cycle.status === 'locked' || cycle.status === 'completed') {
        return res.status(409).json({ error: 'cycle_locked' });
      }

      const actions = await sql`
        SELECT payload
        FROM bidding_cycle_actions
        WHERE cycle_id = ${cycleId}
          AND action_type = 'randomize'
        ORDER BY id DESC
        LIMIT 1
      `;
      const before = actions[0] && actions[0].payload ? actions[0].payload.before : null;
      if (!Array.isArray(before)) {
        return res.status(409).json({ error: 'nothing_to_undo', message: 'No randomization snapshot is available.' });
      }

      await sql`DELETE FROM bidding_cycle_assignments WHERE cycle_id = ${cycleId}`;
      for (const row of before) {
        const map = JSON.stringify(row.slot_map || {});
        await sql`
          INSERT INTO bidding_cycle_assignments (
            cycle_id, event_id, discord_id, event_order, bid_position,
            schedule_status, outcome_status, locked, fairness_score, slot_map, note, updated_by
          ) VALUES (
            ${cycleId}, ${row.event_id}, ${row.discord_id}, ${row.event_order}, ${row.bid_position},
            ${row.schedule_status}, ${row.outcome_status}, ${Boolean(row.locked)},
            ${Number(row.fairness_score || 0)}, ${map}::jsonb, ${row.note || null}, ${session.uid}
          )
        `;
      }

      await saveAction(sql, cycleId, 'undo_randomize', {}, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'move') {
      if (cycle.status === 'completed') return res.status(409).json({ error: 'cycle_completed' });

      const discordId = String(body.discordId || '');
      const targetId = body.eventId === null || body.eventId === '' ? null : Number(body.eventId);
      const currentRows = await sql`
        SELECT *
        FROM bidding_cycle_assignments
        WHERE cycle_id = ${cycleId} AND discord_id = ${discordId}
        LIMIT 1
      `;
      const current = currentRows[0];
      if (!current) return res.status(404).json({ error: 'assignment_not_found' });

      const oldEventId = current.event_id ? Number(current.event_id) : null;

      if (targetId) {
        const eventRows = await sql`
          SELECT *
          FROM bidding_cycle_events
          WHERE id = ${targetId} AND cycle_id = ${cycleId}
          LIMIT 1
        `;
        const target = eventRows[0];
        if (!target) return res.status(404).json({ error: 'event_not_found' });

        const countRows = await sql`
          SELECT COUNT(*)::int AS count
          FROM bidding_cycle_assignments
          WHERE cycle_id = ${cycleId}
            AND event_id = ${targetId}
            AND schedule_status = 'scheduled'
            AND discord_id <> ${discordId}
        `;
        if (Number(countRows[0].count || 0) >= Number(target.effective_capacity)) {
          return res.status(409).json({ error: 'event_full', message: 'That event has no complete equal-allocation package available.' });
        }

        await sql`
          UPDATE bidding_cycle_assignments
          SET event_id = ${targetId},
              event_order = ${target.event_order},
              bid_position = 999,
              schedule_status = 'scheduled',
              slot_map = '{}'::jsonb,
              updated_by = ${session.uid},
              updated_at = NOW()
          WHERE cycle_id = ${cycleId} AND discord_id = ${discordId}
        `;
      } else {
        await sql`
          UPDATE bidding_cycle_assignments
          SET event_id = NULL,
              event_order = NULL,
              bid_position = NULL,
              schedule_status = 'needs_reschedule',
              slot_map = '{}'::jsonb,
              updated_by = ${session.uid},
              updated_at = NOW()
          WHERE cycle_id = ${cycleId} AND discord_id = ${discordId}
        `;
      }

      if (oldEventId) await renumberEvent(sql, cycle, oldEventId, session.uid);
      if (targetId) await renumberEvent(sql, cycle, targetId, session.uid);

      await saveAction(sql, cycleId, 'move', { discordId, fromEventId: oldEventId, toEventId: targetId }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'swap') {
      if (cycle.status === 'completed') return res.status(409).json({ error: 'cycle_completed' });

      const firstId = String(body.a || '');
      const secondId = String(body.b || '');
      if (!firstId || !secondId || firstId === secondId) {
        return res.status(400).json({ error: 'invalid_swap', message: 'Choose two different members.' });
      }

      const rows = await sql`
        SELECT *
        FROM bidding_cycle_assignments
        WHERE cycle_id = ${cycleId}
          AND discord_id IN (${firstId}, ${secondId})
      `;
      if (rows.length !== 2) return res.status(404).json({ error: 'assignment_not_found' });

      const first = rows.find(function (row) { return row.discord_id === firstId; });
      const second = rows.find(function (row) { return row.discord_id === secondId; });

      await sql`
        UPDATE bidding_cycle_assignments
        SET event_id = ${second.event_id},
            event_order = ${second.event_order},
            bid_position = ${second.bid_position},
            schedule_status = ${second.schedule_status},
            slot_map = ${JSON.stringify(second.slot_map || {})}::jsonb,
            updated_by = ${session.uid},
            updated_at = NOW()
        WHERE cycle_id = ${cycleId} AND discord_id = ${firstId}
      `;
      await sql`
        UPDATE bidding_cycle_assignments
        SET event_id = ${first.event_id},
            event_order = ${first.event_order},
            bid_position = ${first.bid_position},
            schedule_status = ${first.schedule_status},
            slot_map = ${JSON.stringify(first.slot_map || {})}::jsonb,
            updated_by = ${session.uid},
            updated_at = NOW()
        WHERE cycle_id = ${cycleId} AND discord_id = ${secondId}
      `;

      if (first.event_id) await renumberEvent(sql, cycle, Number(first.event_id), session.uid);
      if (second.event_id && Number(second.event_id) !== Number(first.event_id)) {
        await renumberEvent(sql, cycle, Number(second.event_id), session.uid);
      }

      await saveAction(sql, cycleId, 'swap', { a: firstId, b: secondId }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'set_lock') {
      if (cycle.status === 'completed') return res.status(409).json({ error: 'cycle_completed' });

      const discordId = String(body.discordId || '');
      const locked = Boolean(body.locked);
      await sql`
        UPDATE bidding_cycle_assignments
        SET locked = ${locked}, updated_by = ${session.uid}, updated_at = NOW()
        WHERE cycle_id = ${cycleId} AND discord_id = ${discordId}
      `;

      await saveAction(sql, cycleId, 'set_lock', { discordId, locked }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'set_outcome') {
      const discordId = String(body.discordId || '');
      const outcome = String(body.outcome || 'pending');
      if (!OUTCOMES.has(outcome)) return res.status(400).json({ error: 'invalid_outcome' });

      await sql`
        UPDATE bidding_cycle_assignments
        SET outcome_status = ${outcome}, updated_by = ${session.uid}, updated_at = NOW()
        WHERE cycle_id = ${cycleId} AND discord_id = ${discordId}
      `;

      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'set_status') {
      const nextStatus = String(body.status || '');
      if (!CYCLE_STATUSES.has(nextStatus)) {
        return res.status(400).json({ error: 'invalid_status' });
      }

      await sql`
        UPDATE bidding_cycles
        SET status = ${nextStatus}, updated_at = NOW()
        WHERE id = ${cycleId}
      `;

      await saveAction(sql, cycleId, 'set_status', { status: nextStatus }, session.uid);
      return res.status(200).json(await loadCycle(sql, cycleId, null));
    }

    if (action === 'roulette') {
      const scope = String(body.scope || 'all');
      const eventId = body.eventId ? Number(body.eventId) : null;
      const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds.map(String) : [];

      let roster = await sql`
        SELECT discord_id, ign, job
        FROM member_profiles
        ORDER BY LOWER(ign), ign
      `;

      if (scope === 'selected') {
        roster = roster.filter(function (member) { return selectedIds.includes(member.discord_id); });
      }

      if (scope === 'event' && eventId) {
        const assigned = await sql`
          SELECT discord_id
          FROM bidding_cycle_assignments
          WHERE cycle_id = ${cycleId}
            AND event_id = ${eventId}
            AND schedule_status = 'scheduled'
        `;
        const allowed = new Set(assigned.map(function (row) { return row.discord_id; }));
        roster = roster.filter(function (member) { return allowed.has(member.discord_id); });
      }

      if (body.excludeWinners !== false) {
        const winners = await sql`
          SELECT discord_id
          FROM bidding_roulette_results
          WHERE cycle_id = ${cycleId}
        `;
        const excluded = new Set(winners.map(function (row) { return row.discord_id; }));
        roster = roster.filter(function (member) { return !excluded.has(member.discord_id); });
      }

      if (body.excludeAssignedEvent && eventId) {
        const assigned = await sql`
          SELECT discord_id
          FROM bidding_cycle_assignments
          WHERE cycle_id = ${cycleId}
            AND event_id = ${eventId}
            AND schedule_status = 'scheduled'
        `;
        const excluded = new Set(assigned.map(function (row) { return row.discord_id; }));
        roster = roster.filter(function (member) { return !excluded.has(member.discord_id); });
      }

      if (!roster.length) {
        return res.status(409).json({ error: 'empty_pool', message: 'No eligible members remain in this roulette pool.' });
      }

      const winner = roster[Math.floor(Math.random() * roster.length)];
      const category = String(body.category || 'Extra / Excess');

      await sql`
        INSERT INTO bidding_roulette_results (
          cycle_id, event_id, category, discord_id, pool_scope, created_by
        ) VALUES (
          ${cycleId}, ${eventId}, ${category}, ${winner.discord_id}, ${scope}, ${session.uid}
        )
      `;

      await saveAction(sql, cycleId, 'roulette', { scope, eventId, category, winner: winner.discord_id }, session.uid);

      const data = await loadCycle(sql, cycleId, null);
      data.winner = { discordId: winner.discord_id, ign: winner.ign, job: winner.job };
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'unknown_action' });
  } catch (error) {
    return databaseError(res, error);
  }
}
