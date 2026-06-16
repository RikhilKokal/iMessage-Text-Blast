/**
 * phone-cache.js
 *
 * Tracks per-phone-number send capability so the sender can route to iMessage
 * or SMS without guessing. Backed by the same SQLite DB as the rest of the app.
 *
 * Routing rules
 * ─────────────
 *   • Unknown number  → try iMessage (optimistic default)
 *   • Known iMessage  → use iMessage
 *   • Known SMS       → use SMS directly (skip iMessage attempt)
 *   • 2+ consecutive iMessage failures → permanently switch to SMS
 *   • A successful SMS send locks the number as SMS so future sends are fast
 *   • A successful iMessage send resets failure count and locks as iMessage
 *
 * "Failure" here means the osascript process actually threw an error (non-zero
 * exit / stderr). Silent "Not Delivered" in the Messages UI can't be detected
 * programmatically — but many non-iMessage numbers DO produce real AppleScript
 * errors, and those are exactly what this cache catches.
 */

const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')

const DB_PATH = path.join(
  os.homedir(),
  'Library', 'Application Support', 'iMessage Bulk Scheduler', 'app.db'
)

const FAILURE_THRESHOLD = 2   // switch to SMS after this many consecutive failures
const RETRY_DAYS = 30          // re-try iMessage for SMS-flagged numbers after this many days

let _db = null

function db() {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS phone_capability (
      normalized_phone  TEXT PRIMARY KEY,
      method            TEXT NOT NULL DEFAULT 'iMessage'
                        CHECK(method IN ('iMessage', 'SMS')),
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_success_at   TIMESTAMP,
      last_failure_at   TIMESTAMP,
      updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  return _db
}

// ── Phone normalization (mirrors db/database.js) ──────────────────────────────

function normalizePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Decide which service to use for a phone number.
 * Returns 'iMessage' or 'SMS'.
 *
 * IMPORTANT: we only route to SMS when we have confirmed a *successful* SMS
 * delivery to this number (last_success_at is set AND method is SMS).
 * Pure failure records are NOT enough — that would poison the cache whenever
 * a script bug causes every send to throw, routing everything to SMS forever.
 */
function determineMethod(phone) {
  const np = normalizePhone(phone)
  const row = db().prepare(
    'SELECT method, last_success_at, last_failure_at FROM phone_capability WHERE normalized_phone = ?'
  ).get(np)

  if (!row) return 'iMessage'   // never seen before — try iMessage

  // Only trust an SMS routing decision if we've actually confirmed a successful
  // SMS send to this number. If method=SMS but last_success_at is null, the
  // number was marked SMS purely via failure records — fall back to iMessage.
  if (row.method === 'SMS') {
    if (!row.last_success_at) {
      console.log(`[PhoneCache] ${np}: method=SMS but no confirmed success — defaulting to iMessage`)
      return 'iMessage'
    }
    // Periodically retry iMessage in case they got an iPhone
    const daysSinceSuccess = (Date.now() - new Date(row.last_success_at).getTime()) / 86_400_000
    if (daysSinceSuccess > RETRY_DAYS) {
      console.log(`[PhoneCache] ${np}: re-trying iMessage after ${Math.floor(daysSinceSuccess)} days`)
      return 'iMessage'
    }
  }

  return row.method
}

/**
 * Record a successful send. Resets consecutive failures and locks the method.
 * @param {string} phone
 * @param {'iMessage'|'SMS'} method  — whichever service actually delivered
 */
function recordSuccess(phone, method) {
  const np = normalizePhone(phone)
  db().prepare(`
    INSERT INTO phone_capability
      (normalized_phone, method, consecutive_failures, last_success_at, updated_at)
    VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(normalized_phone) DO UPDATE SET
      method               = excluded.method,
      consecutive_failures = 0,
      last_success_at      = CURRENT_TIMESTAMP,
      updated_at           = CURRENT_TIMESTAMP
  `).run(np, method)
  console.log(`[PhoneCache] ${np}: recorded success via ${method}`)
}

/**
 * Record a failed iMessage send attempt.
 * Switches the number to SMS once FAILURE_THRESHOLD is reached.
 * Returns the updated row's method so the caller can decide whether to fall back.
 * @param {string} phone
 * @returns {{ method: 'iMessage'|'SMS', failures: number }}
 */
function recordFailure(phone) {
  const np = normalizePhone(phone)
  const existing = db().prepare(
    'SELECT consecutive_failures FROM phone_capability WHERE normalized_phone = ?'
  ).get(np)

  const failures = (existing?.consecutive_failures ?? 0) + 1
  const method   = failures >= FAILURE_THRESHOLD ? 'SMS' : 'iMessage'

  db().prepare(`
    INSERT INTO phone_capability
      (normalized_phone, method, consecutive_failures, last_failure_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(normalized_phone) DO UPDATE SET
      method               = excluded.method,
      consecutive_failures = excluded.consecutive_failures,
      last_failure_at      = CURRENT_TIMESTAMP,
      updated_at           = CURRENT_TIMESTAMP
  `).run(np, method, failures)

  if (method === 'SMS') {
    console.log(`[PhoneCache] ${np}: ${failures} consecutive failures → switching to SMS permanently`)
  } else {
    console.log(`[PhoneCache] ${np}: failure #${failures} recorded (${FAILURE_THRESHOLD - failures} until SMS switch)`)
  }

  return { method, failures }
}

/**
 * Read the raw cache entry for a number (useful for debugging / UI display).
 */
function getEntry(phone) {
  return db().prepare(
    'SELECT * FROM phone_capability WHERE normalized_phone = ?'
  ).get(normalizePhone(phone)) ?? null
}

/**
 * Manually override the method for a number (user-initiated toggle).
 * Sets last_success_at so determineMethod() respects it immediately —
 * the "confirmed success required" guard must not block manual overrides.
 */
function setMethod(phone, method) {
  const np = normalizePhone(phone)
  db().prepare(`
    INSERT INTO phone_capability
      (normalized_phone, method, consecutive_failures, last_success_at, updated_at)
    VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(normalized_phone) DO UPDATE SET
      method               = excluded.method,
      consecutive_failures = 0,
      last_success_at      = CURRENT_TIMESTAMP,
      updated_at           = CURRENT_TIMESTAMP
  `).run(np, method)
  console.log(`[PhoneCache] ${np}: manually set to ${method}`)
}

/**
 * Wipe all cached routing decisions. Call this when the cache is poisoned
 * by script errors (e.g. during development) so all numbers re-learn from scratch.
 */
function resetAll() {
  db().prepare('DELETE FROM phone_capability').run()
  console.log('[PhoneCache] Cache cleared — all numbers will re-learn via iMessage first')
}

module.exports = { determineMethod, recordSuccess, recordFailure, getEntry, setMethod, resetAll }
