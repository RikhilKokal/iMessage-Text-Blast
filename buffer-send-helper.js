#!/usr/bin/env node
/**
 * buffer-send-helper.js
 *
 * Spawned as a detached process by iMessageService when a buffered send is
 * requested (delaySeconds > 0). Running detached means the send survives the
 * Electron app being quit.
 *
 * Usage: node buffer-send-helper.js <payloadPath>
 *
 * payloadPath — path to a JSON file containing:
 *   { members, templateText, delaySeconds, attachmentPath }
 *
 * Like scheduled-send-helper.js, all chat.db access uses the sqlite3 CLI to
 * avoid native-module ABI issues (better-sqlite3 is compiled for Electron's
 * Node, not the system Node).
 */

const path = require('path')
const os   = require('os')
const fs   = require('fs')
const { execSync } = require('child_process')

const payloadPath = process.argv[2]
if (!payloadPath) {
  console.error('[BufferHelper] Error: payloadPath argument required')
  process.exit(1)
}

const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
const APP_DB_PATH  = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Bulk Scheduler', 'app.db')

// ── sqlite3 CLI adapters ──────────────────────────────────────────────────────

function dbExec(sql) {
  const tmpSql = path.join(os.tmpdir(), `imsg-buffer-exec-${Date.now()}.sql`)
  fs.writeFileSync(tmpSql, sql, 'utf8')
  try {
    execSync(`sqlite3 "${APP_DB_PATH}" < "${tmpSql}"`, { shell: '/bin/bash', timeout: 10000 })
  } catch (err) {
    throw new Error(`sqlite3 exec failed: ${err.stderr?.toString() || err.message}`)
  } finally {
    try { fs.unlinkSync(tmpSql) } catch (_) {}
  }
}

function chatDbQuery(sql) {
  const tmpSql = path.join(os.tmpdir(), `imsg-buffer-helper-${Date.now()}.sql`)
  fs.writeFileSync(tmpSql, sql, 'utf8')
  try {
    const out = execSync(
      `sqlite3 -separator $'\\t' "${CHAT_DB_PATH}" < "${tmpSql}"`,
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

// ── sendCore ──────────────────────────────────────────────────────────────────

const core = require('./src/services/sendCore')

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Read and delete the payload file
  let payload
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'))
  } catch (err) {
    console.error('[BufferHelper] Failed to read payload:', err.message)
    process.exit(1)
  }
  try { fs.unlinkSync(payloadPath) } catch (_) {}

  const { members, templateText, delaySeconds, attachmentPath } = payload

  console.log(`[BufferHelper] Sending to ${members.length} recipients with ${delaySeconds}s delay`)

  const { succeeded, failed } = await core.sendToGroup(
    members, templateText, chatDbQuery,
    { attachmentPath: attachmentPath || null, delaySeconds }
  )

  console.log(`[BufferHelper] Done — succeeded: ${succeeded.length}, failed: ${failed.length}`)

  // Persist preferred_service=SMS for auto-routed contacts
  for (const s of succeeded) {
    if (s.autoRouted) {
      dbExec(`UPDATE contacts SET preferred_service = 'SMS', service_confirmed = 1 WHERE id = ${s.id};`)
      console.log(`[BufferHelper] Saved preferred_service=SMS for contact id=${s.id}`)
    }
  }

  // Write completion sentinel for the Electron app to pick up
  const autoRouted = succeeded.filter(s => s.autoRouted).map(s => s.name)
  const result = { succeeded: succeeded.length, autoRouted }
  fs.writeFileSync(core.BUFFER_DONE_PATH, JSON.stringify(result), 'utf8')
}

main().catch(err => {
  console.error('[BufferHelper] Fatal error:', err.message)
  process.exit(1)
})
