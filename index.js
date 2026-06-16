const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)

// Initialize database before anything else
const db = require('./db/database')
const contactsService = require('./src/services/contactsService')
const csvService = require('./src/services/csvService')
const iMessageService = require('./src/services/iMessageService')
const schedulingService = require('./src/services/schedulingService')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS native feel
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,  // keep renderer sandboxed
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    // win.webContents.openDevTools() // uncomment to debug
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  // Cmd-W hides the window instead of destroying it, so Vue state (loaded groups, etc.)
  // persists while the app is still running. Cmd-Q sets isQuitting and bypasses this.
  if (process.platform === 'darwin') {
    win.on('close', (e) => {
      if (!app.isQuitting) {
        e.preventDefault()
        win.hide()
      }
    })
  }

  mainWindow = win
  return win
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

// Contacts — diagnostic: check swift accessibility from Electron's process
ipcMain.handle('contacts:diagnose', async () => {
  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execFileAsync = promisify(execFile)
  const results = {}
  try {
    const r = await execFileAsync('swift', ['--version'], { timeout: 5000 })
    results.swiftVersion = r.stdout.trim() || r.stderr.trim()
  } catch (e) {
    results.swiftError = e.message
  }
  results.PATH = process.env.PATH
  return results
})

ipcMain.handle('contacts:syncFromMacOS', async () => {
  try {
    return await contactsService.syncFromMacOS()
  } catch (err) {
    console.error('[IPC] contacts:syncFromMacOS error:', err)
    return { count: 0, denied: false, error: err.message }
  }
})

ipcMain.handle('contacts:importCSV', async (_event, filePath) => {
  try {
    return csvService.importFromCSV(filePath)
  } catch (err) {
    console.error('[IPC] contacts:importCSV error:', err)
    return { success: 0, skipped: 0, errors: [err.message] }
  }
})

// Database — contacts CRUD
ipcMain.handle('db:getContacts', () => db.getContacts())
ipcMain.handle('db:getContactsByIds', (_event, ids) => db.getContactsByIds(ids))

ipcMain.handle('db:addContact', (_event, name, phone, email, source) => {
  return db.addContact(name, phone, email, source)
})

ipcMain.handle('db:deleteContact', (_event, id) => {
  db.deleteContact(id)
  return true
})

// ── Groups ────────────────────────────────────────────────────────────────────

ipcMain.handle('db:createGroup', (_event, name) => db.createGroup(name))
ipcMain.handle('db:getGroups', () => db.getGroups())
ipcMain.handle('db:getGroupById', (_event, id) => db.getGroupById(id))
ipcMain.handle('db:updateGroupName', (_event, id, newName) => db.updateGroupName(id, newName))
ipcMain.handle('db:deleteGroup', (_event, id) => db.deleteGroup(id))

// ── Group Members ─────────────────────────────────────────────────────────────

ipcMain.handle('db:getGroupMembers', (_event, groupId) => db.getGroupMembers(groupId))
ipcMain.handle('db:addMemberToGroup', (_event, groupId, contactId) => {
  db.addMemberToGroup(groupId, contactId)
  // Check capability for this contact immediately so the chip is ready when the member list reloads
  const contact = db.getContacts().find(c => c.id === contactId)
  if (contact) checkCapabilitySync([contact])
  return true
})
ipcMain.handle('db:removeMemberFromGroup', (_event, groupId, contactId) => db.removeMemberFromGroup(groupId, contactId))
ipcMain.handle('db:setContactService', (_event, contactId, service) => { db.setContactService(contactId, service); return true })

// ── iMessage capability check ─────────────────────────────────────────────────

const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')

/**
 * Query chat.db to determine iMessage/SMS capability for a list of members.
 * Updates service_confirmed in the app DB for any member where history is found.
 * Safe to call at any time — silently no-ops if FDA is not granted.
 */
