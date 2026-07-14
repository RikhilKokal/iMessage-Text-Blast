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

const plistId = process.argv[2]
if (!plistId) {
  console.error('[Helper] Error: plistId argument required')
  process.exit(1)
}

const DB_PATH      = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Text Blast', 'app.db')
const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')

// ── SQLite CLI helpers ────────────────────────────────────────────────────────

const { createSqliteCliAdapter } = require('./src/services/sqliteCliAdapter')
const { dbSelect, dbExec } = createSqliteCliAdapter({
  selectTmpPrefix: 'imsg-helper',
  execTmpPrefix:   'imsg-helper-exec',
  execDbPath:      DB_PATH,
})

// Adapter: chatDbQuery for sendCore — uses the sqlite3 CLI against chat.db
function chatDbQuery(sql) {
  return dbSelect(sql, CHAT_DB_PATH)
}

// Adapter: appDbQuery for sendCore — uses the sqlite3 CLI against app.db
function appDbQuery(sql) {
  return dbSelect(sql, DB_PATH)
}

// ── sendCore ──────────────────────────────────────────────────────────────────

const core = require('./src/services/sendCore')

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[Helper] Starting for plist: ${plistId}`)

  // 1. Load scheduled send record
  const schedRows = dbSelect(
    `SELECT id, group_id, template_text, schedule_type, schedule_interval, member_ids, attachment_path, delay_seconds
     FROM scheduled_sends
     WHERE launchd_plist_id = '${plistId.replace(/'/g, "''")}' AND is_active = 1
     LIMIT 1`,
    DB_PATH
  )

  if (!schedRows.length) {
    console.log('[Helper] No active scheduled send found — exiting.')
    process.exit(0)
  }

  const [schedId, groupId, templateText, scheduleType, scheduleInterval, memberIdsJson, attachmentPathRaw, delaySecondsRaw] = schedRows[0]
  let attachmentPath = null
  try { attachmentPath = attachmentPathRaw ? JSON.parse(attachmentPathRaw) : null } catch { attachmentPath = attachmentPathRaw ? [attachmentPathRaw] : null }
  console.log(`[Helper] Scheduled send id=${schedId} for group=${groupId}`)

  // 2. Load ALL group members (needed for total count in history) — individual
  // contacts plus any existing iMessage group-chat threads added as members.
  const allMemberRows = dbSelect(
    `SELECT c.id, c.name, c.phone, c.email, c.company, c.nickname, c.preferred_service
     FROM contacts c
     JOIN group_members gm ON c.id = gm.contact_id
     WHERE gm.group_id = ${groupId}
     ORDER BY c.name ASC`,
    DB_PATH
  )

  const chatGroupRows = dbSelect(
    `SELECT id, chat_identifier, display_name, participant_handles
     FROM chat_group_members
     WHERE app_group_id = ${groupId}`,
    DB_PATH
  )

  if (!allMemberRows.length && !chatGroupRows.length) {
    console.log('[Helper] Group has no members — exiting.')
    process.exit(0)
  }

  const toMember = ([id, name, phone, email, company, nickname, preferredService]) => ({
    id, name, phone, email, company, nickname,
    service: preferredService || 'iMessage',
    type: 'contact',
  })

  // No local better-sqlite3 access here to resolve handle → contact name, so unnamed
  // chats fall back to a comma-joined list of raw participant handles instead of the
  // friendlier resolved names the Electron main process shows in the member list.
  const toChatGroupMember = ([id, chatIdentifier, displayName, participantHandlesJson]) => {
    let handles = []
    try { handles = JSON.parse(participantHandlesJson || '[]') } catch { handles = [] }
    const name = (displayName && displayName.trim()) || handles.join(', ') || chatIdentifier
    return {
      id: `gc:${id}`, name, phone: chatIdentifier,
      email: null, company: null, nickname: null,
      service: 'iMessage', type: 'group_chat', chat_identifier: chatIdentifier,
    }
  }

  const allMembers = [...allMemberRows.map(toMember), ...chatGroupRows.map(toChatGroupMember)]

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
      const groupNameRow = dbSelect(`SELECT name FROM groups WHERE id = ${groupId} LIMIT 1`, DB_PATH)[0]
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

  // 4. Fetch persistent token overrides for contact members
  const memberOverrides = new Map()
  for (const member of members) {
    if (member.type !== 'group_chat') {
      const overrideRows = dbSelect(
        `SELECT overrides FROM contact_token_overrides WHERE contact_id = ${member.id} LIMIT 1`,
        DB_PATH
      )
      if (overrideRows.length > 0) {
        try {
          const overrides = JSON.parse(overrideRows[0][0])
          if (Object.keys(overrides).length > 0) {
            memberOverrides.set(member.id, overrides)
          }
        } catch (err) {
          console.warn(`[Helper] Failed to parse overrides for contact ${member.id}: ${err.message}`)
        }
      }
    }
  }

  // 5. Send — sendCore handles Messages.app launch, template rendering, polling, SMS fallback
  const delaySeconds = Number(delaySecondsRaw) || 0
  const { succeeded, failed } = await core.sendToGroup(members, templateText, chatDbQuery, { attachmentPath: attachmentPath || null, delaySeconds, memberOverrides, appDbQuery })

  // 6. Persist preferred_service=SMS for auto-routed contacts
  for (const s of succeeded) {
    if (s.autoRouted) {
      dbExec(`UPDATE contacts SET preferred_service = 'SMS', service_confirmed = 1 WHERE id = ${s.id};`)
      console.log(`[Helper] Saved preferred_service=SMS for contact id=${s.id}`)
    }
  }

  // 7. Write send_history + recipients in one DB round-trip using shared SQL builder
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
  const groupNameRow = dbSelect(`SELECT name FROM groups WHERE id = ${groupId} LIMIT 1`, DB_PATH)[0]
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
    const nextRun = core.calculateNextRun('recurring', scheduleData)
    dbExec(`UPDATE scheduled_sends SET next_run = '${nextRun.toISOString()}' WHERE id = ${schedId};`)
    console.log(`[Helper] Next run for recurring: ${nextRun.toLocaleString()}`)
  } else {
    dbExec(`UPDATE scheduled_sends SET is_active = 0 WHERE id = ${schedId};`)
    console.log('[Helper] One-time send complete — marked inactive.')
    // Clean up stored attachment copies for one-time sends
    if (Array.isArray(attachmentPath)) {
      const appAttachmentsDir = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Text Blast', 'attachments')
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
