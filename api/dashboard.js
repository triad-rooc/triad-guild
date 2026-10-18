import { requireSession } from '../lib/api-auth.js';
import { databaseError, ensureSchema, getSql } from '../lib/db.js';

function safeStatus(value) {
  return ['unverified', 'pending', 'verified', 'update_required'].includes(value)
    ? value
    : 'unverified';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;

  try {
    await ensureSchema();
    const sql = getSql();

    const [memberCountRows, profileRows, pendingRows, cycleRows] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM member_profiles`,
      sql`
        SELECT verification_status, updated_at
        FROM member_profiles
        WHERE discord_id = ${session.uid}
        LIMIT 1
      `,
      ['Council', 'Officer'].includes(session.role)
        ? sql`SELECT COUNT(*)::int AS count FROM member_profiles WHERE verification_status = 'pending'`
        : Promise.resolve([{ count: 0 }]),
      sql`
        SELECT *
        FROM bidding_cycles
        WHERE status <> 'draft'
        ORDER BY start_date DESC, id DESC
        LIMIT 1
      `,
    ]);

    const cycle = cycleRows[0] || null;
    let myBidding = null;
    let cycleSummary = null;

    if (cycle) {
      const [assignmentRows, summaryRows] = await Promise.all([
        sql`
          SELECT a.schedule_status, a.bid_position, e.event_label, e.bidding_date
          FROM bidding_cycle_assignments a
          LEFT JOIN bidding_cycle_events e ON e.id = a.event_id
          WHERE a.cycle_id = ${cycle.id}
            AND a.discord_id = ${session.uid}
          LIMIT 1
        `,
        sql`
          SELECT
            COUNT(*) FILTER (WHERE schedule_status = 'scheduled')::int AS scheduled,
            COUNT(*) FILTER (WHERE schedule_status = 'needs_reschedule')::int AS needs_reschedule
          FROM bidding_cycle_assignments
          WHERE cycle_id = ${cycle.id}
        `,
      ]);

      const assignment = assignmentRows[0] || null;
      if (assignment) {
        myBidding = {
          scheduleStatus: assignment.schedule_status,
          bidPosition: assignment.bid_position === null ? null : Number(assignment.bid_position),
          eventLabel: assignment.event_label || null,
          biddingDate: assignment.bidding_date || null,
        };
      }

      cycleSummary = {
        id: Number(cycle.id),
        status: cycle.status,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        scheduled: Number(summaryRows[0]?.scheduled || 0),
        needsReschedule: Number(summaryRows[0]?.needs_reschedule || 0),
      };
    }

    return res.status(200).json({
      role: session.role,
      memberCount: Number(memberCountRows[0]?.count || 0),
      pendingVerificationCount: Number(pendingRows[0]?.count || 0),
      profile: {
        verificationStatus: safeStatus(profileRows[0]?.verification_status),
        updatedAt: profileRows[0]?.updated_at || null,
      },
      myBidding,
      cycle: cycleSummary,
    });
  } catch (error) {
    return databaseError(res, error);
  }
}