function checkCapabilitySync(members) {
  const Database = require('better-sqlite3')
  let chatDb
  try {
    chatDb = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true })
  } catch {
    return members.map(m => ({ id: m.id, service: null, checked: false }))
  }

  const stmtIMessagePhone = chatDb.prepare(`
    SELECT m.rowid FROM message m
    JOIN handle h ON h.rowid = m.handle_id
    WHERE h.service = 'iMessage'
      AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(h.id, '+1', ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE ?
      AND (m.is_from_me = 0 OR (m.is_delivered = 1 AND m.error = 0))
    LIMIT 1
  `)
  const stmtIMessageEmail = chatDb.prepare(`
    SELECT m.rowid FROM message m
    JOIN handle h ON h.rowid = m.handle_id
    WHERE h.service = 'iMessage'
      AND lower(h.id) = lower(?)
      AND (m.is_from_me = 0 OR (m.is_delivered = 1 AND m.error = 0))
    LIMIT 1
  `)
  const stmtSMSPhone = chatDb.prepare(`
    SELECT m.rowid FROM message m
    JOIN handle h ON h.rowid = m.handle_id
    WHERE h.service != 'iMessage'
      AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(h.id, '+1', ''), '-', ''), ' ', ''), '(', ''), ')', '') LIKE ?
      AND m.is_from_me = 1 AND m.error = 0
    LIMIT 1
  `)

  const results = []
  try {
    for (const member of members) {
      const suffix = (member.phone || '').replace(/\D/g, '').slice(-10)
      let confirmedIMessage = suffix ? stmtIMessagePhone.get(`%${suffix}`) : null
      if (!confirmedIMessage && member.email) confirmedIMessage = stmtIMessageEmail.get(member.email)
      const confirmedSMS = !confirmedIMessage && suffix ? stmtSMSPhone.get(`%${suffix}`) : null

      let service = null
      if (confirmedIMessage) service = 'iMessage'
      else if (confirmedSMS)  service = 'SMS'

      if (service) db.setContactService(member.id, service)
      results.push({ id: member.id, service, checked: !!service })
    }
  } finally {
    chatDb.close()
  }
  return results
}

ipcMain.handle('contacts:checkCapability', async (_event, members) => checkCapabilitySync(members))

// ── Send ──────────────────────────────────────────────────────────────────────

ipcMain.handle('send:toGroup', async (event, groupId, templateText, memberIds) => {
  // Fetch members fresh from DB, optionally filtered to a subset
  const allMembers = db.getGroupMembers(groupId)
  let members = allMembers
  if (memberIds && memberIds.length > 0) {
    const idSet = new Set(memberIds)
    members = allMembers.filter(m => idSet.has(m.id))
  }
  if (!members.length) return { succeeded: 0, failed: 0, errors: [] }

  // Log a pending attempt before sending, then snapshot the recipient list
  const { id: historyId } = db.logSendAttempt(groupId, templateText, 'pending', null, allMembers.length)
  db.logSendRecipients(historyId, members, allMembers)

  const { succeeded, failed } = await iMessageService.sendToGroup(
    members,
    templateText,
    (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('send:progress', progress)
      }
    },
  )

  // Persist automatic iMessage→SMS switches so future sends go straight to SMS
  const autoRouted = succeeded.filter(m => m.autoRouted)
  for (const member of autoRouted) {
    db.setContactService(member.id, 'SMS')
  }

  // Update history record
  const status   = failed.length === 0 ? 'sent' : succeeded.length > 0 ? 'partial' : 'failed'
  const errorLog = failed.length > 0
    ? failed.map(f => `${f.member.name} (${f.member.phone}): ${f.error}`).join('\n')
    : null

  db.updateSendStatus(historyId, status, errorLog, new Date().toISOString())

  return {
    succeeded:   succeeded.length,
    failed:      failed.length,
    errors:      failed.map(f => `${f.member.name}: ${f.error}`),
    autoRouted:  autoRouted.map(m => m.name),   // names of contacts switched to SMS
  }
})

