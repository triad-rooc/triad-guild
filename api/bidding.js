import { requireCouncil, requireSameOrigin, requireSession } from '../lib/api-auth.js';
import { databaseError, ensureSchema, getSql } from '../lib/db.js';

const CATEGORIES = [
  'Illusion Card Fragment',
  'Light & Dark Feathers',
  'Time & Space Feathers',
];

const EVENTS = {
  tuesday_gl: { label: 'Tuesday · Guild League', shortLabel: 'Tuesday GL', day: 2 },
  thursday_gl: { label: 'Thursday · Guild League', shortLabel: 'Thursday GL', day: 4 },
  sunday_eo: { label: 'Sunday · Emperium Overrun', shortLabel: 'Sunday EO', day: 0 },
};

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function serialize(row) {
  if (!row) return null;
  return {
    discordId: row.discord_id,
    ign: row.ign,
    job: row.job,
    category: row.category,
    page: Number(row.page_number),
    slot: Number(row.slot_number),
    eventKey: row.event_key,
    eventLabel: EVENTS[row.event_key]?.label || row.event_key,
    eventShortLabel: EVENTS[row.event_key]?.shortLabel || row.event_key,
    biddingDate: row.bidding_date,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    await ensureSchema();
    const sql = getSql();

    if (req.method === 'GET') {
      const session = requireSession(req, res);
      if (!session) return;

      const url = new URL(req.url, 'http://localhost');
      const mine = url.searchParams.get('mine') === '1';

      const rows = mine
        ? await sql`
            SELECT b.*, p.ign, p.job
            FROM bidding_assignments b
            JOIN member_profiles p ON p.discord_id = b.discord_id
            WHERE b.discord_id = ${session.uid}
            LIMIT 1
          `
        : await sql`
            SELECT b.*, p.ign, p.job
            FROM bidding_assignments b
            JOIN member_profiles p ON p.discord_id = b.discord_id
            ORDER BY b.bidding_date ASC, LOWER(p.ign), p.ign
          `;

      return res.status(200).json({
        assignments: rows.map(serialize),
        categories: CATEGORIES,
        events: EVENTS,
      });
    }

    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const session = requireCouncil(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;

    const body = readBody(req);
    if (!body) return res.status(400).json({ error: 'invalid_json' });

    const discordId = String(body.discordId || '').trim();
    if (!discordId) return res.status(400).json({ error: 'invalid_member' });

    if (body.clear === true) {
      await sql`DELETE FROM bidding_assignments WHERE discord_id = ${discordId}`;
      return res.status(200).json({ saved: true, assignment: null });
    }

    const category = String(body.category || '').trim();
    const eventKey = String(body.eventKey || '').trim();
    const biddingDate = String(body.biddingDate || '').trim();
    const page = Number(body.page);
    const slot = Number(body.slot);

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'invalid_category', message: 'Choose a valid bidding category.' });
    }
    if (!EVENTS[eventKey]) {
      return res.status(400).json({ error: 'invalid_event', message: 'Choose a valid guild event.' });
    }
    if (!Number.isInteger(page) || page < 1 || page > 999) {
      return res.status(400).json({ error: 'invalid_page', message: 'Page must be a whole number from 1 to 999.' });
    }
    if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
      return res.status(400).json({ error: 'invalid_slot', message: 'Slot must be between 1 and 4.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(biddingDate)) {
      return res.status(400).json({ error: 'invalid_date', message: 'Choose a valid bidding date.' });
    }

    const member = await sql`
      SELECT discord_id
      FROM member_profiles
      WHERE discord_id = ${discordId}
      LIMIT 1
    `;
    if (!member[0]) return res.status(404).json({ error: 'member_not_found' });

    const rows = await sql`
      INSERT INTO bidding_assignments (
        discord_id, category, page_number, slot_number, event_key, bidding_date, updated_by, updated_at
      ) VALUES (
        ${discordId}, ${category}, ${page}, ${slot}, ${eventKey}, ${biddingDate}, ${session.uid}, NOW()
      )
      ON CONFLICT (discord_id) DO UPDATE SET
        category = EXCLUDED.category,
        page_number = EXCLUDED.page_number,
        slot_number = EXCLUDED.slot_number,
        event_key = EXCLUDED.event_key,
        bidding_date = EXCLUDED.bidding_date,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `;

    const profile = await sql`
      SELECT ign, job
      FROM member_profiles
      WHERE discord_id = ${discordId}
      LIMIT 1
    `;

    return res.status(200).json({
      saved: true,
      assignment: serialize({ ...rows[0], ...profile[0] }),
    });
  } catch (error) {
    return databaseError(res, error);
  }
}
