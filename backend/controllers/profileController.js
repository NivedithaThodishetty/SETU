/**
 * The agent's saved-details profile.
 *
 *   GET    /api/profile   what the agent fills forms from
 *   POST   /api/profile   save or update it
 *   DELETE /api/profile   wipe it
 *
 * The agent asks for this once on boot and caches it in `chrome.storage.local`,
 * so the actual form-filling still happens against a local copy and still
 * substitutes `{{profile.pincode}}` inside the page. The engine's job here is
 * only to be the place the profile lives so it survives a reinstall and reaches
 * a second machine — it never puts a value into a prompt.
 */

const AgentProfile = require('../models/AgentProfile');
const { isDbActive } = require('../services/mongodbService');

function userIdFrom(req) {
  return req.headers['x-user-id'] || req.body?.userId || req.query?.userId || 'anonymous_user';
}

/**
 * Keys the server will not store, whatever it is sent.
 *
 * This is the one piece of the catalogue duplicated here rather than read from
 * the extension, and it is duplicated deliberately: it is a safety floor, and a
 * floor that depends on the client sending the right thing is not a floor. A
 * caller that has been tampered with, or a future client that forgets, still
 * cannot put a government ID or a bank account into this collection.
 *
 * Kept in step with `sensitive: true` in shared/setu-profile.js.
 */
const NEVER_STORED = new Set([
  'aadhaar',
  'pan',
  'passport',
  'voterId',
  'drivingLicence',
  'abhaId',
  'udid',
  'gstin',
  'bankName',
  'bankAccount',
  'ifsc',
  'upiId',
  'disabilityStatus'
]);

/** Longest value we will accept for any one field. */
const MAX_VALUE_LENGTH = 500;

/**
 * Accept only a flat map of short scalars.
 *
 * The catalogue is the client's business, but the *shape* is not: this endpoint
 * takes whatever keys the extension knows about, so it cannot validate names —
 * which makes it all the more important that it validates types and sizes, or
 * `values` becomes an unbounded document anyone can write anything into.
 */
function sanitiseValues(input) {
  const values = {};
  const rejected = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) return { values, rejected };

  for (const [key, raw] of Object.entries(input)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,48}$/.test(key)) {
      rejected.push(key);
      continue;
    }
    if (NEVER_STORED.has(key)) {
      rejected.push(key);
      continue;
    }
    if (raw === null || raw === undefined || raw === '') {
      values[key] = '';
      continue;
    }
    if (typeof raw === 'boolean' || typeof raw === 'number') {
      values[key] = raw;
      continue;
    }
    if (typeof raw !== 'string') {
      rejected.push(key);
      continue;
    }
    values[key] = raw.slice(0, MAX_VALUE_LENGTH);
  }

  return { values, rejected };
}

async function handleGetProfile(req, res, next) {
  try {
    if (!isDbActive()) {
      return res.json({ profile: null, dbConnected: false });
    }

    const doc = await AgentProfile.findOne({ userId: userIdFrom(req) }).lean();

    res.json({
      profile: doc ? doc.values : null,
      schemaVersion: doc?.schemaVersion ?? null,
      isDemo: doc?.isDemo ?? false,
      label: doc?.label || '',
      updatedAt: doc?.updatedAt || null,
      dbConnected: true,
      /*
       * Stated on every read so a client cannot conclude from an absent Aadhaar
       * that the user simply has not entered one. The server refuses to hold
       * these; they are entered in the extension when a form genuinely needs
       * them and never leave the device.
       */
      neverStored: [...NEVER_STORED]
    });
  } catch (error) {
    next(error);
  }
}

async function handleSaveProfile(req, res, next) {
  try {
    if (!isDbActive()) {
      return res.status(503).json({
        error: 'No database connection — the profile could not be saved.',
        dbConnected: false
      });
    }

    const { values, rejected } = sanitiseValues(req.body?.values ?? req.body?.profile ?? req.body);

    if (!Object.keys(values).length) {
      return res.status(400).json({ error: 'No storable profile values were provided.' });
    }

    const userId = userIdFrom(req);
    const existing = await AgentProfile.findOne({ userId }).lean();

    /*
     * Merged, not replaced. The extension may hold keys this server has never
     * seen — a field added in a newer build — and a wholesale replace on every
     * save would delete them on the first write from an older client.
     */
    const merged = { ...(existing?.values || {}), ...values };

    const saved = await AgentProfile.findOneAndUpdate(
      { userId },
      {
        userId,
        values: merged,
        schemaVersion: Number(req.body?.schemaVersion) || existing?.schemaVersion || 1,
        isDemo: req.body?.isDemo ?? existing?.isDemo ?? false,
        label: String(req.body?.label ?? existing?.label ?? '').slice(0, 120),
        updatedAt: new Date()
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();

    res.json({
      success: true,
      profile: saved.values,
      fieldsStored: Object.keys(saved.values).length,
      // Named back to the caller so a client writing a sensitive key learns that
      // it was dropped, rather than assuming it round-tripped.
      rejected,
      neverStored: [...NEVER_STORED]
    });
  } catch (error) {
    next(error);
  }
}

async function handleDeleteProfile(req, res, next) {
  try {
    if (!isDbActive()) return res.json({ success: false, dbConnected: false });
    const result = await AgentProfile.deleteOne({ userId: userIdFrom(req) });
    res.json({ success: result.deletedCount > 0 });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  handleGetProfile,
  handleSaveProfile,
  handleDeleteProfile,
  sanitiseValues,
  NEVER_STORED
};
