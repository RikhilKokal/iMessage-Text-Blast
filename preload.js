const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // ── Contacts ──────────────────────────────────────────────
  diagnoseContacts: () =>
    ipcRenderer.invoke('contacts:diagnose'),

  syncContactsFromMacOS: () =>
    ipcRenderer.invoke('contacts:syncFromMacOS'),
  getMeContact: () =>
    ipcRenderer.invoke('contacts:getMe'),

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
  sendToGroup: (groupId, templateText, memberIds, attachmentPath, delaySeconds = 0) =>
    ipcRenderer.invoke('send:toGroup', groupId, templateText, memberIds, attachmentPath, delaySeconds),

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
  openAttachmentDialog: (maxFiles) =>
    ipcRenderer.invoke('dialog:openAttachment', maxFiles),

  createScheduledSend: (groupId, templateText, scheduleType, scheduleData, memberIds, attachmentPath, delaySeconds = 0) =>
    ipcRenderer.invoke('scheduling:createScheduledSend', groupId, templateText, scheduleType, scheduleData, memberIds, attachmentPath, delaySeconds),

  cancelScheduledSend: (id, plistId) =>
    ipcRenderer.invoke('scheduling:cancelScheduledSend', id, plistId),

  updateScheduledSend: (id, plistId, templateText, scheduleType, scheduleData, memberIds, attachmentPath) =>
    ipcRenderer.invoke('scheduling:updateScheduledSend', id, plistId, templateText, scheduleType, scheduleData, memberIds, attachmentPath),

  getScheduledSends: (groupId) =>
    ipcRenderer.invoke('db:getScheduledSends', groupId),

  checkFda: () =>
    ipcRenderer.invoke('system:checkFda'),

  openFdaSettings: () =>
    ipcRenderer.invoke('system:openFdaSettings'),

  setMacNotifs: (enabled) =>
    ipcRenderer.send('system:setMacNotifs', enabled),

  onDbExternalChange: (cb) =>
    ipcRenderer.on('db:external-change', cb),

  onBufferComplete: (cb) =>
    ipcRenderer.on('buffer:complete', (_e, data) => cb(data)),
  offBufferComplete: () =>
    ipcRenderer.removeAllListeners('buffer:complete'),

  sendTextOnly: (scheduledSendId) =>
    ipcRenderer.invoke('scheduling:sendTextOnly', scheduledSendId),

  onAttachmentErrors: (cb) =>
    ipcRenderer.on('attachment:errors', (_e, errors) => cb(errors)),

  // ── Templates ─────────────────────────────────────────────
  getTemplates: () =>
    ipcRenderer.invoke('template:getAll'),
  getTemplateById: (id) =>
    ipcRenderer.invoke('template:getById', id),
  createTemplate: (name, text, paths) =>
    ipcRenderer.invoke('template:create', name, text, paths),
  updateTemplate: (id, name, text, paths) =>
    ipcRenderer.invoke('template:update', id, name, text, paths),
  deleteTemplate: (id) =>
    ipcRenderer.invoke('template:delete', id),
  templateSend: (tmplId, mode, ids, delaySeconds = 0) =>
    ipcRenderer.invoke('template:send', tmplId, mode, ids, delaySeconds),
})
