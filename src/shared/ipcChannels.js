// Canonical source of truth for IPC channel names, required by index.js (main process).
// preload.js keeps its own synced copy of these same values below — Electron's sandboxed
// preload context can't require() local project files or even Node built-ins like 'path',
// only the special 'electron' module — so it can't import this file directly. If you add
// or rename a channel here, update preload.js's CH block to match.
module.exports = {
  // Contacts
  CONTACTS_DIAGNOSE:        'contacts:diagnose',
  CONTACTS_SYNC_FROM_MACOS: 'contacts:syncFromMacOS',
  CONTACTS_GET_ME:          'contacts:getMe',
  CONTACTS_PARSE_CSV:       'contacts:parseCSV',
  CONTACTS_IMPORT_CSV:      'contacts:importCSV',
  CONTACTS_CHECK_CAPABILITY: 'contacts:checkCapability',

  // Database — contacts
  DB_GET_CONTACTS:          'db:getContacts',
  DB_GET_CONTACTS_BY_IDS:   'db:getContactsByIds',
  DB_GET_CONTACT_BY_PHONE:  'db:getContactByPhone',
  DB_ADD_CONTACT:           'db:addContact',
  DB_DELETE_CONTACT:        'db:deleteContact',

  // Database — groups
  DB_CREATE_GROUP:          'db:createGroup',
  DB_GET_GROUPS:            'db:getGroups',
  DB_GET_GROUP_BY_ID:       'db:getGroupById',
  DB_UPDATE_GROUP_NAME:     'db:updateGroupName',
  DB_DELETE_GROUP:          'db:deleteGroup',

  // Database — group members
  DB_GET_GROUP_MEMBERS:        'db:getGroupMembers',
  DB_ADD_MEMBER_TO_GROUP:      'db:addMemberToGroup',
  DB_REMOVE_MEMBER_FROM_GROUP: 'db:removeMemberFromGroup',
  DB_SET_CONTACT_SERVICE:      'db:setContactService',
  DB_IS_CONTACT_IN_GROUP:      'db:isContactInGroup',

  // Database — chat group members (existing iMessage group threads added as members)
  DB_GET_CHAT_GROUPS:              'db:getChatGroups',
  DB_REFRESH_CHAT_GROUPS:          'db:refreshChatGroups',
  DB_ADD_CHAT_GROUP_TO_GROUP:      'db:addChatGroupToGroup',
  DB_REMOVE_CHAT_GROUP_FROM_GROUP: 'db:removeChatGroupFromGroup',
  DB_RESOLVE_CHAT_PARTICIPANTS:    'db:resolveChatParticipants',

  // Database — tags
  TAG_GET_ALL_FOR_GROUP:   'tag:getAllForGroup',
  TAG_CREATE:              'tag:create',
  TAG_RENAME:              'tag:rename',
  TAG_DELETE:              'tag:delete',
  TAG_ADD_TO_MEMBER:       'tag:addToMember',
  TAG_REMOVE_FROM_MEMBER:  'tag:removeFromMember',
  TAG_SET_MEMBERS:         'tag:setMembers',

  // Database — token overrides
  CONTACT_GET_TOKEN_OVERRIDES:    'contact:getTokenOverrides',
  CONTACT_SAVE_TOKEN_OVERRIDES:   'contact:saveTokenOverrides',
  CONTACT_DELETE_TOKEN_OVERRIDES: 'contact:deleteTokenOverrides',

  // Database — empty value defaults (defaults for contacts with empty fields)
  EMPTY_DEFAULTS_GET_TOKEN_OVERRIDES:    'emptyDefaults:getTokenOverrides',
  EMPTY_DEFAULTS_SAVE_TOKEN_OVERRIDES:   'emptyDefaults:saveTokenOverrides',
  EMPTY_DEFAULTS_DELETE_TOKEN_OVERRIDES: 'emptyDefaults:deleteTokenOverrides',

  // File dialogs
  DIALOG_OPEN_FILE:       'dialog:openFile',
  DIALOG_OPEN_ATTACHMENT: 'dialog:openAttachment',

  // Send
  SEND_TO_GROUP:        'send:toGroup',
  SEND_PROGRESS:         'send:progress',
  DB_LOG_SEND_ATTEMPT:  'db:logSendAttempt',
  DB_GET_SEND_HISTORY:  'db:getSendHistory',
  DB_CLEAR_SEND_HISTORY: 'db:clearSendHistory',
  DB_GET_SEND_RECIPIENTS: 'db:getSendRecipients',

  // Scheduling
  SCHEDULING_CREATE_SCHEDULED_SEND: 'scheduling:createScheduledSend',
  SCHEDULING_CANCEL_SCHEDULED_SEND: 'scheduling:cancelScheduledSend',
  SCHEDULING_UPDATE_SCHEDULED_SEND: 'scheduling:updateScheduledSend',
  SCHEDULING_SEND_TEXT_ONLY:        'scheduling:sendTextOnly',
  DB_GET_SCHEDULED_SENDS:           'db:getScheduledSends',

  // Permissions / system
  PERMISSIONS_CHECK_APPLESCRIPT:    'permissions:checkAppleScript',
  SYSTEM_CHECK_FDA:                 'system:checkFda',
  SYSTEM_OPEN_FDA_SETTINGS:         'system:openFdaSettings',
  SYSTEM_SET_MAC_NOTIFS:            'system:setMacNotifs',
  SYSTEM_SEND_TEST_NOTIF:           'system:sendTestNotif',
  SYSTEM_OPEN_CONTACTS_SETTINGS:    'system:openContactsSettings',
  SYSTEM_OPEN_NOTIFICATIONS_SETTINGS: 'system:openNotificationsSettings',
  SYSTEM_OPEN_AUTOMATION_SETTINGS:  'system:openAutomationSettings',

  // Main → renderer events
  DB_EXTERNAL_CHANGE:  'db:external-change',
  BUFFER_COMPLETE:     'buffer:complete',
  ATTACHMENT_ERRORS:   'attachment:errors',

  // Templates
  TEMPLATE_GET_ALL:    'template:getAll',
  TEMPLATE_GET_BY_ID:  'template:getById',
  TEMPLATE_CREATE:     'template:create',
  TEMPLATE_UPDATE:     'template:update',
  TEMPLATE_DELETE:     'template:delete',
  TEMPLATE_SEND:       'template:send',
}