ipcMain.handle('db:logSendAttempt', (_event, groupId, templateText, status, errorLog) =>
  db.logSendAttempt(groupId, templateText, status, errorLog)
)

ipcMain.handle('db:getSendHistory', (_event, groupId, limit) =>
  db.getSendHistory(groupId, limit)
)

ipcMain.handle('db:clearSendHistory', () =>
  db.clearSendHistory()
)

ipcMain.handle('db:getSendRecipients', (_event, sendHistoryId) =>
  db.getSendRecipients(sendHistoryId)
)

ipcMain.handle('system:checkFda', () => {
  const chatDb = require('./src/services/chatDbService')
  return chatDb.checkFdaAccess()
})

ipcMain.handle('system:openFdaSettings', () => {
  const { shell } = require('electron')
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
})


// ── Scheduling ────────────────────────────────────────────────────────────────

// Absolute path to the helper script (same dir as this index.js = app root)
const HELPER_SCRIPT_PATH = path.join(__dirname, 'scheduled-send-helper.js')

ipcMain.handle('scheduling:createScheduledSend', async (_event, groupId, templateText, scheduleType, scheduleData, memberIds) => {
  const plistId = schedulingService.generatePlistId(groupId)
  const nextRun = schedulingService.calculateNextRun(scheduleType, scheduleData)

  // Persist to DB first so the helper can find the record when it fires
  db.createScheduledSend(groupId, templateText, scheduleType, scheduleData, nextRun, plistId, memberIds)

  // Create + load the launchd plist
  await schedulingService.createSchedule(plistId, HELPER_SCRIPT_PATH, nextRun, scheduleType, scheduleData)

  return { plistId, nextRun: nextRun.toISOString() }
})

ipcMain.handle('scheduling:cancelScheduledSend', async (_event, id, plistId) => {
  // Soft-delete in DB and get the plistId (renderer may have already passed it)
  const dbPlistId = db.cancelScheduledSend(id)
  const resolvedPlistId = plistId || dbPlistId
  if (resolvedPlistId) {
    await schedulingService.cancelSchedule(resolvedPlistId)
  }
  return true
})

ipcMain.handle('scheduling:updateScheduledSend', async (_event, id, plistId, templateText, scheduleType, scheduleData, memberIds) => {
  // Cancel old launchd job
  if (plistId) await schedulingService.cancelSchedule(plistId)

  // Calculate new next run and create a new launchd job with the same plistId
  const nextRun = schedulingService.calculateNextRun(scheduleType, scheduleData)
  await schedulingService.createSchedule(plistId, HELPER_SCRIPT_PATH, nextRun, scheduleType, scheduleData)

  // Update DB record
  db.updateScheduledSendDetails(id, templateText, scheduleType, scheduleData, nextRun, memberIds)
  return { nextRun: nextRun.toISOString() }
})

ipcMain.handle('db:getScheduledSends', (_event, groupId) =>
  db.getScheduledSends(groupId ?? null)
)

// File dialog (for CSV picker)
ipcMain.handle('dialog:openFile', async (_event, options) => {
  const result = await dialog.showOpenDialog(options || {})
  return result.canceled ? null : result.filePaths[0]
})

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Init DB synchronously before window opens so tables exist
  db.init()

  createWindow()

  // Watch a sentinel file that scheduled-send-helper touches when it finishes.
  // We watch this instead of app.db to avoid false-firing on the app's own writes.
  const SENTINEL_PATH = path.join(os.homedir(), '.imsg-scheduled-changed')
  fs.watchFile(SENTINEL_PATH, { interval: 2000, persistent: false }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        let result = null
        try { result = JSON.parse(fs.readFileSync(SENTINEL_PATH, 'utf8')) } catch (_) {}
        mainWindow.webContents.send('db:external-change', result)
      }
    }
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
    } else {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
