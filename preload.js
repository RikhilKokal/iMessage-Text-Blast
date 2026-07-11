const { contextBridge, ipcRenderer } = require('electron')

// Electron's sandboxed preload context can't require() local project files (only the
// 'electron' module is available here), so this must be kept in sync by hand with
// src/shared/ipcChannels.js — the canonical definition used by index.js.
const CH = {
  CONTACTS_DIAGNOSE:        'contacts:diagnose',
  CONTACTS_SYNC_FROM_MACOS: 'contacts:syncFromMacOS',
  CONTACTS_GET_ME:          'contacts:getMe',
  CONTACTS_PARSE_CSV:       'contacts:parseCSV',
  CONTACTS_IMPORT_CSV:      'contacts:importCSV',
  CONTACTS_CHECK_CAPABILITY: 'contacts:checkCapability',

  DB_GET_CONTACTS:          'db:getContacts',
  DB_GET_CONTACTS_BY_IDS:   'db:getContactsByIds',
  DB_GET_CONTACT_BY_PHONE:  'db:getContactByPhone',
  DB_ADD_CONTACT:           'db:addContact',
  DB_DELETE_CONTACT:        'db:deleteContact',

  DB_CREATE_GROUP:          'db:createGroup',
  DB_GET_GROUPS:            'db:getGroups',
  DB_GET_GROUP_BY_ID:       'db:getGroupById',
  DB_UPDATE_GROUP_NAME:     'db:updateGroupName',
  DB_DELETE_GROUP:          'db:deleteGroup',

  DB_GET_GROUP_MEMBERS:        'db:getGroupMembers',
  DB_ADD_MEMBER_TO_GROUP:      'db:addMemberToGroup',
  DB_REMOVE_MEMBER_FROM_GROUP: 'db:removeMemberFromGroup',
  DB_SET_CONTACT_SERVICE:      'db:setContactService',
  DB_IS_CONTACT_IN_GROUP:      'db:isContactInGroup',

  DB_GET_CHAT_GROUPS:              'db:getChatGroups',
  DB_REFRESH_CHAT_GROUPS:          'db:refreshChatGroups',
  DB_ADD_CHAT_GROUP_TO_GROUP:      'db:addChatGroupToGroup',
  DB_REMOVE_CHAT_GROUP_FROM_GROUP: 'db:removeChatGroupFromGroup',

  TAG_GET_ALL_FOR_GROUP:   'tag:getAllForGroup',
  TAG_CREATE:              'tag:create',
  TAG_RENAME:              'tag:rename',
  TAG_DELETE:              'tag:delete',
  TAG_ADD_TO_MEMBER:       'tag:addToMember',
  TAG_REMOVE_FROM_MEMBER:  'tag:removeFromMember',
  TAG_SET_MEMBERS:         'tag:setMembers',

  DIALOG_OPEN_FILE:       'dialog:openFile',
  DIALOG_OPEN_ATTACHMENT: 'dialog:openAttachment',

  SEND_TO_GROUP:         'send:toGroup',
  SEND_PROGRESS:          'send:progress',
  DB_LOG_SEND_ATTEMPT:   'db:logSendAttempt',
  DB_GET_SEND_HISTORY:   'db:getSendHistory',
  DB_CLEAR_SEND_HISTORY: 'db:clearSendHistory',
  DB_GET_SEND_RECIPIENTS: 'db:getSendRecipients',

  SCHEDULING_CREATE_SCHEDULED_SEND: 'scheduling:createScheduledSend',
  SCHEDULING_CANCEL_SCHEDULED_SEND: 'scheduling:cancelScheduledSend',
  SCHEDULING_UPDATE_SCHEDULED_SEND: 'scheduling:updateScheduledSend',
  SCHEDULING_SEND_TEXT_ONLY:        'scheduling:sendTextOnly',
  DB_GET_SCHEDULED_SENDS:           'db:getScheduledSends',

  PERMISSIONS_CHECK_APPLESCRIPT:      'permissions:checkAppleScript',
  SYSTEM_CHECK_FDA:                   'system:checkFda',
  SYSTEM_OPEN_FDA_SETTINGS:           'system:openFdaSettings',
  SYSTEM_SET_MAC_NOTIFS:              'system:setMacNotifs',
  SYSTEM_SEND_TEST_NOTIF:             'system:sendTestNotif',
  SYSTEM_OPEN_CONTACTS_SETTINGS:      'system:openContactsSettings',
  SYSTEM_OPEN_NOTIFICATIONS_SETTINGS: 'system:openNotificationsSettings',
  SYSTEM_OPEN_AUTOMATION_SETTINGS:    'system:openAutomationSettings',

  DB_EXTERNAL_CHANGE: 'db:external-change',
  BUFFER_COMPLETE:    'buffer:complete',
  ATTACHMENT_ERRORS:  'attachment:errors',

  TEMPLATE_GET_ALL:   'template:getAll',
  TEMPLATE_GET_BY_ID: 'template:getById',
  TEMPLATE_CREATE:    'template:create',
  TEMPLATE_UPDATE:    'template:update',
  TEMPLATE_DELETE:    'template:delete',
  TEMPLATE_SEND:      'template:send',
}

