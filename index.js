const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron')
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

ipcMain.handle('send:toGroup', async (event, groupId, templateText, memberIds, attachmentPath) => {
  // Fetch members fresh from DB, optionally filtered to a subset
  const allMembers = db.getGroupMembers(groupId)
  let members = allMembers
  if (memberIds && memberIds.length > 0) {
    const idSet = new Set(memberIds)
    members = allMembers.filter(m => idSet.has(m.id))
  }
  if (!members.length) return { succeeded: 0, failed: 0, errors: [] }

  // Log a pending attempt before sending, then snapshot the recipient list
  const { id: historyId } = db.logSendAttempt(groupId, templateText, 'pending', null, allMembers.length, attachmentPath || null)
  db.logSendRecipients(historyId, members, allMembers)

  const { succeeded, failed } = await iMessageService.sendToGroup(
    members,
    templateText,
    (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('send:progress', progress)
      }
    },
    attachmentPath || null,
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

const HELPER_SCRIPT_PATH   = path.join(__dirname, 'scheduled-send-helper.js')
const ATTACHMENTS_DIR      = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Bulk Scheduler', 'attachments')

function ensureAttachmentsDir() {
  if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })
}

function copyAttachmentsToStorage(paths) {
  if (!paths?.length) return []
  ensureAttachmentsDir()
  const { randomUUID } = require('crypto')
  return paths.map(src => {
    if (!src || !fs.existsSync(src)) return null
    const ext  = path.extname(src)
    const dest = path.join(ATTACHMENTS_DIR, `${randomUUID()}${ext}`)
    fs.copyFileSync(src, dest)
    return dest
  }).filter(Boolean)
}

function deleteStoredAttachments(raw) {
  if (!raw) return
  let paths
  try { paths = JSON.parse(raw) } catch { paths = [raw] }
  for (const p of paths) {
    if (p && p.startsWith(ATTACHMENTS_DIR)) {
      try { fs.unlinkSync(p) } catch (_) {}
    }
  }
}

ipcMain.handle('scheduling:createScheduledSend', async (_event, groupId, templateText, scheduleType, scheduleData, memberIds, attachmentPaths) => {
  const plistId   = schedulingService.generatePlistId(groupId)
  const nextRun   = schedulingService.calculateNextRun(scheduleType, scheduleData)
  const stored    = copyAttachmentsToStorage(attachmentPaths || [])

  db.createScheduledSend(groupId, templateText, scheduleType, scheduleData, nextRun, plistId, memberIds, stored.length ? stored : null)
  await schedulingService.createSchedule(plistId, HELPER_SCRIPT_PATH, nextRun, scheduleType, scheduleData)

  return { plistId, nextRun: nextRun.toISOString() }
})

ipcMain.handle('scheduling:cancelScheduledSend', async (_event, id, plistId) => {
  const row = db.getScheduledSendById(id)
  const dbPlistId = db.cancelScheduledSend(id)
  if (row?.attachment_path) deleteStoredAttachments(row.attachment_path)
  const resolvedPlistId = plistId || dbPlistId
  if (resolvedPlistId) await schedulingService.cancelSchedule(resolvedPlistId)
  return true
})

ipcMain.handle('scheduling:updateScheduledSend', async (_event, id, plistId, templateText, scheduleType, scheduleData, memberIds, attachmentPaths) => {
  const old = db.getScheduledSendById(id)
  if (plistId) await schedulingService.cancelSchedule(plistId)

  const stored  = copyAttachmentsToStorage(attachmentPaths || [])
  const nextRun = schedulingService.calculateNextRun(scheduleType, scheduleData)
  await schedulingService.createSchedule(plistId, HELPER_SCRIPT_PATH, nextRun, scheduleType, scheduleData)

  db.updateScheduledSendDetails(id, templateText, scheduleType, scheduleData, nextRun, memberIds, stored.length ? stored : null)

  // Delete old copies only after DB is updated with new paths
  if (old?.attachment_path) deleteStoredAttachments(old.attachment_path)

  return { nextRun: nextRun.toISOString() }
})

ipcMain.handle('db:getScheduledSends', (_event, groupId) =>
  db.getScheduledSends(groupId ?? null)
)

ipcMain.handle('dialog:openFile', async (_event, options) => {
  const result = await dialog.showOpenDialog(options || {})
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openAttachment', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp', 'tiff'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled) return null
  return result.filePaths
})


