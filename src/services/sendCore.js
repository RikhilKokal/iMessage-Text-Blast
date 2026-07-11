/**
 * sendCore.js
 *
 * Shared send logic used by both the Electron main process (iMessageService.js)
 * and the standalone scheduled-send-helper.js.
 *
 * All chat.db access is injected via `chatDbQuery(sql) → string[][]`.
 * The caller provides this function — iMessageService uses better-sqlite3,
 * the helper uses the sqlite3 CLI. Both return rows as arrays of string arrays
 * and throw if the DB is inaccessible (FDA not granted).
 */

const { execFile } = require('child_process')
const { promisify } = require('util')
const fs   = require('fs')
const os   = require('os')
const path = require('path')

const execFileAsync = promisify(execFile)

// ── AppleScripts ──────────────────────────────────────────────────────────────
// iMessage and SMS sends use identical AppleScript apart from the service type,
// so both are generated from one template.

function buildSendScript(serviceType) {
  return `\
on run argv
  set msgText  to item 1 of argv
  set msgPhone to item 2 of argv
  tell application "Messages"
    set theSvc   to first service whose service type = ${serviceType}
    set theBuddy to buddy msgPhone of theSvc
    send msgText to theBuddy
  end tell
  return "ok"
end run`
}

// Targets an EXISTING iMessage thread (e.g. a group chat) by its chat.db chat_identifier,
// instead of addressing a single buddy/participant by phone.
function buildSendToChatScript() {
  return `\
on run argv
  set msgText to item 1 of argv
  set chatId  to item 2 of argv
  tell application "Messages"
    set targetChat to a reference to chat id chatId
    send msgText to targetChat
  end tell
  return "ok"
end run`
}

const IMESSAGE_SCRIPT_PATH = path.join(os.tmpdir(), 'imsg_bulk_imessage.applescript')
const SMS_SCRIPT_PATH      = path.join(os.tmpdir(), 'imsg_bulk_sms.applescript')
const CHAT_SEND_SCRIPT_PATH = path.join(os.tmpdir(), 'imsg_bulk_chat.applescript')
fs.writeFileSync(IMESSAGE_SCRIPT_PATH, buildSendScript('iMessage'), 'utf8')
fs.writeFileSync(SMS_SCRIPT_PATH,      buildSendScript('SMS'),      'utf8')
fs.writeFileSync(CHAT_SEND_SCRIPT_PATH, buildSendToChatScript(),    'utf8')

// ── Phone normalisation ───────────────────────────────────────────────────────

function normalisePhone(raw) {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return '+1' + digits.slice(1)
  if (digits.length === 10) return '+1' + digits
  return raw.trim()
}

// ── Low-level send primitives ─────────────────────────────────────────────────

async function sendViaImessage(phone, message) {
  await execFileAsync('osascript', [IMESSAGE_SCRIPT_PATH, message, phone], { timeout: 15000 })
}


async function sendViaSms(phone, message) {
  await execFileAsync('osascript', [SMS_SCRIPT_PATH, message, phone], { timeout: 15000 })
}

// chat.db stores the bare identifier (e.g. "chat229654607932297364"), but Messages'
// AppleScript dictionary only recognizes chat ids prefixed with the service and chat
// kind — "any;+;" for a group chat (confirmed against a real chat.db identifier).
function toAppleScriptChatId(chatIdentifier) {
  return chatIdentifier.startsWith('any;+;') ? chatIdentifier : `any;+;${chatIdentifier}`
}

async function sendViaImessageToChat(chatIdentifier, message) {
  await execFileAsync('osascript', [CHAT_SEND_SCRIPT_PATH, message, toAppleScriptChatId(chatIdentifier)], { timeout: 15000 })
}

// Individual (non-group) existing-thread addressing uses "any;-;" instead of "any;+;".
// Lets Messages.app resolve the correct service (iMessage or SMS) itself for a contact
// we already have a thread with — no chat.db read required, so this works without FDA.
function toAppleScriptIndividualChatId(e164Phone) {
  return e164Phone.startsWith('any;-;') ? e164Phone : `any;-;${e164Phone}`
}

async function sendViaImessageToIndividualChat(e164Phone, message) {
  await execFileAsync('osascript', [CHAT_SEND_SCRIPT_PATH, message, toAppleScriptIndividualChatId(e164Phone)], { timeout: 15000 })
}

