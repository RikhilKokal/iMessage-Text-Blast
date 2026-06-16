/**
 * chatDbService.js
 *
 * Reads ~/Library/Messages/chat.db to get authoritative delivery status for
 * messages we just sent. This is the only way to detect "Not Delivered" from
 * outside the Messages UI — Apple doesn't expose it via AppleScript.
 *
 * Requires Full Disk Access in System Settings → Privacy & Security.
 * Call checkFdaAccess() on startup to detect whether it's been granted.
 *
 * ── Schema reference ──────────────────────────────────────────────────────────
 * message  : rowid, guid, text, handle_id, service, error, date (ns since Apple
 *            epoch), is_from_me, is_delivered, is_sent, is_finished
 * handle   : rowid, id (+15551234567 / email), service
 *
 * date is stored as nanoseconds since 2001-01-01 UTC on macOS 10.13+.
 * error = 0  → no error
 * error ≠ 0  → delivery failure (4 = "Not Delivered" to non-iMessage number)
 * is_delivered = 1 → recipient's device confirmed receipt
 */

const Database = require('better-sqlite3')
const os       = require('os')
const path     = require('path')

const CHAT_DB_PATH   = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
const APPLE_EPOCH_S  = 978307200            // Unix seconds for 2001-01-01 UTC
const POLL_INTERVAL  = 500                  // ms between status checks
const POLL_TIMEOUT   = 7000                 // ms before giving up and assuming delivered

// ── Helpers ───────────────────────────────────────────────────────────────────

let _useNanoseconds = null  // cached once we've checked

/**
 * Returns true if chat.db stores dates as nanoseconds (macOS 10.13+).
 * Detection: sample the max date — if it's > 1e15 it's definitely ns.
 */
function usesNanoseconds(db) {
  if (_useNanoseconds !== null) return _useNanoseconds
  try {
    const row = db.prepare('SELECT MAX(date) as d FROM message').get()
    _useNanoseconds = row && row.d > 1_000_000_000_000_000
  } catch {
    _useNanoseconds = true  // safe default for modern macOS
  }
  return _useNanoseconds
}

/**
 * Convert a JS Date (or ms timestamp) to the Apple epoch value used in chat.db.
 */
function toAppleTime(jsMs, db) {
  const secs = jsMs / 1000 - APPLE_EPOCH_S
  return usesNanoseconds(db) ? Math.floor(secs * 1e9) : Math.floor(secs)
}

/**
 * Normalise a phone number to its last 10 digits for fuzzy matching
 * against handle.id values that may include/omit the +1 prefix.
 */
function last10(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether this process has Full Disk Access by trying to open chat.db.
 * Returns { granted: bool, path: string }.
 */
function checkFdaAccess() {
  try {
    const db = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true })
    db.close()
    return { granted: true, path: CHAT_DB_PATH }
  } catch (err) {
    const denied = /authorization|SQLITE_AUTH|EPERM|EACCES/i.test(err.message)
    return { granted: false, reason: denied ? 'permission' : err.message }
  }
}

/**
 * Find the most recent outgoing message to `phone` sent after `afterMs` (Unix ms).
 * Returns the raw DB row or null.
 */
function findSentMessage(db, phone, afterMs) {
  const appleTime = toAppleTime(afterMs, db)
  const suffix    = last10(phone)

  return db.prepare(`
    SELECT m.rowid, m.error, m.is_delivered, m.is_finished, m.service, m.date
    FROM   message m
    JOIN   handle  h ON h.rowid = m.handle_id
    WHERE  m.is_from_me = 1
      AND  m.date       > ?
      AND  REPLACE(REPLACE(REPLACE(h.id, '+1', ''), '-', ''), ' ', '') LIKE ?
    ORDER  BY m.date DESC
    LIMIT  1
  `).get(appleTime, `%${suffix}`)
}

/**
 * Poll chat.db until we get a definitive delivery result for a message we just sent.
 *
 * @param {string}  phone      - raw phone number in any format
 * @param {number}  beforeMs   - Unix ms timestamp recorded BEFORE the send call
 * @param {object}  [opts]
 * @param {number}  [opts.timeout=7000]    - max ms to wait
 * @param {number}  [opts.interval=500]    - ms between polls
 * @returns {{ status: 'delivered'|'failed'|'timeout', error: number|null }}
 */
async function pollDelivery(phone, beforeMs, { timeout = POLL_TIMEOUT, interval = POLL_INTERVAL } = {}) {
  let db
  try {
    db = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true })
  } catch (err) {
    // FDA not available — can't determine status
    return { status: 'timeout', error: null, fdaMissing: true }
  }

  const deadline = Date.now() + timeout
  // Give Messages a moment to write the sent message to the DB
  await sleep(800)

  try {
    while (Date.now() < deadline) {
      const row = findSentMessage(db, phone, beforeMs - 2000)  // -2s buffer for clock skew

      if (row) {
        if (row.error !== 0) {
          return { status: 'failed', error: row.error }
        }
        if (row.is_delivered === 1) {
          return { status: 'delivered', error: 0 }
        }
        // is_finished=1 but not delivered and no error = still in transit (e.g. SMS delivery receipt pending)
        // Keep polling
      }

      await sleep(interval)
    }
  } finally {
    try { db.close() } catch {}
  }

  return { status: 'timeout', error: null }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = { checkFdaAccess, pollDelivery, findSentMessage, toAppleTime }
