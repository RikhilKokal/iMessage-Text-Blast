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
const { BUFFER_DONE_PATH } = require('./src/services/sendCore')
const CH = require('./src/shared/ipcChannels')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Set app name for dock and menus
app.name = 'iMessage Text Blast'

let mainWindow = null
let macNotifsEnabled = false

ipcMain.on(CH.SYSTEM_SET_MAC_NOTIFS, (_e, enabled) => { macNotifsEnabled = enabled })

ipcMain.handle(CH.SYSTEM_SEND_TEST_NOTIF, () => {
  if (Notification.isSupported()) {
    new Notification({
      title: 'iMessage Text Blast',
      body: "Notifications are on. You'll be alerted when sends complete.",
    }).show()
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS native feel
    icon: path.join(__dirname, 'resources', 'icon.icns'), // use app icon
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
ipcMain.handle(CH.CONTACTS_DIAGNOSE, async () => {
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

ipcMain.handle(CH.CONTACTS_SYNC_FROM_MACOS, async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
    return await contactsService.syncFromMacOS()
  } catch (err) {
    console.error('[IPC] contacts:syncFromMacOS error:', err)
    return { count: 0, denied: false, error: err.message }
  }
})

ipcMain.handle(CH.CONTACTS_GET_ME, async () => {
  try { return await contactsService.getMeContact() } catch { return null }
})

ipcMain.handle(CH.CONTACTS_PARSE_CSV, async (_event, filePath) => {
  try {
    return csvService.parseCSVForPreview(filePath)
  } catch (err) {
    console.error('[IPC] contacts:parseCSV error:', err)
    return { error: err.message, rows: [] }
  }
})

ipcMain.handle(CH.CONTACTS_IMPORT_CSV, async (_event, filePath) => {
  try {
    return csvService.importFromCSV(filePath)
  } catch (err) {
    console.error('[IPC] contacts:importCSV error:', err)
    return { success: 0, skipped: 0, errors: [err.message] }
  }
})

// Database — contacts CRUD
ipcMain.handle(CH.DB_GET_CONTACTS, () => db.getContacts())
ipcMain.handle(CH.DB_GET_CONTACTS_BY_IDS, (_event, ids) => db.getContactsByIds(ids))
ipcMain.handle(CH.DB_GET_CONTACT_BY_PHONE, (_event, phone) => db.getContactByPhone(phone))

ipcMain.handle(CH.DB_ADD_CONTACT, (_event, name, phone, email, source) => {
  return db.addContact(name, phone, email, source)
})

ipcMain.handle(CH.DB_DELETE_CONTACT, (_event, id) => {
  db.deleteContact(id)
  return true
})

// ── Groups ────────────────────────────────────────────────────────────────────

ipcMain.handle(CH.DB_CREATE_GROUP, (_event, name) => db.createGroup(name))
ipcMain.handle(CH.DB_GET_GROUPS, () => db.getGroups())
ipcMain.handle(CH.DB_GET_GROUP_BY_ID, (_event, id) => db.getGroupById(id))
ipcMain.handle(CH.DB_UPDATE_GROUP_NAME, (_event, id, newName) => db.updateGroupName(id, newName))
ipcMain.handle(CH.DB_DELETE_GROUP, (_event, id) => db.deleteGroup(id))

// ── Group Members ─────────────────────────────────────────────────────────────

ipcMain.handle(CH.DB_GET_GROUP_MEMBERS, (_event, groupId) => db.getGroupMembers(groupId))
ipcMain.handle(CH.DB_ADD_MEMBER_TO_GROUP, (_event, groupId, contactId) => {
  db.addMemberToGroup(groupId, contactId)
  // Check capability for this contact immediately so the chip is ready when the member list reloads
  const contact = db.getContacts().find(c => c.id === contactId)
  if (contact) checkCapabilitySync([contact])
  return true
})
ipcMain.handle(CH.DB_REMOVE_MEMBER_FROM_GROUP, (_event, groupId, contactId) => db.removeMemberFromGroup(groupId, contactId))
ipcMain.handle(CH.DB_SET_CONTACT_SERVICE, (_event, contactId, service) => { db.setContactService(contactId, service); return true })
ipcMain.handle(CH.DB_IS_CONTACT_IN_GROUP, (_event, groupId, contactId) => db.isContactInGroup(groupId, contactId))

ipcMain.handle(CH.DB_GET_CHAT_GROUPS, () => {
  try {
    return require('./src/services/chatGroupsService').listGroupChats()
  } catch (err) {
    console.error('[IPC] db:getChatGroups error:', err)
    return []
  }
})
ipcMain.handle(CH.DB_REFRESH_CHAT_GROUPS, () => {
  try {
    const { chats, updated } = require('./src/services/chatGroupsService').refreshGroupChats()
    return { count: chats.length, updated }
  } catch (err) {
    console.error('[IPC] db:refreshChatGroups error:', err)
    return { count: 0, updated: 0, error: err.message }
  }
})
ipcMain.handle(CH.DB_ADD_CHAT_GROUP_TO_GROUP, (_event, groupId, chatIdentifier, displayName, participantHandles) => {
  db.addChatGroupToGroup(groupId, chatIdentifier, displayName, participantHandles)
  return true
})
ipcMain.handle(CH.DB_REMOVE_CHAT_GROUP_FROM_GROUP, (_event, groupId, chatGroupMemberId) => {
  db.removeChatGroupFromGroup(groupId, chatGroupMemberId)
  return true
})

// ── Tags ──────────────────────────────────────────────────────────────────────

ipcMain.handle(CH.TAG_GET_ALL_FOR_GROUP, (_e, groupId) => db.getTagsForGroup(groupId))
ipcMain.handle(CH.TAG_CREATE, (_e, groupId, name) => db.createTag(groupId, name))
ipcMain.handle(CH.TAG_RENAME, (_e, tagId, newName) => db.renameTag(tagId, newName))
ipcMain.handle(CH.TAG_DELETE, (_e, tagId) => { db.deleteTag(tagId); return true })
ipcMain.handle(CH.TAG_ADD_TO_MEMBER, (_e, tagId, memberId) => { db.addTagToMember(tagId, memberId); return true })
ipcMain.handle(CH.TAG_REMOVE_FROM_MEMBER, (_e, tagId, memberId) => { db.removeTagFromMember(tagId, memberId); return true })
ipcMain.handle(CH.TAG_SET_MEMBERS, (_e, tagId, memberIds) => { db.setTagMembers(tagId, memberIds); return true })

// ── Token Overrides ───────────────────────────────────────────────────────────

ipcMain.handle(CH.CONTACT_GET_TOKEN_OVERRIDES, (_e, contactId) => db.getContactTokenOverrides(contactId))
ipcMain.handle(CH.CONTACT_SAVE_TOKEN_OVERRIDES, (_e, contactId, overrides) => db.saveContactTokenOverrides(contactId, overrides))
ipcMain.handle(CH.CONTACT_DELETE_TOKEN_OVERRIDES, (_e, contactId) => db.deleteContactTokenOverrides(contactId))

// ── Empty Value Defaults ──────────────────────────────────────────────────────

ipcMain.handle(CH.EMPTY_DEFAULTS_GET_TOKEN_OVERRIDES, (_e) => db.getEmptyValueDefaults())
ipcMain.handle(CH.EMPTY_DEFAULTS_SAVE_TOKEN_OVERRIDES, (_e, overrides) => db.saveEmptyValueDefaults(overrides))
ipcMain.handle(CH.EMPTY_DEFAULTS_DELETE_TOKEN_OVERRIDES, (_e) => db.deleteEmptyValueDefaults())

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
      const confirmedIMessage = suffix ? stmtIMessagePhone.get(`%${suffix}`) : null
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

ipcMain.handle(CH.CONTACTS_CHECK_CAPABILITY, async (_event, members) => checkCapabilitySync(members))

// ── Send ──────────────────────────────────────────────────────────────────────

function dedupByPhone(arr) {
  const seen = new Set()
  return arr.filter(m => seen.has(m.phone) ? false : (seen.add(m.phone), true))
}

ipcMain.handle(CH.SEND_TO_GROUP, async (event, groupId, templateText, memberIds, attachmentPath, delaySeconds = 0) => {
  // Fetch members fresh from DB, optionally filtered to a subset
  const allMembers = dedupByPhone(db.getGroupMembers(groupId))
  let members = allMembers
  if (memberIds && memberIds.length > 0) {
    const idSet = new Set(memberIds)
    members = allMembers.filter(m => idSet.has(m.id))
  }
  if (!members.length) return { succeeded: 0, failed: 0, errors: [] }

  // Fetch persistent token overrides for all contact members
  const memberOverrides = new Map()
  for (const member of members) {
    if (member.type !== 'group_chat') {
      const overrides = db.getContactTokenOverrides(member.id)
      if (Object.keys(overrides).length > 0) {
        memberOverrides.set(member.id, overrides)
      }
    }
  }

  // Fetch empty value defaults
  const emptyDefaults = db.getEmptyValueDefaults()

  // Log a pending attempt before sending, then snapshot the recipient list
  const { id: historyId } = db.logSendAttempt(groupId, templateText, 'pending', null, allMembers.length, attachmentPath || null)
  db.logSendRecipients(historyId, members, allMembers)

  const result = await iMessageService.sendToGroup(
    members,
    templateText,
    (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(CH.SEND_PROGRESS, progress)
      }
    },
    attachmentPath || null,
    delaySeconds,
    memberOverrides,
    emptyDefaults,
  )

  // Buffered sends run in a detached helper process — log optimistically and return early
  if (result.buffered) {
    db.updateSendStatus(historyId, 'sent', null, new Date().toISOString())
    return { succeeded: members.length, failed: 0, errors: [], autoRouted: [], buffered: true }
  }

  const { succeeded, failed } = result

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
    autoRouted:  autoRouted.map(m => m.name),
    buffered:    false,
  }
})

// ── Templates ─────────────────────────────────────────────────────────────────

ipcMain.handle(CH.TEMPLATE_GET_ALL, () => db.getTemplates())
ipcMain.handle(CH.TEMPLATE_GET_BY_ID, (_e, id) => db.getTemplateById(id))

ipcMain.handle(CH.TEMPLATE_CREATE, (_e, name, templateText, attachmentPaths) => {
  const stored = copyAttachmentsToStorage(attachmentPaths)
  const json = stored.length ? JSON.stringify(stored) : null
  return db.createTemplate(name, templateText, json)
})

ipcMain.handle(CH.TEMPLATE_UPDATE, (_e, id, name, templateText, attachmentPaths) => {
  const existing = db.getTemplateById(id)
  if (attachmentPaths !== undefined) {
    deleteStoredAttachments(existing?.attachment_path)
    const stored = copyAttachmentsToStorage(attachmentPaths)
    const json = stored.length ? JSON.stringify(stored) : null
    db.updateTemplate(id, name, templateText, json)
  } else {
    db.updateTemplate(id, name, templateText, existing?.attachment_path ?? null)
  }
})

ipcMain.handle(CH.TEMPLATE_DELETE, (_e, id) => {
  const tmpl = db.getTemplateById(id)
  deleteStoredAttachments(tmpl?.attachment_path)
  db.deleteTemplate(id)
})

ipcMain.handle(CH.TEMPLATE_SEND, async (event, templateId, mode, ids, delaySeconds = 0) => {
  const tmpl = db.getTemplateById(templateId)
  if (!tmpl) throw new Error('Template not found')
  const attachments = tmpl.attachment_path ? JSON.parse(tmpl.attachment_path) : null

  if (mode === 'groups') {
    const results = []
    for (const groupId of ids) {
      const allMembers = dedupByPhone(db.getGroupMembers(groupId))
      if (!allMembers.length) { results.push({ groupId, succeeded: 0, failed: 0 }); continue }
      const { id: historyId } = db.logSendAttempt(groupId, tmpl.template_text, 'pending', null, allMembers.length, attachments, tmpl.name)
      db.logSendRecipients(historyId, allMembers, allMembers)
      const result = await iMessageService.sendToGroup(
        allMembers, tmpl.template_text,
        (p) => { if (!event.sender.isDestroyed()) event.sender.send(CH.SEND_PROGRESS, p) },
        attachments, delaySeconds
      )
      if (result.buffered) {
        db.updateSendStatus(historyId, 'sent', null, new Date().toISOString())
        results.push({ groupId, succeeded: allMembers.length, failed: 0 })
      } else {
        const { succeeded, failed } = result
        const autoRouted = succeeded.filter(m => m.autoRouted)
        for (const m of autoRouted) db.setContactService(m.id, 'SMS')
        const status = failed.length === 0 ? 'sent' : succeeded.length > 0 ? 'partial' : 'failed'
        const errorLog = failed.length ? failed.map(f => `${f.member.name}: ${f.error}`).join('\n') : null
        db.updateSendStatus(historyId, status, errorLog, new Date().toISOString())
        results.push({ groupId, succeeded: succeeded.length, failed: failed.length, autoRouted: autoRouted.map(m => m.name) })
      }
    }
    return { mode: 'groups', results, buffered: delaySeconds > 0 }
  } else {
    const members = db.getContactsByIdsAsMember(ids)
    if (!members.length) return { mode: 'contacts', succeeded: 0, failed: 0 }
    const { id: historyId } = db.logSendAttempt(null, tmpl.template_text, 'pending', null, members.length, attachments, tmpl.name)
    db.logSendRecipients(historyId, members, members)
    const result = await iMessageService.sendToGroup(
      members, tmpl.template_text,
      (p) => { if (!event.sender.isDestroyed()) event.sender.send(CH.SEND_PROGRESS, p) },
      attachments, delaySeconds
    )
    if (result.buffered) {
      db.updateSendStatus(historyId, 'sent', null, new Date().toISOString())
      return { mode: 'contacts', succeeded: members.length, failed: 0, autoRouted: [], buffered: true }
    }
    const { succeeded, failed } = result
    const autoRouted = succeeded.filter(m => m.autoRouted)
    for (const m of autoRouted) db.setContactService(m.id, 'SMS')
    const status = failed.length === 0 ? 'sent' : succeeded.length > 0 ? 'partial' : 'failed'
    const errorLog = failed.length ? failed.map(f => `${f.member.name}: ${f.error}`).join('\n') : null
    db.updateSendStatus(historyId, status, errorLog, new Date().toISOString())
    return { mode: 'contacts', succeeded: succeeded.length, failed: failed.length, autoRouted: autoRouted.map(m => m.name), buffered: false }
  }
})

ipcMain.handle(CH.DB_LOG_SEND_ATTEMPT, (_event, groupId, templateText, status, errorLog) =>
  db.logSendAttempt(groupId, templateText, status, errorLog)
)

ipcMain.handle(CH.DB_GET_SEND_HISTORY, (_event, groupId, limit) =>
  db.getSendHistory(groupId, limit)
)

ipcMain.handle(CH.DB_CLEAR_SEND_HISTORY, () =>
  db.clearSendHistory()
)

ipcMain.handle(CH.DB_GET_SEND_RECIPIENTS, (_event, sendHistoryId) =>
  db.getSendRecipients(sendHistoryId)
)

ipcMain.handle(CH.PERMISSIONS_CHECK_APPLESCRIPT, async () => {
  try {
    await execFileAsync('osascript', ['-e', 'tell application "Messages" to get name'], { timeout: 5000 })
    return { granted: true }
  } catch {
    return { granted: false }
  }
})

ipcMain.handle(CH.SYSTEM_OPEN_NOTIFICATIONS_SETTINGS, () => {
  const { shell } = require('electron')
  shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications')
})

ipcMain.handle(CH.SYSTEM_OPEN_CONTACTS_SETTINGS, () => {
  const { shell } = require('electron')
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts')
})

ipcMain.handle(CH.SYSTEM_OPEN_AUTOMATION_SETTINGS, () => {
  const { shell } = require('electron')
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation')
})

ipcMain.handle(CH.SYSTEM_CHECK_FDA, () => {
  const chatDb = require('./src/services/chatDbService')
  return chatDb.checkFdaAccess()
})

ipcMain.handle(CH.SYSTEM_OPEN_FDA_SETTINGS, () => {
  const { shell } = require('electron')
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
})


// ── Scheduling ────────────────────────────────────────────────────────────────

const HELPER_SCRIPT_PATH   = path.join(__dirname, 'scheduled-send-helper.js').replace('/app.asar/', '/app.asar.unpacked/')
const ATTACHMENTS_DIR      = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Text Blast', 'attachments')

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

ipcMain.handle(CH.SCHEDULING_CREATE_SCHEDULED_SEND, async (_event, groupId, templateText, scheduleType, scheduleData, memberIds, attachmentPaths, delaySeconds = 0) => {
  const plistId   = schedulingService.generatePlistId(groupId)
  const nextRun   = schedulingService.calculateNextRun(scheduleType, scheduleData)
  const stored    = copyAttachmentsToStorage(attachmentPaths || [])

  db.createScheduledSend(groupId, templateText, scheduleType, scheduleData, nextRun, plistId, memberIds, stored.length ? stored : null, delaySeconds)
  await schedulingService.createSchedule(plistId, HELPER_SCRIPT_PATH, nextRun, scheduleType, scheduleData)

  return { plistId, nextRun: nextRun.toISOString() }
})

ipcMain.handle(CH.SCHEDULING_CANCEL_SCHEDULED_SEND, async (_event, id, plistId) => {
  const row = db.getScheduledSendById(id)
  const dbPlistId = db.cancelScheduledSend(id)
  if (row?.attachment_path) deleteStoredAttachments(row.attachment_path)
  const resolvedPlistId = plistId || dbPlistId
  if (resolvedPlistId) await schedulingService.cancelSchedule(resolvedPlistId)
  return true
})

ipcMain.handle(CH.SCHEDULING_UPDATE_SCHEDULED_SEND, async (_event, id, plistId, templateText, scheduleType, scheduleData, memberIds, attachmentPaths) => {
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

ipcMain.handle(CH.DB_GET_SCHEDULED_SENDS, (_event, groupId) =>
  db.getScheduledSends(groupId ?? null)
)

ipcMain.handle(CH.DIALOG_OPEN_FILE, async (_event, options) => {
  const result = await dialog.showOpenDialog(options || {})
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(CH.DIALOG_OPEN_ATTACHMENT, async () => {
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
      mainWindow.webContents.send(CH.ATTACHMENT_ERRORS, errors)
    }
  } catch (_) {}
}

// ── Send text only (attachment missing recovery) ─────────────────────────────

ipcMain.handle(CH.SCHEDULING_SEND_TEXT_ONLY, async (_e, scheduledSendId) => {
  const send = db.getScheduledSendById(scheduledSendId)
  if (!send) throw new Error('Scheduled send not found')

  const allMembers = dedupByPhone(db.getGroupMembers(send.group_id))
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

  // Warm the chat-groups cache after the window paints (the underlying chat.db
  // query is synchronous/slow, and FDA may not be granted yet — non-fatal either way).
  mainWindow.webContents.once('did-finish-load', () => {
    try { require('./src/services/chatGroupsService').listGroupChats() }
    catch (err) { console.error('[Startup] chat group cache warm-up failed:', err.message) }
  })

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
          mainWindow.webContents.send(CH.ATTACHMENT_ERRORS, [result])
          if (macNotifsEnabled && Notification.isSupported()) {
            const group = result.groupName ?? 'scheduled message'
            new Notification({
              title: 'Scheduled send failed — attachment missing',
              body: `The image(s) for "${group}" could not be found. Open the app to review.`,
              urgency: 'critical',
            }).show()
          }
          return
        }

        mainWindow.webContents.send(CH.DB_EXTERNAL_CHANGE, result)

        if (result && macNotifsEnabled && !mainWindow.isFocused() && Notification.isSupported()) {
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

  // Watch for buffered-send completion sentinel written by the detached AppleScript.
  function handleBufferDone() {
    if (!fs.existsSync(BUFFER_DONE_PATH)) return
    let result = null
    try { result = JSON.parse(fs.readFileSync(BUFFER_DONE_PATH, 'utf8')) } catch (_) {}
    try { fs.unlinkSync(BUFFER_DONE_PATH) } catch (_) {}
    if (!result || !result.succeeded) return
    const noun = result.succeeded === 1 ? 'message' : 'messages'
    const body = `All ${result.succeeded} ${noun} delivered.`
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CH.BUFFER_COMPLETE, { succeeded: result.succeeded, autoRouted: result.autoRouted ?? [] })
    }
    if (macNotifsEnabled && Notification.isSupported()) {
      new Notification({ title: 'Buffered send complete', body }).show()
    }
  }

  fs.watchFile(BUFFER_DONE_PATH, { interval: 2000, persistent: false }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) handleBufferDone()
  })

  // Drain sentinel if it was written while the app was closed
  mainWindow.webContents.once('did-finish-load', handleBufferDone)

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