function smsError(err) {
  const msg = (err.stderr || err.message || '').trim()
  return msg.includes('SMS') || msg.includes('service')
    ? 'SMS service not available — enable Text Message Forwarding in iPhone Settings → Messages'
    : msg
}

// ── chat.db delivery polling ──────────────────────────────────────────────────

const APPLE_EPOCH_S = 978307200
const POLL_INTERVAL = 500
const POLL_TIMEOUT  = 7000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function last10(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

// Detect nanoseconds vs seconds storage (cached per process)
let _useNs = null
function usesNanoseconds(chatDbQuery) {
  if (_useNs !== null) return _useNs
  try {
    const rows = chatDbQuery('SELECT MAX(date) FROM message')
    const val  = rows[0]?.[0]
    _useNs = val && Number(val) > 1_000_000_000_000_000
  } catch { _useNs = true }
  return _useNs
}

function toAppleTime(jsMs, chatDbQuery) {
  const secs = jsMs / 1000 - APPLE_EPOCH_S
  return usesNanoseconds(chatDbQuery) ? Math.floor(secs * 1e9) : Math.floor(secs)
}

/**
 * Poll chat.db until we get a definitive delivery result.
 * @param {string}   phone
 * @param {number}   beforeMs   — Unix ms recorded before the send call
 * @param {Function} chatDbQuery(sql) → string[][]  — throws if FDA missing
 */
async function pollDelivery(phone, beforeMs, chatDbQuery) {
  // Check FDA access
  try { chatDbQuery('SELECT 1 FROM message LIMIT 1') }
  catch { return { status: 'timeout', fdaMissing: true } }

  const suffix    = last10(phone)
  const appleTime = toAppleTime(beforeMs - 2000, chatDbQuery)
  const deadline  = Date.now() + POLL_TIMEOUT

  await sleep(800)

  while (Date.now() < deadline) {
    try {
      const rows = chatDbQuery(`
        SELECT m.error, m.is_delivered, m.service
        FROM   message m
        JOIN   handle  h ON h.rowid = m.handle_id
        WHERE  m.is_from_me = 1
          AND  m.date > ${appleTime}
          AND  REPLACE(REPLACE(REPLACE(h.id, '+1', ''), '-', ''), ' ', '') LIKE '%${suffix}'
        ORDER  BY m.date DESC
        LIMIT  1
      `)
      if (rows.length > 0) {
        const [error, isDelivered, service] = rows[0]
        if (Number(error) !== 0)     return { status: 'failed', error: Number(error) }
        if (Number(isDelivered) === 1) return { status: 'delivered', service }
      }
    } catch { /* DB locked — retry */ }

    await sleep(POLL_INTERVAL)
  }

  return { status: 'timeout' }
}

// ── Attachment sender ─────────────────────────────────────────────────────────

async function sendAttachment(e164, attachmentPath, service = 'iMessage') {
  if (!attachmentPath || !fs.existsSync(attachmentPath)) return
  const ext     = path.extname(attachmentPath)
  const picPath = path.join(os.homedir(), 'Pictures', `imsg_tmp_${Date.now()}${ext}`)
  try {
    fs.copyFileSync(attachmentPath, picPath)
    const svcType = service === 'SMS' ? 'SMS' : 'iMessage'
    // Use "buddy" addressing, not "participant" — participant can only resolve an
    // existing conversation, so attachment-only sends (no preceding text) to a
    // brand-new contact silently fail. "buddy" can cold-start a conversation, same
    // as the text-send script already relies on.
    const script  = `set theFile to POSIX file "${picPath}"
tell application "Messages"
  set targetService to 1st account whose service type = ${svcType}
  set targetBuddy to buddy "${e164}" of targetService
  send theFile to targetBuddy
end tell`
    await execFileAsync('osascript', ['-e', script], { timeout: 30000 })
    await sleep(5000)
  } catch (fileErr) {
    console.error(`[Send] Attachment failed for ${e164}: ${(fileErr.stderr || fileErr.message || '').trim()}`)
  } finally {
    try { fs.unlinkSync(picPath) } catch (_) {}
  }
}

async function sendAttachmentToChat(chatIdentifier, attachmentPath) {
  if (!attachmentPath || !fs.existsSync(attachmentPath)) return
  const ext     = path.extname(attachmentPath)
  const picPath = path.join(os.homedir(), 'Pictures', `imsg_tmp_${Date.now()}${ext}`)
  try {
    fs.copyFileSync(attachmentPath, picPath)
    const script  = `set theFile to POSIX file "${picPath}"
tell application "Messages"
  set targetChat to a reference to chat id "${toAppleScriptChatId(chatIdentifier)}"
  send theFile to targetChat
end tell`
    await execFileAsync('osascript', ['-e', script], { timeout: 30000 })
    await sleep(5000)
  } catch (fileErr) {
    console.error(`[Send] Attachment failed for chat ${chatIdentifier}: ${(fileErr.stderr || fileErr.message || '').trim()}`)
  } finally {
    try { fs.unlinkSync(picPath) } catch (_) {}
  }
}

// Unlike sendAttachment/sendAttachmentToChat, this does NOT swallow its own errors —
// sendMessage() needs the exception to propagate so it can decide whether to fall back
// to the standard buddy-addressed attachment path (e.g. no existing thread, -1728).
async function sendAttachmentToIndividualChat(e164Phone, attachmentPath) {
  if (!attachmentPath || !fs.existsSync(attachmentPath)) return
  const ext     = path.extname(attachmentPath)
  const picPath = path.join(os.homedir(), 'Pictures', `imsg_tmp_${Date.now()}${ext}`)
  try {
    fs.copyFileSync(attachmentPath, picPath)
    const script  = `set theFile to POSIX file "${picPath}"
tell application "Messages"
  set targetChat to a reference to chat id "${toAppleScriptIndividualChatId(e164Phone)}"
  send theFile to targetChat
end tell`
    await execFileAsync('osascript', ['-e', script], { timeout: 30000 })
    await sleep(5000)
  } finally {
    try { fs.unlinkSync(picPath) } catch (_) {}
  }
}

// ── Core send ─────────────────────────────────────────────────────────────────

/**
 * Send a single message with automatic SMS fallback.
 * @param {string}   phone
 * @param {string}   message
 * @param {'iMessage'|'SMS'} preferredService
 * @param {Function} chatDbQuery
 */
async function sendMessage(phone, message, preferredService = 'iMessage', chatDbQuery, attachmentPaths = null) {
  const e164 = normalisePhone(phone)
  if (!e164) return { success: false, phone, error: 'Invalid phone number' }

  const paths = Array.isArray(attachmentPaths) ? attachmentPaths.filter(Boolean) : (attachmentPaths ? [attachmentPaths] : [])

  const hasText = message && message.trim().length > 0

  // ── Attempt 0: address an EXISTING thread via "any;-;<e164>" chat id. ──────────
  // More authoritative than a possibly-stale cached preferredService, and — unlike
  // the buddy-addressed path below — doesn't require FDA to resolve the correct
  // service, since it's pure Messages.app automation rather than a chat.db read.
  // Tried before the preferredService gate for that reason. Any failure (most
  // commonly -1728, "no existing chat") falls through to the unchanged logic
  // below — no error-type discrimination needed, since falling through is always
  // safe (nothing was sent yet) and low-cost (one extra osascript round-trip).
  if (hasText) {
    const beforeMs = Date.now()
    try {
      await sendViaImessageToIndividualChat(e164, message)
      const result = await pollDelivery(e164, beforeMs, chatDbQuery)

      if (result.fdaMissing || result.status === 'delivered' || result.status === 'timeout') {
        const via = result.service || 'iMessage'
        const unconfirmed = result.status === 'timeout' || result.fdaMissing
        console.log(`[Send] ${e164}: sent via existing thread (any;-;) → ${via}${unconfirmed ? ' (unconfirmed)' : ''}`)
        for (const p of paths) {
          try { await sendAttachmentToIndividualChat(e164, p) }
          catch (err) { console.error(`[Send] Attachment failed for existing thread ${e164}: ${(err.stderr || err.message || '').trim()}`) }
        }
        return { success: true, phone: e164, via, unconfirmed }
      }

      // The any-addressed send already went out once and genuinely failed to
      // deliver — do NOT fall through to the buddy-addressed logic below, since
      // that would re-send the text and risk a duplicate message. Go straight to
      // an SMS retry instead, mirroring what the standard path does after its
      // own iMessage failure, just without redundantly re-attempting iMessage.
      console.log(`[Send] ${e164}: existing-thread send failed (error ${result.error}), retrying via SMS…`)
      try {
        await sendViaSms(e164, message)
        for (const p of paths) await sendAttachment(e164, p, 'SMS')
        return { success: true, phone: e164, via: 'SMS', autoRouted: true }
      } catch (smsErr) {
        return {
          success: false,
          phone: e164,
          error: `iMessage failed and SMS unavailable. Enable Text Message Forwarding on your iPhone. (${smsError(smsErr)})`,
        }
      }
    } catch (err) {
      console.log(`[Send] ${e164}: no existing thread for "any" addressing (${(err.stderr || err.message || '').trim()}), falling back to standard send…`)
    }
  } else if (paths.length) {
    // Attachment-only send — same any-first, fall-back-on-failure pattern, but
    // no delivery polling exists for attachment-only sends today, so none is
    // added here either.
    try {
      await sendAttachmentToIndividualChat(e164, paths[0])
      for (let i = 1; i < paths.length; i++) {
        try { await sendAttachmentToIndividualChat(e164, paths[i]) }
        catch (err) { console.error(`[Send] Attachment failed for existing thread ${e164}: ${(err.stderr || err.message || '').trim()}`) }
      }
      console.log(`[Send] ${e164}: attachment(s) sent via existing thread (any;-;)`)
      return { success: true, phone: e164, via: 'iMessage' }
    } catch (err) {
      console.log(`[Send] ${e164}: no existing thread for "any" attachment addressing (${(err.stderr || err.message || '').trim()}), falling back to standard send…`)
    }
  }

  // ── Existing logic below, unchanged ─────────────────────────────────────────

  if (preferredService === 'SMS') {
    try {
      if (hasText) await sendViaSms(e164, message)
      for (const p of paths) await sendAttachment(e164, p, 'SMS')
      return { success: true, phone: e164, via: 'SMS' }
    } catch (err) {
      return { success: false, phone: e164, error: smsError(err) }
    }
  }

  if (hasText) {
    const beforeMs = Date.now()

    try {
      await sendViaImessage(e164, message)
    } catch (err) {
      return { success: false, phone: e164, error: (err.stderr || err.message || '').trim() }
    }

    const result = await pollDelivery(e164, beforeMs, chatDbQuery)

    if (result.fdaMissing || result.status === 'delivered' || result.status === 'timeout') {
      for (const p of paths) await sendAttachment(e164, p, 'iMessage')
      return { success: true, phone: e164, via: 'iMessage', unconfirmed: result.status === 'timeout' || result.fdaMissing }
    }

    console.log(`[Send] ${e164}: iMessage failed (error ${result.error}), retrying via SMS…`)
    try {
      await sendViaSms(e164, message)
      for (const p of paths) await sendAttachment(e164, p, 'SMS')
      return { success: true, phone: e164, via: 'SMS', autoRouted: true }
    } catch (smsErr) {
      return {
        success: false,
        phone: e164,
        error: `iMessage failed and SMS unavailable. Enable Text Message Forwarding on your iPhone. (${smsError(smsErr)})`,
      }
    }
  }

  // Attachment-only send. sendAttachment() intentionally swallows its own errors
  // (best-effort per-attachment, so one bad attachment doesn't abort an otherwise-
  // successful message elsewhere in this function) — so we can't rely on it
  // throwing to detect an iMessage delivery failure here. Poll chat.db instead,
  // mirroring the hasText branch above, and retry via SMS if it didn't deliver.
  if (paths.length === 0) return { success: true, phone: e164, via: 'iMessage' }

  const beforeMs = Date.now()
  await sendAttachment(e164, paths[0], 'iMessage')
  const result = await pollDelivery(e164, beforeMs, chatDbQuery)

  if (result.fdaMissing || result.status === 'delivered' || result.status === 'timeout') {
    for (const p of paths.slice(1)) await sendAttachment(e164, p, 'iMessage')
    return { success: true, phone: e164, via: 'iMessage', unconfirmed: result.status === 'timeout' || result.fdaMissing }
  }

  console.log(`[Send] ${e164}: iMessage attachment failed (error ${result.error}), retrying via SMS…`)
  for (const p of paths) await sendAttachment(e164, p, 'SMS')
  return { success: true, phone: e164, via: 'SMS', autoRouted: true }
}

/**
 * Send a templated message into an EXISTING iMessage group thread by chat_identifier,
 * rather than to a single buddy/participant.
 *
 * Group chats have no SMS equivalent to fall back to, and chat.db delivery polling is
 * keyed off a single recipient handle — it can't confirm delivery for a multi-handle
 * thread — so this is fire-and-forget and always reports `unconfirmed: true`.
 */
async function sendMessageToChat(chatIdentifier, message, attachmentPaths = null) {
  const paths = Array.isArray(attachmentPaths) ? attachmentPaths.filter(Boolean) : (attachmentPaths ? [attachmentPaths] : [])
  const hasText = message && message.trim().length > 0

  try {
    if (hasText) await sendViaImessageToChat(chatIdentifier, message)
    for (const p of paths) await sendAttachmentToChat(chatIdentifier, p)
    return { success: true, phone: chatIdentifier, via: 'iMessage', unconfirmed: true }
  } catch (err) {
    return { success: false, phone: chatIdentifier, error: (err.stderr || err.message || '').trim() }
  }
}

// ── Template renderer ─────────────────────────────────────────────────────────

function renderTemplate(template, contact) {
  const firstName = (contact.name || '').split(' ')[0]
  const lastName  = (contact.name || '').split(' ').slice(1).join(' ')
  return template
    .replace(/⟦firstName⟧/g, firstName)
    .replace(/⟦lastName⟧/g,  lastName)
    .replace(/⟦fullName⟧/g,  contact.name     || '')
    .replace(/⟦email⟧/g,     contact.email    || '')
    .replace(/⟦phone⟧/g,     contact.type === 'group_chat' ? '' : (contact.phone || ''))
    .replace(/⟦company⟧/g,   contact.company  || '')
    .replace(/⟦nickname⟧/g,  contact.nickname || firstName)
}

// ── Buffered bulk send sentinel path ─────────────────────────────────────────

const BUFFER_DONE_PATH = path.join(os.homedir(), '.imsg-buffer-done.json')

/**
 * Send a templated message to a list of members.
 *
 * @param {Array}    members     — each has { id, name, phone, email, company, nickname, service }
 * @param {string}   templateText
 * @param {Function} chatDbQuery — injected DB access for delivery polling
 * @param {object}   [opts]
 * @param {Function} [opts.onProgress]   — callback({ sent, failed, total, name, via })
 * @param {number}   [opts.delaySeconds] — seconds between each message (0 = no delay)
 */
async function sendToGroup(members, templateText, chatDbQuery, { onProgress, attachmentPath, delaySeconds = 0 } = {}) {
  const succeeded = []
  const failed    = []
  const total     = members.length

  for (let i = 0; i < members.length; i++) {
    const member  = members[i]
    const message = renderTemplate(templateText, member)
    const result  = member.type === 'group_chat'
      ? await sendMessageToChat(member.chat_identifier, message, attachmentPath)
      : await sendMessage(member.phone, message, member.service === 'SMS' ? 'SMS' : 'iMessage', chatDbQuery, attachmentPath)

    if (result.success) {
      succeeded.push({ ...member, via: result.via, autoRouted: result.autoRouted })
      const tag = result.autoRouted ? '(auto→SMS)' : result.unconfirmed ? '(unconfirmed)' : ''
      console.log(`[Send] ✓ ${member.name} via ${result.via} ${tag}`.trim())
    } else {
      failed.push({ member, error: result.error })
      console.warn(`[Send] ✗ ${member.name}: ${result.error}`)
    }

    if (onProgress) {
      onProgress({ sent: succeeded.length, failed: failed.length, total, name: member.name, via: result.via })
    }

    if (delaySeconds > 0 && i < members.length - 1) {
      await sleep(delaySeconds * 1000)
    }
  }

  return { succeeded, failed }
}

// ── Send history SQL builder ──────────────────────────────────────────────────

function escapeSql(s) { return (s ?? '').toString().replace(/'/g, "''") }

/**
 * Build the SQL to log a completed send into send_history + send_history_recipients.
 * Returns a single string with two statements that must be executed on the same
 * DB connection so that last_insert_rowid() resolves correctly.
 *
 * @param {object} opts
 * @param {number}   opts.groupId
 * @param {string}   opts.templateText
 * @param {Array}    opts.succeeded    — sendToGroup succeeded array
 * @param {Array}    opts.failed       — sendToGroup failed array
 * @param {Array}    opts.allMembers   — full group (selected + unselected) for total_members_at_send
 * @param {Array}    opts.sentMembers  — members actually attempted (may be a subset of allMembers)
 */
function buildSendHistorySQL({ groupId, templateText, succeeded, failed, allMembers, sentMembers, attachmentPath }) {
  const sentIds   = new Set(succeeded.map(s => String(s.id)))
  const status    = failed.length === 0 ? 'sent' : succeeded.length > 0 ? 'partial' : 'failed'
  const sentAt    = new Date().toISOString()
  const failLines = failed.map(f => `${f.member.name} (${f.member.phone}): ${f.error}`)
  const errorSql  = failLines.length ? `'${escapeSql(failLines.join('\n'))}'` : 'NULL'

  // Deduplicate by id to handle contacts added twice (e.g. two phone numbers)
  const dedup = (arr) => {
    const seen = new Set()
    return arr.filter(m => { const k = String(m.phone); return seen.has(k) ? false : (seen.add(k), true) })
  }
  const dedupedSent    = dedup(sentMembers || allMembers)
  const dedupedAll     = dedup(allMembers)

  // Recipients snapshot: all group members, received=1 only for those actually sent
  // Use a subquery for send_history_id so all rows reference the same just-inserted row,
  // avoiding the bug where last_insert_rowid() updates after each recipient row is inserted.
  const historyIdExpr = `(SELECT id FROM send_history ORDER BY id DESC LIMIT 1)`
  const rows = dedupedSent.map(m => {
    const received = sentIds.has(String(m.id)) ? 1 : 0
    return `(${historyIdExpr}, '${escapeSql(m.name)}', '${escapeSql(m.phone)}', ${received})`
  })
  // Non-attempted members (deselected) also recorded as received=0
  const attemptedIds = new Set(dedupedSent.map(m => String(m.id)))
  for (const m of dedupedAll) {
    if (!attemptedIds.has(String(m.id))) {
      rows.push(`(${historyIdExpr}, '${escapeSql(m.name)}', '${escapeSql(m.phone)}', 0)`)
    }
  }

  const attachArr = Array.isArray(attachmentPath) ? attachmentPath.filter(Boolean) : (attachmentPath ? [attachmentPath] : [])
  const attachSql = attachArr.length ? `'${escapeSql(JSON.stringify(attachArr))}'` : 'NULL'

  return `
INSERT INTO send_history (group_id, template_text, status, error_log, total_members_at_send, attachment_path, created_at, sent_at)
VALUES (${groupId}, '${escapeSql(templateText)}', '${status}', ${errorSql}, ${dedupedAll.length}, ${attachSql}, CURRENT_TIMESTAMP, '${sentAt}');
INSERT INTO send_history_recipients (send_history_id, name, phone, received) VALUES
  ${rows.join(',\n  ')};`
}

// ── Next-run calculator ────────────────────────────────────────────────────────
// Shared by schedulingService.js (Electron main process, handles 'once' + 'recurring')
// and scheduled-send-helper.js (detached launchd process, only ever calls this with
// scheduleType 'recurring' since one-time sends are deactivated after firing once).

/**
 * Calculate the next Date a schedule should fire.
 * @param {'once'|'recurring'} scheduleType
 * @param {{ dateTime?: string, interval?: string, time?: string, weekday?: number, monthDay?: number }} scheduleData
 */
function calculateNextRun(scheduleType, scheduleData) {
  if (scheduleType === 'once') {
    const d = new Date(scheduleData.dateTime)
    if (isNaN(d.getTime())) throw new Error('Invalid dateTime: ' + scheduleData.dateTime)
    return d
  }

  if (scheduleType === 'recurring') {
    const [hours, minutes] = (scheduleData.time || '09:00').split(':').map(Number)
    const now = new Date()

    if (scheduleData.interval === 'daily') {
      const nextRun = new Date(now)
      nextRun.setHours(hours, minutes, 0, 0)
      if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1)
      return nextRun
    }

    if (scheduleData.interval === 'weekly') {
      const targetDay = scheduleData.weekday ?? now.getDay()
      const nextRun = new Date(now)
      nextRun.setHours(hours, minutes, 0, 0)
      let daysAhead = (targetDay - now.getDay() + 7) % 7
      if (daysAhead === 0 && nextRun <= now) daysAhead = 7
      nextRun.setDate(now.getDate() + daysAhead)
      return nextRun
    }

    if (scheduleData.interval === 'monthly') {
      const targetDate = scheduleData.monthDay ?? now.getDate()
      const nextRun = new Date(now)
      nextRun.setDate(targetDate)
      nextRun.setHours(hours, minutes, 0, 0)
      if (nextRun <= now) nextRun.setMonth(nextRun.getMonth() + 1)
      return nextRun
    }
  }

  throw new Error(`Unknown schedule type: ${scheduleType}`)
}

module.exports = { sendToGroup, sendMessage, renderTemplate, normalisePhone, buildSendHistorySQL, calculateNextRun, BUFFER_DONE_PATH }
