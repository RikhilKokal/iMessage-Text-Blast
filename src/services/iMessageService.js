const Database = require('better-sqlite3')
const os   = require('os')
const path = require('path')

const core = require('./sendCore')

const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')

function chatDbQuery(sql) {
  const db = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true })
  try {
    return db.prepare(sql).all().map(row => Object.values(row))
  } finally {
    db.close()
  }
}

async function sendToGroup(members, templateText, onProgress = null, attachmentPath = null) {
  return core.sendToGroup(members, templateText, chatDbQuery, { onProgress, attachmentPath })
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
