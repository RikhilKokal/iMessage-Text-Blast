#!/usr/bin/env node
/**
 * scheduled-send-helper.js
 *
 * Executed by launchd when a scheduled send is due.
 * Usage: node scheduled-send-helper.js <plistId>
 *
 * NOTE: This script runs under the *system* node binary, not Electron's node.
 * To avoid native-module ABI mismatches (better-sqlite3 is compiled for
 * Electron), all DB access goes through the sqlite3 CLI tool that ships with
 * macOS (Xcode Command Line Tools).
 *
 * Send logic lives in src/services/sendCore.js and is shared with the main
 * Electron process. We provide a chatDbQuery adapter using the sqlite3 CLI.
 */

const path = require('path')
const os   = require('os')
const fs   = require('fs')
const { execSync } = require('child_process')

const plistId = process.argv[2]
if (!plistId) {
  console.error('[Helper] Error: plistId argument required')
  process.exit(1)
}

const DB_PATH      = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Bulk Scheduler', 'app.db')
const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')

// ── SQLite CLI helpers ────────────────────────────────────────────────────────

function dbSelect(sql, dbPath = DB_PATH) {
  const tmpSql = path.join(os.tmpdir(), `imsg-helper-${Date.now()}.sql`)
  fs.writeFileSync(tmpSql, sql, 'utf8')
  try {
    const out = execSync(
      `sqlite3 -separator $'\\t' "${dbPath}" < "${tmpSql}"`,
      { shell: '/bin/bash', timeout: 10000 }
    ).toString().trim()
    if (!out) return []
    return out.split('\n').map(row => row.split('\t'))
  } catch (err) {
    throw new Error(`sqlite3 query failed: ${err.stderr?.toString() || err.message}`)
  } finally {
    try { fs.unlinkSync(tmpSql) } catch (_) {}
  }
}

function dbExec(sql) {
  const tmpSql = path.join(os.tmpdir(), `imsg-helper-exec-${Date.now()}.sql`)
  fs.writeFileSync(tmpSql, sql, 'utf8')
  try {
    execSync(`sqlite3 "${DB_PATH}" < "${tmpSql}"`, { shell: '/bin/bash', timeout: 10000 })
  } catch (err) {
    throw new Error(`sqlite3 exec failed: ${err.stderr?.toString() || err.message}`)
  } finally {
    try { fs.unlinkSync(tmpSql) } catch (_) {}
  }
}

// Adapter: chatDbQuery for sendCore — uses the sqlite3 CLI against chat.db
function chatDbQuery(sql) {
  return dbSelect(sql, CHAT_DB_PATH)
}

// ── sendCore ──────────────────────────────────────────────────────────────────

const core = require('./src/services/sendCore')

// ── Next-run calculator (mirrors schedulingService.js) ────────────────────────

