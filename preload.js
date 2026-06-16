const { contextBridge, ipcRenderer } = require('electron')

// Expose a safe, typed API to the renderer process.
// All IPC channels are explicitly allowlisted here.
contextBridge.exposeInMainWorld('api', {
  // ── Contacts ──────────────────────────────────────────────
  diagnoseContacts: () =>
    ipcRenderer.invoke('contacts:diagnose'),

  syncContactsFromMacOS: () =>
    ipcRenderer.invoke('contacts:syncFromMacOS'),

  importCSV: (filePath) =>
    ipcRenderer.invoke('contacts:importCSV', filePath),

  // ── Database ──────────────────────────────────────────────
  getContacts: () =>
    ipcRenderer.invoke('db:getContacts'),
  getContactsByIds: (ids) =>
    ipcRenderer.invoke('db:getContactsByIds', ids),

  addContact: (name, phone, email, source) =>
    ipcRenderer.invoke('db:addContact', name, phone, email, source),

  deleteContact: (id) =>
    ipcRenderer.invoke('db:deleteContact', id),

  // ── File dialogs ─────────────────────────────────────────
  openFileDialog: (options) =>
    ipcRenderer.invoke('dialog:openFile', options),

  // ── Groups ────────────────────────────────────────────────
  createGroup: (name) =>
    ipcRenderer.invoke('db:createGroup', name),

  getGroups: () =>
    ipcRenderer.invoke('db:getGroups'),

  getGroupById: (id) =>
    ipcRenderer.invoke('db:getGroupById', id),

  updateGroupName: (id, newName) =>
    ipcRenderer.invoke('db:updateGroupName', id, newName),

  deleteGroup: (id) =>
    ipcRenderer.invoke('db:deleteGroup', id),

  // ── Group Members ─────────────────────────────────────────
  getGroupMembers: (groupId) =>
    ipcRenderer.invoke('db:getGroupMembers', groupId),

  addMemberToGroup: (groupId, contactId) =>
    ipcRenderer.invoke('db:addMemberToGroup', groupId, contactId),

  removeMemberFromGroup: (groupId, contactId) =>
    ipcRenderer.invoke('db:removeMemberFromGroup', groupId, contactId),

  setContactService: (contactId, service) =>
    ipcRenderer.invoke('db:setContactService', contactId, service),

  checkCapability: (members) =>
    ipcRenderer.invoke('contacts:checkCapability', members),

  // ── Send ──────────────────────────────────────────────────
  sendToGroup: (groupId, templateText, memberIds) =>
    ipcRenderer.invoke('send:toGroup', groupId, templateText, memberIds),

  onSendProgress: (callback) =>
    ipcRenderer.on('send:progress', (_event, data) => callback(data)),

  offSendProgress: () => {
    ipcRenderer.removeAllListeners('send:progress')
  },

  logSendAttempt: (groupId, templateText, status, errorLog) =>
    ipcRenderer.invoke('db:logSendAttempt', groupId, templateText, status, errorLog),

  getSendHistory: (groupId, limit) =>
    ipcRenderer.invoke('db:getSendHistory', groupId, limit),
  clearSendHistory: () =>
    ipcRenderer.invoke('db:clearSendHistory'),
  getSendRecipients: (sendHistoryId) =>
    ipcRenderer.invoke('db:getSendRecipients', sendHistoryId),

  // ── Scheduling ────────────────────────────────────────────
  createScheduledSend: (groupId, templateText, scheduleType, scheduleData, memberIds) =>
    ipcRenderer.invoke('scheduling:createScheduledSend', groupId, templateText, scheduleType, scheduleData, memberIds),

  // id = DB row id, plistId = launchd_plist_id string
  cancelScheduledSend: (id, plistId) =>
    ipcRenderer.invoke('scheduling:cancelScheduledSend', id, plistId),

  updateScheduledSend: (id, plistId, templateText, scheduleType, scheduleData, memberIds) =>
    ipcRenderer.invoke('scheduling:updateScheduledSend', id, plistId, templateText, scheduleType, scheduleData, memberIds),

  getScheduledSends: (groupId) =>
    ipcRenderer.invoke('db:getScheduledSends', groupId),

  checkFda: () =>
    ipcRenderer.invoke('system:checkFda'),

  openFdaSettings: () =>
    ipcRenderer.invoke('system:openFdaSettings'),

  onDbExternalChange: (cb) =>
    ipcRenderer.on('db:external-change', cb),
})
