const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync, execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const LAUNCH_AGENT_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents')

// ── Node binary detection ─────────────────────────────────────────────────────
// Detect once at module-load time so we can embed the path in plists.
// launchd runs outside any shell profile, so we can't rely on $PATH containing
// nvm / homebrew entries unless we look them up now from the Electron process's
// own PATH.
function detectNodePath() {
  try {
    const p = execSync('which node', { shell: '/bin/bash', env: process.env }).toString().trim()
    if (p) return p
  } catch (_) { /* fall through */ }
  // Common hard-coded fallbacks
  for (const candidate of [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return 'node' // last resort — may not work from launchd
}

const NODE_PATH = detectNodePath()
console.log(`[Scheduling] Using node binary: ${NODE_PATH}`)

// ── ID / next-run helpers ─────────────────────────────────────────────────────

function generatePlistId(groupId) {
  return `com.imessage-scheduler.send-${groupId}-${Date.now()}`
}

/**
 * Calculate the next Date a schedule should fire.
 * @param {'once'|'recurring'} scheduleType
 * @param {{ dateTime?: string, interval?: string, time?: string }} scheduleData
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

// ── Plist builder ─────────────────────────────────────────────────────────────

function buildCalendarInterval(nextRun, scheduleType, scheduleData) {
  const h = nextRun.getHours()
  const m = nextRun.getMinutes()

  if (scheduleType === 'once') {
    return `  <dict>
    <key>Month</key>
    <integer>${nextRun.getMonth() + 1}</integer>
    <key>Day</key>
    <integer>${nextRun.getDate()}</integer>
    <key>Hour</key>
    <integer>${h}</integer>
    <key>Minute</key>
    <integer>${m}</integer>
  </dict>`
  }

  if (scheduleType === 'recurring') {
    const interval = scheduleData.interval
    if (interval === 'daily') {
      return `  <dict>
    <key>Hour</key>
    <integer>${h}</integer>
    <key>Minute</key>
    <integer>${m}</integer>
  </dict>`
    }
    if (interval === 'weekly') {
      const weekday = scheduleData.weekday ?? nextRun.getDay()
      return `  <dict>
    <key>Weekday</key>
    <integer>${weekday}</integer>
    <key>Hour</key>
    <integer>${h}</integer>
    <key>Minute</key>
    <integer>${m}</integer>
  </dict>`
    }
    if (interval === 'monthly') {
      const day = scheduleData.monthDay ?? nextRun.getDate()
      return `  <dict>
    <key>Day</key>
    <integer>${day}</integer>
    <key>Hour</key>
    <integer>${h}</integer>
    <key>Minute</key>
    <integer>${m}</integer>
  </dict>`
    }
  }

  throw new Error(`Cannot build calendar interval for type=${scheduleType}`)
}

function buildPlist(plistId, helperScriptPath, nextRun, scheduleType, scheduleData) {
  const calInterval = buildCalendarInterval(nextRun, scheduleType, scheduleData)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistId}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${helperScriptPath}</string>
    <string>${plistId}</string>
  </array>
  <key>StartCalendarInterval</key>
${calInterval}
  <key>StandardOutPath</key>
  <string>/tmp/${plistId}.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/${plistId}.err</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Write and load a launchd plist for the given schedule.
 * @param {string} plistId
 * @param {string} helperScriptPath  Absolute path to scheduled-send-helper.js
 * @param {Date}   nextRun
 * @param {'once'|'recurring'} scheduleType
 * @param {object} scheduleData
 */
async function createSchedule(plistId, helperScriptPath, nextRun, scheduleType, scheduleData) {
  fs.mkdirSync(LAUNCH_AGENT_DIR, { recursive: true })
  const plistPath = path.join(LAUNCH_AGENT_DIR, `${plistId}.plist`)

  const plistContent = buildPlist(plistId, helperScriptPath, nextRun, scheduleType, scheduleData)
  fs.writeFileSync(plistPath, plistContent, 'utf8')

  try {
    await execFileAsync('launchctl', ['load', plistPath], { timeout: 10000 })
    console.log(`[Scheduling] Loaded: ${plistId}`)
  } catch (err) {
    // Clean up plist on failure so it doesn't leave a zombie
    try { fs.unlinkSync(plistPath) } catch (_) {}
    throw new Error(`launchctl load failed: ${err.stderr || err.message}`)
  }
}

/**
 * Unload and remove the launchd plist for a given plistId.
 * Safe to call even if the plist was already removed.
 */
async function cancelSchedule(plistId) {
  const plistPath = path.join(LAUNCH_AGENT_DIR, `${plistId}.plist`)

  if (!fs.existsSync(plistPath)) {
    console.warn(`[Scheduling] Plist not found, nothing to unload: ${plistId}`)
    return
  }

  try {
    await execFileAsync('launchctl', ['unload', plistPath], { timeout: 10000 })
  } catch (err) {
    // launchctl unload exits non-zero if job wasn't loaded — treat as warning
    console.warn(`[Scheduling] launchctl unload warning for ${plistId}: ${err.stderr || err.message}`)
  }

  try { fs.unlinkSync(plistPath) } catch (_) {}
  console.log(`[Scheduling] Removed: ${plistId}`)
}

module.exports = { createSchedule, cancelSchedule, calculateNextRun, generatePlistId }
