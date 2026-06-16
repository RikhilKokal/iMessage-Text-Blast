const Database = require('better-sqlite3')
const os   = require('os')
const path = require('path')

const core = require('./sendCore')

const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')

// Provide a chatDbQuery function using better-sqlite3.
// Opens and closes a read-only connection per call so the DB handle
// is never held across the async poll loop (avoids locking issues).
function chatDbQuery(sql) {
  const db = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(sql).all().map(row => Object.values(row))
  } finally {
    db.close()
  }
}

/**
 * Send a templated message to every member.
 * @param {Array}    members
 * @param {string}   templateText
 * @param {Function} [onProgress]  callback({ sent, failed, total, name, via })
 */
async function sendToGroup(members, templateText, onProgress = null) {
  // Remap member.service → member fields expected by sendCore (uses member.service)
  return core.sendToGroup(members, templateText, chatDbQuery, { onProgress })
}

async function sendMessage(phone, message, preferredService = 'iMessage') {
  return core.sendMessage(phone, message, preferredService, chatDbQuery)
}

module.exports = {
  sendToGroup,
  sendMessage,
  renderTemplate:     core.renderTemplate,
  normalisePhone:     core.normalisePhone,
  isMessagesRunning:  core.isMessagesRunning,
  openMessages:       core.openMessages,
}
