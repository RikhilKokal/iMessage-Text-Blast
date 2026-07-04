const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { detectNodePath } = require('./nodePath')
const { calculateNextRun } = require('./sendCore')

const execFileAsync = promisify(execFile)

const LAUNCH_AGENT_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents')

// ── Node binary detection ─────────────────────────────────────────────────────
// Detect once at module-load time so we can embed the path in plists.
const NODE_PATH = detectNodePath()
console.log(`[Scheduling] Using node binary: ${NODE_PATH}`)

// ── ID / next-run helpers ─────────────────────────────────────────────────────

function generatePlistId(groupId) {
  return `com.imessage-scheduler.send-${groupId}-${Date.now()}`
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