// ── Attachment error queue ───────────────────────────────────────────────────

const ERROR_QUEUE_PATH = path.join(os.homedir(), '.imsg-attachment-errors.json')

function drainAttachmentErrors() {
  try {
    const raw = fs.readFileSync(ERROR_QUEUE_PATH, 'utf8')
    const errors = JSON.parse(raw)
    if (errors.length && mainWindow && !mainWindow.isDestroyed()) {
      fs.writeFileSync(ERROR_QUEUE_PATH, '[]', 'utf8')
      mainWindow.webContents.send('attachment:errors', errors)
    }
  } catch (_) {}
}

// ── Send text only (attachment missing recovery) ─────────────────────────────

ipcMain.handle('scheduling:sendTextOnly', async (_e, scheduledSendId) => {
  const send = db.getScheduledSendById(scheduledSendId)
  if (!send) throw new Error('Scheduled send not found')

  const allMembers = db.getGroupMembers(send.group_id)
  const memberIds = send.member_ids ? new Set(JSON.parse(send.member_ids).map(String)) : null
  const members = memberIds ? allMembers.filter(m => memberIds.has(String(m.id))) : allMembers

  const { succeeded, failed } = await iMessageService.sendToGroup(
    members,
    send.template_text,
    null,  // no progress callback needed
    null,  // no attachments — they were missing
  )

  // Persist auto-routing
  for (const m of succeeded.filter(m => m.autoRouted)) db.setContactService(m.id, 'SMS')

  // Log to history with no attachment_path (they were never sent)
  const status = failed.length === 0 ? 'sent' : succeeded.length > 0 ? 'partial' : 'failed'
  const errorLog = failed.length > 0 ? failed.map(f => `${f.member.name}: ${f.error}`).join('\n') : null
  const { id: historyId } = db.logSendAttempt(send.group_id, send.template_text, status, errorLog, allMembers.length, null)
  db.logSendRecipients(historyId, members, allMembers)

  // Clean up stored attachment copies and remove the scheduled send entirely
  deleteStoredAttachments(send.attachment_path)
  db.cancelScheduledSend(scheduledSendId)

  return { succeeded: succeeded.length, failed: failed.length }
})

// ── App lifecycle ────────────────────────────────────────────────────────────

app.setAppUserModelId('com.imessage.bulk-scheduler')

app.whenReady().then(() => {
  // Init DB synchronously before window opens so tables exist
  db.init()

  createWindow()

  // Drain any attachment errors that fired while the app was closed
  mainWindow.webContents.once('did-finish-load', drainAttachmentErrors)
  mainWindow.on('focus', drainAttachmentErrors)

  // Watch a sentinel file that scheduled-send-helper touches when it finishes.
  // We watch this instead of app.db to avoid false-firing on the app's own writes.
  const SENTINEL_PATH = path.join(os.homedir(), '.imsg-scheduled-changed')
  fs.watchFile(SENTINEL_PATH, { interval: 2000, persistent: false }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        let result = null
        try { result = JSON.parse(fs.readFileSync(SENTINEL_PATH, 'utf8')) } catch (_) {}

        // Attachment error — notify and forward to renderer
        if (result?.isError && result.type === 'attachmentMissing') {
          // Clear the queue file so drainAttachmentErrors doesn't re-deliver on focus
          try { fs.writeFileSync(ERROR_QUEUE_PATH, '[]', 'utf8') } catch (_) {}
          mainWindow.webContents.send('attachment:errors', [result])
          if (Notification.isSupported()) {
            const group = result.groupName ?? 'scheduled message'
            new Notification({
              title: 'Scheduled send failed — attachment missing',
              body: `The image(s) for "${group}" could not be found. Open the app to review.`,
              urgency: 'critical',
            }).show()
          }
          return
        }

        mainWindow.webContents.send('db:external-change', result)

        if (result && !mainWindow.isFocused() && Notification.isSupported()) {
          const noun = result.succeeded === 1 ? 'person' : 'people'
          const group = result.groupName ?? 'group'
          const body = result.failed === 0
            ? `Delivered to ${result.succeeded} ${noun}.`
            : `Sent ${result.succeeded}, failed ${result.failed}.`
          new Notification({ title: `Scheduled message to ${group} sent`, body }).show()
        }
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
