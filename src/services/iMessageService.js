const Database  = require('better-sqlite3')
const os        = require('os')
const path      = require('path')
const fs        = require('fs')
const { spawn } = require('child_process')

const core = require('./sendCore')
const { detectNodePath } = require('./nodePath')

const CHAT_DB_PATH     = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
const APP_DB_PATH      = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Text Blast', 'app.db')
const HELPER_SCRIPT    = path.join(__dirname, '../../buffer-send-helper.js').replace('/app.asar/', '/app.asar.unpacked/')

function chatDbQuery(sql) {
  const db = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(sql).all().map(row => Object.values(row))
  } finally {
    db.close()
  }
}

function appDbQuery(sql) {
  const db = new Database(APP_DB_PATH, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(sql).all().map(row => Object.values(row))
  } finally {
    db.close()
  }
}

function runBufferHelperDetached(members, templateText, delaySeconds, attachmentPath, memberOverrides = new Map(), emptyDefaults = {}) {
  const payload     = JSON.stringify({
    members,
    templateText,
    delaySeconds,
    attachmentPath,
    memberOverrides: Array.from(memberOverrides.entries()),
    emptyDefaults,
  })
  const payloadPath = path.join(os.tmpdir(), `imsg_buffer_payload_${Date.now()}.json`)
  fs.writeFileSync(payloadPath, payload, 'utf8')

  const nodePath = detectNodePath()
  const child    = spawn(nodePath, [HELPER_SCRIPT, payloadPath], { detached: true, stdio: 'ignore' })
  child.unref()
}

async function sendToGroup(members, templateText, onProgress = null, attachmentPath = null, delaySeconds = 0, memberOverrides = new Map(), emptyDefaults = {}) {
  if (delaySeconds > 0) {
    runBufferHelperDetached(members, templateText, delaySeconds, attachmentPath, memberOverrides, emptyDefaults)
    return { succeeded: members.length, failed: 0, buffered: true }
  }
  return core.sendToGroup(members, templateText, chatDbQuery, { onProgress, attachmentPath, delaySeconds, memberOverrides, emptyDefaults, appDbQuery })
}

async function sendMessage(phone, message, preferredService = 'iMessage') {
  return core.sendMessage(phone, message, preferredService, chatDbQuery)
}

module.exports = {
  sendToGroup,
  sendMessage,
  renderTemplate: core.renderTemplate,
  normalisePhone: core.normalisePhone,
}