function calculateNextRun(scheduleData) {
  const { interval, time, weekday, monthDay } = scheduleData
  const [hours, minutes] = (time || '09:00').split(':').map(Number)
  const now = new Date()

  if (interval === 'daily') {
    const nextRun = new Date(now)
    nextRun.setHours(hours, minutes, 0, 0)
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1)
    return nextRun
  }

  if (interval === 'weekly') {
    const targetDay = weekday ?? now.getDay()
    const nextRun = new Date(now)
    nextRun.setHours(hours, minutes, 0, 0)
    let daysAhead = (targetDay - now.getDay() + 7) % 7
    if (daysAhead === 0 && nextRun <= now) daysAhead = 7
    nextRun.setDate(now.getDate() + daysAhead)
    return nextRun
  }

  if (interval === 'monthly') {
    const targetDate = monthDay ?? now.getDate()
    const nextRun = new Date(now)
    nextRun.setDate(targetDate)
    nextRun.setHours(hours, minutes, 0, 0)
    if (nextRun <= now) nextRun.setMonth(nextRun.getMonth() + 1)
    return nextRun
  }

  throw new Error(`Unknown interval: ${interval}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[Helper] Starting for plist: ${plistId}`)

  // 1. Load scheduled send record
  const schedRows = dbSelect(
    `SELECT id, group_id, template_text, schedule_type, schedule_interval, member_ids, attachment_path
     FROM scheduled_sends
     WHERE launchd_plist_id = '${plistId.replace(/'/g, "''")}' AND is_active = 1
     LIMIT 1`
  )

  if (!schedRows.length) {
    console.log('[Helper] No active scheduled send found — exiting.')
    process.exit(0)
  }

  const [schedId, groupId, templateText, scheduleType, scheduleInterval, memberIdsJson, attachmentPathRaw] = schedRows[0]
  let attachmentPath = null
  try { attachmentPath = attachmentPathRaw ? JSON.parse(attachmentPathRaw) : null } catch { attachmentPath = attachmentPathRaw ? [attachmentPathRaw] : null }
  console.log(`[Helper] Scheduled send id=${schedId} for group=${groupId}`)

  // 2. Load ALL group members (needed for total count in history)
  const allMemberRows = dbSelect(
    `SELECT c.id, c.name, c.phone, c.email, c.company, c.nickname, c.preferred_service
     FROM contacts c
     JOIN group_members gm ON c.id = gm.contact_id
     WHERE gm.group_id = ${groupId}
     ORDER BY c.name ASC`
  )

  if (!allMemberRows.length) {
    console.log('[Helper] Group has no members — exiting.')
    process.exit(0)
  }

  const toMember = ([id, name, phone, email, company, nickname, preferredService]) => ({
    id, name, phone, email, company, nickname,
    service: preferredService || 'iMessage',
  })

  const allMembers = allMemberRows.map(toMember)

  // Filter to selected member IDs (stored at schedule-creation time), or send to all
  const selectedIds = memberIdsJson ? new Set(JSON.parse(memberIdsJson).map(String)) : null
  const members = selectedIds
    ? allMembers.filter(m => selectedIds.has(String(m.id)))
    : allMembers

  console.log(`[Helper] Sending to ${members.length} of ${allMembers.length} members`)

  // 3. Check attachments exist before sending
  const sentinelPath = path.join(os.homedir(), '.imsg-scheduled-changed')
  const errorQueuePath = path.join(os.homedir(), '.imsg-attachment-errors.json')

  if (Array.isArray(attachmentPath) && attachmentPath.length > 0) {
    const missing = attachmentPath.filter(p => !fs.existsSync(p))
    if (missing.length > 0) {
      console.log(`[Helper] ${missing.length} attachment(s) missing — aborting send`)
      const groupNameRow = dbSelect(`SELECT name FROM groups WHERE id = ${groupId} LIMIT 1`)[0]
      const groupName = groupNameRow?.[0] ?? 'Unknown Group'
      const errorEntry = {
        isError: true,
        type: 'attachmentMissing',
        scheduledSendId: Number(schedId),
        groupId: Number(groupId),
        groupName,
        hasText: !!(templateText && templateText.trim()),
        missingCount: missing.length,
        timestamp: new Date().toISOString(),
      }
      // Append to error queue (read by app on startup/focus)
      let queue = []
      try { queue = JSON.parse(fs.readFileSync(errorQueuePath, 'utf8')) } catch (_) {}
      queue.push(errorEntry)
      fs.writeFileSync(errorQueuePath, JSON.stringify(queue), 'utf8')
      // Touch sentinel so watcher fires if app is already open
      fs.writeFileSync(sentinelPath, JSON.stringify(errorEntry), 'utf8')
      // Deactivate one-time sends so they don't re-fire
      if (scheduleType === 'once') {
        dbExec(`UPDATE scheduled_sends SET is_active = 0 WHERE id = ${schedId};`)
      }
      process.exit(0)
    }
  }

  // 4. Send — sendCore handles Messages.app launch, template rendering, polling, SMS fallback
  const { succeeded, failed } = await core.sendToGroup(members, templateText, chatDbQuery, { attachmentPath: attachmentPath || null })

  // 5. Persist preferred_service=SMS for auto-routed contacts
  for (const s of succeeded) {
    if (s.autoRouted) {
      dbExec(`UPDATE contacts SET preferred_service = 'SMS', service_confirmed = 1 WHERE id = ${s.id};`)
      console.log(`[Helper] Saved preferred_service=SMS for contact id=${s.id}`)
    }
  }

  // 6. Write send_history + recipients in one DB round-trip using shared SQL builder
  const historySql = core.buildSendHistorySQL({
    groupId,
    templateText,
    succeeded,
    failed,
    allMembers,
    sentMembers: members,
    attachmentPath: attachmentPath || null,
  })
  dbExec(historySql)

  const status = failed.length === 0 ? 'sent' : succeeded.length > 0 ? 'partial' : 'failed'
  console.log(`[Helper] Logged send_history — status: ${status}, sent: ${succeeded.length}/${allMembers.length}`)

  // Signal the Electron app to refresh (watched by the main process).
  // Write result data so the app can show a toast.
  const groupNameRow = dbSelect(`SELECT name FROM groups WHERE id = ${groupId} LIMIT 1`)[0]
  const groupName    = groupNameRow?.[0] ?? 'Unknown Group'
  const autoRoutedNames = succeeded.filter(s => s.autoRouted).map(s => s.name)
  fs.writeFileSync(sentinelPath, JSON.stringify({
    groupId:    Number(groupId),
    groupName,
    sentAt:     new Date().toISOString(),
    succeeded:  succeeded.length,
    failed:     failed.length,
    total:      allMembers.length,
    autoRouted: autoRoutedNames,
  }), 'utf8')

  // 7. Update scheduled_sends record
  if (scheduleType === 'recurring') {
    const scheduleData = JSON.parse(scheduleInterval)
    const nextRun = calculateNextRun(scheduleData)
    dbExec(`UPDATE scheduled_sends SET next_run = '${nextRun.toISOString()}' WHERE id = ${schedId};`)
    console.log(`[Helper] Next run for recurring: ${nextRun.toLocaleString()}`)
  } else {
    dbExec(`UPDATE scheduled_sends SET is_active = 0 WHERE id = ${schedId};`)
    console.log('[Helper] One-time send complete — marked inactive.')
    // Clean up stored attachment copies for one-time sends
    if (Array.isArray(attachmentPath)) {
      const appAttachmentsDir = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Bulk Scheduler', 'attachments')
      for (const p of attachmentPath) {
        if (p && p.startsWith(appAttachmentsDir)) {
          try { fs.unlinkSync(p) } catch (_) {}
        }
      }
    }
  }

  process.exit(0)
}

main().catch(err => {
  console.error('[Helper] Fatal error:', err.message)
  process.exit(1)
})
