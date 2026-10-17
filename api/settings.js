import { requireCouncil, requireSameOrigin, requireSession } from '../lib/api-auth.js';
import {
  DEFAULT_GUILD_SETTINGS,
  databaseError,
  getGuildSettings,
  saveGuildSettings,
} from '../lib/db.js';

const roleKeys = ['dps', 'sniper', 'support'];
const metricKeys = ['pdef', 'mdef', 'pdamageReduction', 'mdamageReduction'];

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function validateTriplet(value, defaultValue) {
  if (!value || typeof value !== 'object') return null;

  const redMax = Number(value.redMax);
  const midStart = Number(value.midStart);
  const greenStart = Number(value.greenStart);

  if (![redMax, midStart, greenStart].every(Number.isInteger)) return null;
  if (redMax < 0 || midStart < 0 || greenStart < 0) return null;
  if (!(redMax < midStart && midStart < greenStart)) return null;

  return {
    redMax,
    midStart,
    greenStart,
    midColor: defaultValue.midColor,
  };
}

function validateSettings(value) {
  if (!value || typeof value !== 'object') return null;

  const next = {
    thresholds: {},
    freshness: {},
  };

  for (const role of roleKeys) {
    next.thresholds[role] = {};
    for (const metric of metricKeys) {
      const validated = validateTriplet(
        value.thresholds?.[role]?.[metric],
        DEFAULT_GUILD_SETTINGS.thresholds[role][metric]
      );
      if (!validated) return null;
      next.thresholds[role][metric] = validated;
    }
  }

  const orangeStartDays = Number(value.freshness?.orangeStartDays);
  const redStartDays = Number(value.freshness?.redStartDays);

  if (!Number.isInteger(orangeStartDays) || !Number.isInteger(redStartDays)) return null;
  if (orangeStartDays < 1 || redStartDays <= orangeStartDays) return null;

  next.freshness = { orangeStartDays, redStartDays };
  return next;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const session = requireSession(req, res);
      if (!session) return;

      return res.status(200).json({
        settings: await getGuildSettings(),
        defaults: DEFAULT_GUILD_SETTINGS,
        canEdit: session.role === 'Council',
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
    const validated = validateSettings(body?.settings);
    if (!validated) {
      return res.status(400).json({
        error: 'invalid_settings',
        message: 'Please check the threshold ranges. Red must be below Mid, and Mid must be below Green.',
      });
    }

    const settings = await saveGuildSettings(validated, session.uid);
    return res.status(200).json({ saved: true, settings });
  } catch (error) {
    return databaseError(res, error);
  }
}