contextBridge.exposeInMainWorld('api', {
  // ── Contacts ──────────────────────────────────────────────
  diagnoseContacts: () =>
    ipcRenderer.invoke(CH.CONTACTS_DIAGNOSE),

  syncContactsFromMacOS: () =>
    ipcRenderer.invoke(CH.CONTACTS_SYNC_FROM_MACOS),
  getMeContact: () =>
    ipcRenderer.invoke(CH.CONTACTS_GET_ME),

  parseCSV: (filePath) =>
    ipcRenderer.invoke(CH.CONTACTS_PARSE_CSV, filePath),

  importCSV: (filePath) =>
    ipcRenderer.invoke(CH.CONTACTS_IMPORT_CSV, filePath),

  // ── Database ──────────────────────────────────────────────
  getContacts: () =>
    ipcRenderer.invoke(CH.DB_GET_CONTACTS),
  getContactsByIds: (ids) =>
    ipcRenderer.invoke(CH.DB_GET_CONTACTS_BY_IDS, ids),
  getContactByPhone: (phone) =>
    ipcRenderer.invoke(CH.DB_GET_CONTACT_BY_PHONE, phone),

  addContact: (name, phone, email, source) =>
    ipcRenderer.invoke(CH.DB_ADD_CONTACT, name, phone, email, source),

  deleteContact: (id) =>
    ipcRenderer.invoke(CH.DB_DELETE_CONTACT, id),

  // ── File dialogs ─────────────────────────────────────────
  openFileDialog: (options) =>
    ipcRenderer.invoke(CH.DIALOG_OPEN_FILE, options),

  // ── Groups ────────────────────────────────────────────────
  createGroup: (name) =>
    ipcRenderer.invoke(CH.DB_CREATE_GROUP, name),

  getGroups: () =>
    ipcRenderer.invoke(CH.DB_GET_GROUPS),

  getGroupById: (id) =>
    ipcRenderer.invoke(CH.DB_GET_GROUP_BY_ID, id),

  updateGroupName: (id, newName) =>
    ipcRenderer.invoke(CH.DB_UPDATE_GROUP_NAME, id, newName),

  deleteGroup: (id) =>
    ipcRenderer.invoke(CH.DB_DELETE_GROUP, id),

  // ── Group Members ─────────────────────────────────────────
  getGroupMembers: (groupId) =>
    ipcRenderer.invoke(CH.DB_GET_GROUP_MEMBERS, groupId),

  addMemberToGroup: (groupId, contactId) =>
    ipcRenderer.invoke(CH.DB_ADD_MEMBER_TO_GROUP, groupId, contactId),

  removeMemberFromGroup: (groupId, contactId) =>
    ipcRenderer.invoke(CH.DB_REMOVE_MEMBER_FROM_GROUP, groupId, contactId),

  setContactService: (contactId, service) =>
    ipcRenderer.invoke(CH.DB_SET_CONTACT_SERVICE, contactId, service),

  isContactInGroup: (groupId, contactId) =>
    ipcRenderer.invoke(CH.DB_IS_CONTACT_IN_GROUP, groupId, contactId),

  getChatGroups: () =>
    ipcRenderer.invoke(CH.DB_GET_CHAT_GROUPS),

  refreshChatGroups: () =>
    ipcRenderer.invoke(CH.DB_REFRESH_CHAT_GROUPS),

  addChatGroupToGroup: (groupId, chatIdentifier, displayName, participantHandles) =>
    ipcRenderer.invoke(CH.DB_ADD_CHAT_GROUP_TO_GROUP, groupId, chatIdentifier, displayName, participantHandles),

  removeChatGroupFromGroup: (groupId, chatGroupMemberId) =>
    ipcRenderer.invoke(CH.DB_REMOVE_CHAT_GROUP_FROM_GROUP, groupId, chatGroupMemberId),

  // ── Tags ──────────────────────────────────────────────────
  getTagsForGroup: (groupId) =>
    ipcRenderer.invoke(CH.TAG_GET_ALL_FOR_GROUP, groupId),
  createTag: (groupId, name) =>
    ipcRenderer.invoke(CH.TAG_CREATE, groupId, name),
  renameTag: (tagId, name) =>
    ipcRenderer.invoke(CH.TAG_RENAME, tagId, name),
  deleteTag: (tagId) =>
    ipcRenderer.invoke(CH.TAG_DELETE, tagId),
  addTagToMember: (tagId, memberId) =>
    ipcRenderer.invoke(CH.TAG_ADD_TO_MEMBER, tagId, memberId),
  removeTagFromMember: (tagId, memberId) =>
    ipcRenderer.invoke(CH.TAG_REMOVE_FROM_MEMBER, tagId, memberId),
  setTagMembers: (tagId, memberIds) =>
    ipcRenderer.invoke(CH.TAG_SET_MEMBERS, tagId, memberIds),

  checkCapability: (members) =>
    ipcRenderer.invoke(CH.CONTACTS_CHECK_CAPABILITY, members),

  // ── Send ──────────────────────────────────────────────────
  sendToGroup: (groupId, templateText, memberIds, attachmentPath, delaySeconds = 0) =>
    ipcRenderer.invoke(CH.SEND_TO_GROUP, groupId, templateText, memberIds, attachmentPath, delaySeconds),

  onSendProgress: (callback) =>
    ipcRenderer.on(CH.SEND_PROGRESS, (_event, data) => callback(data)),

  offSendProgress: () => {
    ipcRenderer.removeAllListeners(CH.SEND_PROGRESS)
  },

  logSendAttempt: (groupId, templateText, status, errorLog) =>
    ipcRenderer.invoke(CH.DB_LOG_SEND_ATTEMPT, groupId, templateText, status, errorLog),

  getSendHistory: (groupId, limit) =>
    ipcRenderer.invoke(CH.DB_GET_SEND_HISTORY, groupId, limit),
  clearSendHistory: () =>
    ipcRenderer.invoke(CH.DB_CLEAR_SEND_HISTORY),
  getSendRecipients: (sendHistoryId) =>
    ipcRenderer.invoke(CH.DB_GET_SEND_RECIPIENTS, sendHistoryId),

  // ── Scheduling ────────────────────────────────────────────
  openAttachmentDialog: (maxFiles) =>
    ipcRenderer.invoke(CH.DIALOG_OPEN_ATTACHMENT, maxFiles),

  createScheduledSend: (groupId, templateText, scheduleType, scheduleData, memberIds, attachmentPath, delaySeconds = 0) =>
    ipcRenderer.invoke(CH.SCHEDULING_CREATE_SCHEDULED_SEND, groupId, templateText, scheduleType, scheduleData, memberIds, attachmentPath, delaySeconds),

  cancelScheduledSend: (id, plistId) =>
    ipcRenderer.invoke(CH.SCHEDULING_CANCEL_SCHEDULED_SEND, id, plistId),

  updateScheduledSend: (id, plistId, templateText, scheduleType, scheduleData, memberIds, attachmentPath) =>
    ipcRenderer.invoke(CH.SCHEDULING_UPDATE_SCHEDULED_SEND, id, plistId, templateText, scheduleType, scheduleData, memberIds, attachmentPath),

  getScheduledSends: (groupId) =>
    ipcRenderer.invoke(CH.DB_GET_SCHEDULED_SENDS, groupId),

  checkAppleScript: () =>
    ipcRenderer.invoke(CH.PERMISSIONS_CHECK_APPLESCRIPT),

  checkFda: () =>
    ipcRenderer.invoke(CH.SYSTEM_CHECK_FDA),

  openFdaSettings: () =>
    ipcRenderer.invoke(CH.SYSTEM_OPEN_FDA_SETTINGS),

  setMacNotifs: (enabled) =>
    ipcRenderer.send(CH.SYSTEM_SET_MAC_NOTIFS, enabled),

  sendTestNotification: () =>
    ipcRenderer.invoke(CH.SYSTEM_SEND_TEST_NOTIF),

  openContactsSettings: () =>
    ipcRenderer.invoke(CH.SYSTEM_OPEN_CONTACTS_SETTINGS),

  openNotificationsSettings: () =>
    ipcRenderer.invoke(CH.SYSTEM_OPEN_NOTIFICATIONS_SETTINGS),

  openAutomationSettings: () =>
    ipcRenderer.invoke(CH.SYSTEM_OPEN_AUTOMATION_SETTINGS),

  onDbExternalChange: (cb) =>
    ipcRenderer.on(CH.DB_EXTERNAL_CHANGE, cb),

  onBufferComplete: (cb) =>
    ipcRenderer.on(CH.BUFFER_COMPLETE, (_e, data) => cb(data)),
  offBufferComplete: () =>
    ipcRenderer.removeAllListeners(CH.BUFFER_COMPLETE),

  sendTextOnly: (scheduledSendId) =>
    ipcRenderer.invoke(CH.SCHEDULING_SEND_TEXT_ONLY, scheduledSendId),

  onAttachmentErrors: (cb) =>
    ipcRenderer.on(CH.ATTACHMENT_ERRORS, (_e, errors) => cb(errors)),

  // ── Templates ─────────────────────────────────────────────
  getTemplates: () =>
    ipcRenderer.invoke(CH.TEMPLATE_GET_ALL),
  getTemplateById: (id) =>
    ipcRenderer.invoke(CH.TEMPLATE_GET_BY_ID, id),
  createTemplate: (name, text, paths) =>
    ipcRenderer.invoke(CH.TEMPLATE_CREATE, name, text, paths),
  updateTemplate: (id, name, text, paths) =>
    ipcRenderer.invoke(CH.TEMPLATE_UPDATE, id, name, text, paths),
  deleteTemplate: (id) =>
    ipcRenderer.invoke(CH.TEMPLATE_DELETE, id),
  templateSend: (tmplId, mode, ids, delaySeconds = 0) =>
    ipcRenderer.invoke(CH.TEMPLATE_SEND, tmplId, mode, ids, delaySeconds),
})
