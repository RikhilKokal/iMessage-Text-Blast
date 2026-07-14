const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')
const fs = require('fs')

// Store DB path as a named constant so future prompts can reference it
const DB_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'iMessage Text Blast')
const DB_PATH = path.join(DB_DIR, 'app.db')

let db

function init() {
  // Ensure the app data directory exists
  fs.mkdirSync(DB_DIR, { recursive: true })

  db = new Database(DB_PATH)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
  console.log(`[DB] Initialized at ${DB_PATH}`)
  return db
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      normalized_phone TEXT UNIQUE NOT NULL,
      email TEXT,
      company TEXT,
      nickname TEXT,
      source TEXT CHECK(source IN ('macOS', 'csv', 'manual')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS send_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES groups(id),
      template_text TEXT NOT NULL,
      scheduled_time TIMESTAMP,
      status TEXT CHECK(status IN ('pending', 'sent', 'partial', 'failed')),
      error_log TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scheduled_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES groups(id),
      template_text TEXT NOT NULL,
      schedule_type TEXT CHECK(schedule_type IN ('once', 'recurring')),
      schedule_interval TEXT,
      next_run TIMESTAMP,
      is_active BOOLEAN DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      launchd_plist_id TEXT
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS send_history_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      send_history_id INTEGER NOT NULL REFERENCES send_history(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL
    );
  `)

  // Migrations — safe to run on every startup (IF NOT EXISTS / column checks)
  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN preferred_service TEXT DEFAULT 'iMessage'
             CHECK(preferred_service IN ('iMessage', 'SMS'))`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN macos_id TEXT`)
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_macos_id ON contacts(macos_id) WHERE macos_id IS NOT NULL`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE send_history ADD COLUMN total_members_at_send INTEGER`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE send_history_recipients ADD COLUMN received INTEGER NOT NULL DEFAULT 1`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN phone_label TEXT`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE scheduled_sends ADD COLUMN member_ids TEXT`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE contacts ADD COLUMN service_confirmed INTEGER NOT NULL DEFAULT 0`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE scheduled_sends ADD COLUMN attachment_path TEXT`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE send_history ADD COLUMN attachment_path TEXT`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE send_history ADD COLUMN template_name TEXT`)
  } catch { /* already exists */ }

  try {
    db.exec(`ALTER TABLE scheduled_sends ADD COLUMN delay_seconds INTEGER NOT NULL DEFAULT 0`)
  } catch { /* already exists */ }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      template_text TEXT NOT NULL DEFAULT '',
      attachment_path TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`)
  } catch { /* already exists */ }

  // A "member" that is itself an existing iMessage group thread rather than a single
  // contact. Can't live in `contacts` since that table requires a unique phone number.
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      chat_identifier TEXT NOT NULL,
      display_name TEXT,
      participant_handles TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(app_group_id, chat_identifier)
    );
  `)

  // Group-scoped tags for organizing members into reusable send-selections.
  // member_tags.member_id is NOT a real FK — it polymorphically stores whatever
  // getGroupMembers() already uses as a member's id (stringified contact id, or
  // "gc:<id>" for a group-chat member), so it can point at either contacts or
  // chat_group_members without two separate join tables.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, name)
    );

    CREATE TABLE IF NOT EXISTS member_tags (
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL,
      PRIMARY KEY (tag_id, member_id)
    );
  `)

  // Contact-level personalization token overrides. JSON format: {"firstName": "Abhi", "lastName": "K", ...}
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_token_overrides (
      contact_id INTEGER NOT NULL PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
      overrides TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Default token overrides for contacts with empty values (e.g., no email).
  // Single row containing overrides that apply to all contacts with empty fields.
  // JSON format: {"firstName": "Abhi", "lastName": "K", ...}
  db.exec(`
    CREATE TABLE IF NOT EXISTS empty_value_defaults (
      id INTEGER PRIMARY KEY,
      overrides TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

// Strip everything except digits, then remove a leading country code 1
// so "+1 (408) 555-1234", "4085551234", and "(408) 555-1234" all normalize identically.
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

// Shared lookup for resolveHandleName/resolveHandleInfo: raw {name, nickname} row
// for a chat.db handle (phone or email), or null if no local contact matches.
function _lookupContactByHandle(handle) {
  const digits = handle.replace(/\D/g, '')
  if (digits.length >= 10) {
    const suffix = digits.slice(-10)
    return db.prepare('SELECT name, nickname FROM contacts WHERE normalized_phone LIKE ?').get('%' + suffix) || null
  }
  if (handle.includes('@')) {
    return db.prepare('SELECT name, nickname FROM contacts WHERE LOWER(email) = LOWER(?)').get(handle) || null
  }
  return null
}

// Resolve a raw chat.db handle (phone or email) to a friendly local contact name,
// falling back to the raw handle itself when no matching contact exists.
function resolveHandleName(handle) {
  const row = _lookupContactByHandle(handle)
  return row ? (row.nickname || row.name) : handle
}

// Like resolveHandleName, but returns every name variant (real name + nickname) —
// used for search-matching, since a user might search by either one, not just
// whichever one resolveHandleName prefers for display.
function resolveHandleInfo(handle) {
  const row = _lookupContactByHandle(handle)
  if (!row) return { displayName: handle, searchTerms: [handle] }
  return {
    displayName: row.nickname || row.name,
    searchTerms: [...new Set([row.name, row.nickname, handle].filter(Boolean))],
  }
}

function resolveChatGroupLabel(displayName, participantHandlesJson) {
  if (displayName && displayName.trim()) return displayName.trim()
  const handles = JSON.parse(participantHandlesJson || '[]')
  return handles.map(resolveHandleName).join(', ') || 'Group Chat'
}

function resolveGroupChatParticipants(participantHandlesJson) {
  try {
    const handles = JSON.parse(participantHandlesJson || '[]')
    const participants = handles.map(handle => {
      const row = _lookupContactByHandle(handle)
      const name = row ? row.name : handle
      const parts = name.trim().split(' ')
      return {
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        fullName: name
      }
    })
    return {
      firstNames: participants.map(p => p.firstName).filter(Boolean).sort(),
      lastNames: participants.map(p => p.lastName).filter(Boolean).sort(),
      fullNames: participants.map(p => p.fullName).sort()
    }
  } catch {
    return { firstNames: [], lastNames: [], fullNames: [] }
  }
}

function contactExists(phone) {
  const normalized = normalizePhone(phone)
  const row = db.prepare('SELECT id FROM contacts WHERE normalized_phone = ?').get(normalized)
  return !!row
}

function getContactByPhone(phone) {
  const normalized = normalizePhone(phone)
  return db.prepare('SELECT id FROM contacts WHERE normalized_phone = ?').get(normalized)
}

/**
 * Upsert a contact coming from macOS Contacts sync.
 * Matches on macos_id first (same person, phone may have changed),
 * then falls back to normalized_phone (existing row without an id yet).
 * Returns the contact row id, or null if the phone is empty/invalid.
 */
/**
 * Returns { id, action } where action is 'inserted' | 'updated' | 'unchanged'.
 */
function upsertMacOSContact(macosId, name, phone, phoneLabel, email, company, nickname) {
  if (!phone) return null
  const normalized = normalizePhone(phone)
  if (!normalized) return null

  email      = email      || null
  company    = company    || null
  nickname   = nickname   || null
  phoneLabel = phoneLabel || null

  // Normalise a value for comparison: null, undefined, and '' are all treated as equivalent
  const cmp = v => (v == null ? '' : String(v).trim())

  // 1. Do we already know this entry (by its stable per-number identifier)?
  const byId = db.prepare('SELECT id, name, phone, email, company, nickname, phone_label FROM contacts WHERE macos_id = ?').get(macosId)
  if (byId) {
    const fields = [
      ['name',       cmp(byId.name),                cmp(name)],
      ['phone',      normalizePhone(byId.phone),     normalized],
      ['email',      cmp(byId.email),                cmp(email)],
      ['company',    cmp(byId.company),              cmp(company)],
      ['nickname',   cmp(byId.nickname),             cmp(nickname)],
      ['phone_label',cmp(byId.phone_label),          cmp(phoneLabel)],
    ]
    const diffs = fields.filter(([, oldVal, newVal]) => oldVal !== newVal)
    const changed = diffs.length > 0
    if (changed) {
      db.prepare(`
        UPDATE contacts
        SET name = ?, phone = ?, normalized_phone = ?, email = ?, company = ?, nickname = ?, phone_label = ?, source = 'macOS'
        WHERE macos_id = ?
      `).run(name, phone, normalized, email, company, nickname, phoneLabel, macosId)
      return { id: byId.id, action: 'updated' }
    }
    return { id: byId.id, action: 'unchanged' }
  }

  // 2. Row exists by phone but has no macos_id yet — adopt it.
  // Only adopt rows with no macos_id; rows already claimed by another entry are skipped.
  const byPhone = db.prepare('SELECT id, name, macos_id FROM contacts WHERE normalized_phone = ? AND macos_id IS NULL').get(normalized)
  if (byPhone) {
    db.prepare(`
      UPDATE contacts
      SET name = ?, phone = ?, email = ?, company = ?, nickname = ?, phone_label = ?, macos_id = ?, source = 'macOS'
      WHERE id = ?
    `).run(name, phone, email, company, nickname, phoneLabel, macosId, byPhone.id)
    return { id: byPhone.id, action: 'updated' }
  }

  // 2b. Phone matches a row that already has a different macos_id — duplicate number, skip.
  const claimed = db.prepare('SELECT id FROM contacts WHERE normalized_phone = ?').get(normalized)
  if (claimed) {
    return { id: claimed.id, action: 'unchanged' }
  }

  // 3. Brand new contact.
  const result = db.prepare(`
    INSERT INTO contacts (name, phone, normalized_phone, email, company, nickname, phone_label, source, macos_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'macOS', ?)
  `).run(name, phone, normalized, email, company, nickname, phoneLabel, macosId)
  return { id: result.lastInsertRowid, action: 'inserted' }
}

function getPrevMacOSContactIds() {
  return db.prepare('SELECT macos_id FROM contacts WHERE source = \'macOS\' AND macos_id IS NOT NULL').all().map(r => r.macos_id)
}

/**
 * After a full macOS sync, delete contacts that came from macOS but whose
 * macos_id is no longer present in the freshly-synced set — i.e. the contact
 * was removed from the address book or their only phone was deleted.
 * Contacts that are members of a group are kept (but their macos_id is cleared
 * so they become "manual" orphans the user can clean up themselves).
 */
function removeStaleMacOSContacts(currentMacosIds) {
  const stale = [
    ...db.prepare(`
      SELECT id, macos_id FROM contacts
      WHERE source = 'macOS' AND macos_id IS NOT NULL
        AND macos_id NOT IN (${currentMacosIds.map(() => '?').join(',')})
    `).all(...currentMacosIds),
    ...db.prepare(`
      SELECT id, macos_id FROM contacts WHERE source = 'macOS' AND macos_id IS NULL
    `).all(),
  ]

  // Build a lookup: contactIdentifier → new macosId (for edit detection)
  const currentPrefixToMacosId = new Map()
  for (const id of currentMacosIds) {
    const prefix = id.split('|')[0]
    currentPrefixToMacosId.set(prefix, id)
  }

  let removed = 0
  for (const { id, macos_id } of stale) {
    const inGroup = db.prepare('SELECT 1 FROM group_members WHERE contact_id = ?').get(id)

    // Check if this looks like an edited phone (same contactIdentifier exists in current sync)
    const prefix = macos_id ? macos_id.split('|')[0] : null
    const newMacosId = prefix ? currentPrefixToMacosId.get(prefix) : null

    if (newMacosId) {
      // Phone was edited — find the new row and migrate group memberships to it, then delete old row
      const newRow = db.prepare('SELECT id FROM contacts WHERE macos_id = ?').get(newMacosId)
      if (newRow && inGroup) {
        db.prepare(`
          INSERT OR IGNORE INTO group_members (group_id, contact_id)
          SELECT group_id, ? FROM group_members WHERE contact_id = ?
        `).run(newRow.id, id)
        db.prepare(`
          INSERT OR IGNORE INTO member_tags (tag_id, member_id)
          SELECT tag_id, ? FROM member_tags WHERE member_id = ?
        `).run(String(newRow.id), String(id))
      }
      db.prepare('DELETE FROM member_tags WHERE member_id = ?').run(String(id))
      db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
      removed++
    } else if (inGroup) {
      // Contact truly deleted from macOS but still in a group — keep as manual orphan
      db.prepare(`UPDATE contacts SET macos_id = NULL, source = 'manual' WHERE id = ?`).run(id)
    } else {
      db.prepare('DELETE FROM member_tags WHERE member_id = ?').run(String(id))
      db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
      removed++
    }
  }
  return { staleCount: stale.length, removed }
}

function addContact(name, phone, email, source, company = null, nickname = null) {
  if (!phone) return null

  const normalized = normalizePhone(phone)

  // Skip if a contact with this normalized phone already exists
  if (contactExists(phone)) {
    return null
  }

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO contacts (name, phone, normalized_phone, email, company, nickname, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const result = stmt.run(name, phone, normalized, email || null, company || null, nickname || null, source || 'manual')
  // changes === 0 means UNIQUE constraint blocked the insert (already exists)
  return result.changes > 0 ? result.lastInsertRowid : null
}

function getContacts() {
  return db.prepare('SELECT * FROM contacts ORDER BY LOWER(name) ASC').all()
}

function getContactsByIds(ids) {
  if (!ids || ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders})`).all(ids)
}

function deleteContact(id) {
  db.prepare('DELETE FROM member_tags WHERE member_id = ?').run(String(id))
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id)
}

// Bulk import from CSV — deduplicates by phone, returns stats
function importContactsFromCSV(rows) {
  let success = 0
  let skipped = 0
  const errors = []

  const insertMany = db.transaction((contacts) => {
    for (const row of contacts) {
      if (!row.phone) {
        skipped++
        continue
      }
      try {
        const id = addContact(row.name, row.phone, row.email, 'csv')
        if (id) {
          success++
        } else {
          skipped++ // duplicate
        }
      } catch (err) {
        errors.push(`Row "${row.name}": ${err.message}`)
      }
    }
  })

  insertMany(rows)
  return { success, skipped, errors }
}

// ── Groups ────────────────────────────────────────────────────────────────────

function createGroup(name) {
  const trimmed = name.trim()
  const existing = db.prepare('SELECT id FROM groups WHERE name = ?').get(trimmed)
  if (existing) throw new Error(`Group "${trimmed}" already exists`)

  const result = db.prepare('INSERT INTO groups (name) VALUES (?)').run(trimmed)
  return result.lastInsertRowid
}

function getGroups() {
  return db.prepare(`
    SELECT g.id, g.name, g.created_at, g.updated_at,
           (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) +
           (SELECT COUNT(*) FROM chat_group_members WHERE app_group_id = g.id) AS memberCount
    FROM groups g
    ORDER BY LOWER(g.name) ASC
  `).all()
}

function getGroupById(id) {
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id)
}

function updateGroupName(id, newName) {
  const trimmed = newName.trim()
  const conflict = db.prepare('SELECT id FROM groups WHERE name = ? AND id != ?').get(trimmed, id)
  if (conflict) throw new Error(`Group "${trimmed}" already exists`)

  db.prepare('UPDATE groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(trimmed, id)
}

function deleteGroup(id) {
  db.transaction(() => {
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(id)
    db.prepare('DELETE FROM chat_group_members WHERE app_group_id = ?').run(id)
    db.prepare('DELETE FROM tags WHERE group_id = ?').run(id) // member_tags cascades via FK
    // Cancel and detach any scheduled sends for this group
    db.prepare('UPDATE scheduled_sends SET is_active = 0, group_id = NULL WHERE group_id = ?').run(id)
    // Null out the group_id in history so old records are kept but the FK is released
    db.prepare('UPDATE send_history SET group_id = NULL WHERE group_id = ?').run(id)
    db.prepare('DELETE FROM groups WHERE id = ?').run(id)
  })()
}

// ── Group Members ─────────────────────────────────────────────────────────────

function getGroupMembers(groupId) {
  const contacts = db.prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.company, c.nickname, c.source,
           c.preferred_service AS service, c.service_confirmed
    FROM contacts c
    JOIN group_members gm ON gm.contact_id = c.id
    WHERE gm.group_id = ?
    ORDER BY c.name ASC
  `).all(groupId).map(c => ({ ...c, type: 'contact' }))

  const chatGroups = db.prepare(`
    SELECT id, chat_identifier, display_name, participant_handles
    FROM chat_group_members
    WHERE app_group_id = ?
  `).all(groupId).map(row => ({
    id: `gc:${row.id}`,
    name: resolveChatGroupLabel(row.display_name, row.participant_handles),
    phone: row.chat_identifier,
    email: null,
    company: null,
    nickname: null,
    source: 'chat.db',
    service: 'iMessage',
    service_confirmed: 1,
    type: 'group_chat',
    chat_identifier: row.chat_identifier,
    participant_count: JSON.parse(row.participant_handles || '[]').length,
    participants: resolveGroupChatParticipants(row.participant_handles),
  })).sort((a, b) => a.name.localeCompare(b.name))

  // Attach each member's tags via one query for the whole group, not per-member.
  const tagRows = db.prepare(`
    SELECT mt.member_id, t.id, t.name
    FROM member_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE t.group_id = ?
  `).all(groupId)
  const tagsByMemberId = new Map()
  for (const r of tagRows) {
    if (!tagsByMemberId.has(r.member_id)) tagsByMemberId.set(r.member_id, [])
    tagsByMemberId.get(r.member_id).push({ id: r.id, name: r.name })
  }
  // contact.id comes back from better-sqlite3 as a number; chat-group member ids
  // are already the "gc:N" string, so only the contacts branch needs String().
  const withTags = (m) => ({ ...m, tags: tagsByMemberId.get(String(m.id)) || [] })

  return [...contacts.map(withTags), ...chatGroups.map(withTags)]
}

function setContactService(contactId, service) {
  db.prepare(`UPDATE contacts SET preferred_service = ?, service_confirmed = 1 WHERE id = ?`).run(service, contactId)
}

function addMemberToGroup(groupId, contactId) {
  const already = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND contact_id = ?'
  ).get(groupId, contactId)
  if (already) throw new Error('Contact is already in this group')

  db.prepare('INSERT INTO group_members (group_id, contact_id) VALUES (?, ?)').run(groupId, contactId)
}

function removeMemberFromGroup(groupId, contactId) {
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND contact_id = ?').run(groupId, contactId)
  db.prepare(`DELETE FROM member_tags WHERE member_id = ? AND tag_id IN (SELECT id FROM tags WHERE group_id = ?)`)
    .run(String(contactId), groupId)
}

// ── Chat Group Members (existing iMessage group threads added as members) ─────

function addChatGroupToGroup(appGroupId, chatIdentifier, displayName, participantHandles) {
  const already = db.prepare(
    'SELECT 1 FROM chat_group_members WHERE app_group_id = ? AND chat_identifier = ?'
  ).get(appGroupId, chatIdentifier)
  if (already) throw new Error('This group chat is already in this group')

  db.prepare(`
    INSERT INTO chat_group_members (app_group_id, chat_identifier, display_name, participant_handles)
    VALUES (?, ?, ?, ?)
  `).run(appGroupId, chatIdentifier, displayName || null, JSON.stringify(participantHandles || []))
}

function removeChatGroupFromGroup(appGroupId, chatGroupMemberId) {
  db.prepare('DELETE FROM chat_group_members WHERE id = ? AND app_group_id = ?').run(chatGroupMemberId, appGroupId)
  db.prepare(`DELETE FROM member_tags WHERE member_id = ? AND tag_id IN (SELECT id FROM tags WHERE group_id = ?)`)
    .run(`gc:${chatGroupMemberId}`, appGroupId)
}

// Refreshes display_name/participant_handles for any already-added chat_group_members
// row whose chat_identifier matches a live chat.db entry — keeps renames and
// membership changes from going stale, mirroring how upsertMacOSContact() keeps
// synced contact fields current. Matched purely by chat_identifier (stable across
// renames/membership changes), so rows with no live match are left untouched.
function syncChatGroupsFromLive(liveChats) {
  const stmt = db.prepare(`
    UPDATE chat_group_members
    SET display_name = ?, participant_handles = ?
    WHERE chat_identifier = ?
  `)
  let updated = 0
  const run = db.transaction((chats) => {
    for (const c of chats) {
      const info = stmt.run(c.display_name || null, JSON.stringify(c.participant_handles || []), c.chat_identifier)
      updated += info.changes
    }
  })
  run(liveChats)
  return updated
}

function getGroupMemberIds(groupId) {
  return db.prepare('SELECT contact_id FROM group_members WHERE group_id = ?')
    .all(groupId)
    .map((r) => r.contact_id)
}

function isContactInGroup(groupId, contactId) {
  return !!db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND contact_id = ?'
  ).get(groupId, contactId)
}

// ── Tags ──────────────────────────────────────────────────────────────────────

function createTag(groupId, name) {
  const trimmed = name.trim()
  const existing = db.prepare('SELECT id FROM tags WHERE group_id = ? AND name = ?').get(groupId, trimmed)
  if (existing) throw new Error(`Tag "${trimmed}" already exists in this group`)
  const result = db.prepare('INSERT INTO tags (group_id, name) VALUES (?, ?)').run(groupId, trimmed)
  return result.lastInsertRowid
}

function getTagsForGroup(groupId) {
  return db.prepare('SELECT id, name FROM tags WHERE group_id = ? ORDER BY LOWER(name) ASC').all(groupId)
}

function renameTag(tagId, newName) {
  const trimmed = newName.trim()
  const tag = db.prepare('SELECT group_id FROM tags WHERE id = ?').get(tagId)
  if (!tag) throw new Error('Tag not found')
  const conflict = db.prepare('SELECT id FROM tags WHERE group_id = ? AND name = ? AND id != ?').get(tag.group_id, trimmed, tagId)
  if (conflict) throw new Error(`Tag "${trimmed}" already exists in this group`)
  db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(trimmed, tagId)
}

function deleteTag(tagId) {
  db.prepare('DELETE FROM tags WHERE id = ?').run(tagId) // member_tags cascades via FK
}

function addTagToMember(tagId, memberId) {
  db.prepare('INSERT OR IGNORE INTO member_tags (tag_id, member_id) VALUES (?, ?)').run(tagId, String(memberId))
}

function removeTagFromMember(tagId, memberId) {
  db.prepare('DELETE FROM member_tags WHERE tag_id = ? AND member_id = ?').run(tagId, String(memberId))
}

// Bulk replace-all for the "edit a tag's members" flow in Edit Tags.
function setTagMembers(tagId, memberIds) {
  const run = db.transaction((ids) => {
    db.prepare('DELETE FROM member_tags WHERE tag_id = ?').run(tagId)
    const insert = db.prepare('INSERT INTO member_tags (tag_id, member_id) VALUES (?, ?)')
    for (const id of ids) insert.run(tagId, String(id))
  })
  run(memberIds)
}

// ── Scheduled Sends ───────────────────────────────────────────────────────────

function serializeAttachments(attachmentPaths) {
  const arr = Array.isArray(attachmentPaths) ? attachmentPaths.filter(Boolean) : (attachmentPaths ? [attachmentPaths] : [])
  return arr.length ? JSON.stringify(arr) : null
}

function createScheduledSend(groupId, templateText, scheduleType, scheduleData, nextRun, plistId, memberIds = null, attachmentPaths = null, delaySeconds = 0) {
  const result = db.prepare(`
    INSERT INTO scheduled_sends
      (group_id, template_text, schedule_type, schedule_interval, next_run, launchd_plist_id, member_ids, attachment_path, delay_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupId,
    templateText,
    scheduleType,
    JSON.stringify(scheduleData),
    nextRun instanceof Date ? nextRun.toISOString() : nextRun,
    plistId,
    memberIds && memberIds.length ? JSON.stringify(memberIds) : null,
    serializeAttachments(attachmentPaths),
    delaySeconds || 0,
  )
  return { id: result.lastInsertRowid, plistId }
}

function getScheduledSends(groupId = null) {
  const base = `
    SELECT ss.id, ss.group_id, ss.template_text, ss.schedule_type,
           ss.schedule_interval, ss.next_run, ss.is_active,
           ss.created_at, ss.launchd_plist_id, ss.member_ids, ss.attachment_path,
           g.name AS group_name
    FROM scheduled_sends ss
    LEFT JOIN groups g ON g.id = ss.group_id
    WHERE ss.is_active = 1
  `
  if (groupId) {
    return db.prepare(base + 'AND ss.group_id = ? ORDER BY ss.next_run ASC').all(groupId)
  }
  return db.prepare(base + 'ORDER BY ss.next_run ASC').all()
}

/**
 * Soft-cancel a scheduled send. Returns the launchd_plist_id so the caller
 * can unload the plist.
 */
function getScheduledSendById(id) {
  return db.prepare('SELECT * FROM scheduled_sends WHERE id = ?').get(id) || null
}

function cancelScheduledSend(id) {
  const row = db.prepare('SELECT launchd_plist_id FROM scheduled_sends WHERE id = ?').get(id)
  db.prepare('UPDATE scheduled_sends SET is_active = 0 WHERE id = ?').run(id)
  return row?.launchd_plist_id || null
}

function updateScheduledSendDetails(id, templateText, scheduleType, scheduleData, nextRun, memberIds = null, attachmentPaths = null) {
  db.prepare(`
    UPDATE scheduled_sends
    SET template_text = ?, schedule_type = ?, schedule_interval = ?, next_run = ?, member_ids = ?, attachment_path = ?
    WHERE id = ?
  `).run(
    templateText,
    scheduleType,
    JSON.stringify(scheduleData),
    nextRun instanceof Date ? nextRun.toISOString() : nextRun,
    memberIds && memberIds.length ? JSON.stringify(memberIds) : null,
    serializeAttachments(attachmentPaths),
    id,
  )
}

function updateScheduledSendNextRun(id, nextRun) {
  db.prepare('UPDATE scheduled_sends SET next_run = ? WHERE id = ?').run(
    nextRun instanceof Date ? nextRun.toISOString() : nextRun,
    id,
  )
}

// ── Send History ──────────────────────────────────────────────────────────────

function logSendRecipients(sendHistoryId, sentMembers, allMembers) {
  const sentIds = new Set(sentMembers.map(m => m.id))
  const insert = db.prepare('INSERT INTO send_history_recipients (send_history_id, name, phone, received) VALUES (?, ?, ?, ?)')
  const insertAll = db.transaction((rows) => {
    const seen = new Set()
    for (const m of rows) {
      if (seen.has(m.phone)) continue
      seen.add(m.phone)
      insert.run(sendHistoryId, m.name, m.phone, sentIds.has(m.id) ? 1 : 0)
    }
  })
  insertAll(allMembers)
}

function getSendRecipients(sendHistoryId) {
  return db.prepare('SELECT name, phone, received FROM send_history_recipients WHERE send_history_id = ? ORDER BY name').all(sendHistoryId)
}

function logSendAttempt(groupId, templateText, status, errorLog = null, totalMembersAtSend = null, attachmentPaths = null, templateName = null) {
  const arr = Array.isArray(attachmentPaths) ? attachmentPaths.filter(Boolean) : (attachmentPaths ? [attachmentPaths] : [])
  const attachmentJson = arr.length ? JSON.stringify(arr) : null
  const result = db.prepare(`
    INSERT INTO send_history (group_id, template_text, status, error_log, total_members_at_send, attachment_path, template_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, templateText, status, errorLog || null, totalMembersAtSend, attachmentJson, templateName || null)
  return { id: result.lastInsertRowid }
}

function updateSendStatus(sendHistoryId, status, errorLog = null, sentAt = null) {
  db.prepare(`
    UPDATE send_history
    SET status = ?, error_log = ?, sent_at = COALESCE(?, sent_at)
    WHERE id = ?
  `).run(status, errorLog || null, sentAt || null, sendHistoryId)
}

function getSendHistory(groupId = null, limit = 100) {
  const base = `
    SELECT sh.id, sh.template_text, sh.status, sh.error_log,
           sh.created_at, sh.sent_at, sh.attachment_path,
           sh.template_name,
           g.name AS group_name,
           sh.total_members_at_send AS group_member_count,
           (SELECT COUNT(*) FROM send_history_recipients WHERE send_history_id = sh.id AND received = 1) AS sent_to_count
    FROM send_history sh
    LEFT JOIN groups g ON g.id = sh.group_id
  `
  if (groupId) {
    return db.prepare(base + 'WHERE sh.group_id = ? ORDER BY sh.created_at DESC LIMIT ?').all(groupId, limit)
  }
  return db.prepare(base + 'ORDER BY sh.created_at DESC LIMIT ?').all(limit)
}

function clearSendHistory() {
  db.prepare('DELETE FROM send_history').run()
}

// ── Templates ─────────────────────────────────────────────────────────────────

function createTemplate(name, templateText, attachmentJson) {
  const result = db.prepare(
    'INSERT INTO templates (name, template_text, attachment_path) VALUES (?, ?, ?)'
  ).run(name.trim(), templateText, attachmentJson || null)
  return { id: result.lastInsertRowid }
}

function getTemplates() {
  return db.prepare('SELECT * FROM templates ORDER BY LOWER(name) ASC').all()
}

function getTemplateById(id) {
  return db.prepare('SELECT * FROM templates WHERE id = ?').get(id)
}

function updateTemplate(id, name, templateText, attachmentJson) {
  db.prepare(
    'UPDATE templates SET name=?, template_text=?, attachment_path=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(name.trim(), templateText, attachmentJson || null, id)
}

function deleteTemplate(id) {
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
}

function getContactsByIdsAsMember(ids) {
  if (!ids?.length) return []
  const placeholders = ids.map(() => '?').join(',')
  return db.prepare(
    `SELECT id, name, phone, email, company, nickname, source,
            preferred_service AS service, service_confirmed
     FROM contacts WHERE id IN (${placeholders})`
  ).all(ids)
}

// ── Token Overrides ────────────────────────────────────────────────────────────

function getContactTokenOverrides(contactId) {
  const row = db.prepare('SELECT overrides FROM contact_token_overrides WHERE contact_id = ?').get(contactId)
  return row ? JSON.parse(row.overrides) : {}
}

function saveContactTokenOverrides(contactId, overridesObj) {
  const overridesJson = JSON.stringify(overridesObj)
  db.prepare(`
    INSERT INTO contact_token_overrides (contact_id, overrides)
    VALUES (?, ?)
    ON CONFLICT(contact_id) DO UPDATE SET overrides = excluded.overrides, updated_at = CURRENT_TIMESTAMP
  `).run(contactId, overridesJson)
}

function deleteContactTokenOverrides(contactId) {
  db.prepare('DELETE FROM contact_token_overrides WHERE contact_id = ?').run(contactId)
}

function getEmptyValueDefaults() {
  const row = db.prepare('SELECT overrides FROM empty_value_defaults LIMIT 1').get()
  return row ? JSON.parse(row.overrides) : {}
}

function saveEmptyValueDefaults(overridesObj) {
  const overridesJson = JSON.stringify(overridesObj)
  db.prepare(`
    INSERT INTO empty_value_defaults (id, overrides)
    VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET overrides = excluded.overrides, updated_at = CURRENT_TIMESTAMP
  `).run(overridesJson)
}

function deleteEmptyValueDefaults() {
  db.prepare('DELETE FROM empty_value_defaults').run()
}

module.exports = {
  init,
  // Contacts
  addContact, upsertMacOSContact, removeStaleMacOSContacts, getPrevMacOSContactIds,
  getContacts, getContactsByIds, getContactsByIdsAsMember, deleteContact, importContactsFromCSV, contactExists, getContactByPhone,
  // Groups
  createGroup, getGroups, getGroupById, updateGroupName, deleteGroup,
  // Group members
  getGroupMembers, addMemberToGroup, removeMemberFromGroup, getGroupMemberIds, isContactInGroup, setContactService,
  addChatGroupToGroup, removeChatGroupFromGroup, resolveHandleName, resolveHandleInfo, syncChatGroupsFromLive,
  // Tags
  createTag, getTagsForGroup, renameTag, deleteTag, addTagToMember, removeTagFromMember, setTagMembers,
  // Token overrides
  getContactTokenOverrides, saveContactTokenOverrides, deleteContactTokenOverrides,
  getEmptyValueDefaults, saveEmptyValueDefaults, deleteEmptyValueDefaults,
  // Send history
  logSendAttempt, logSendRecipients, updateSendStatus, getSendHistory, getSendRecipients, clearSendHistory,
  // Scheduled sends
  createScheduledSend, getScheduledSends, getScheduledSendById, cancelScheduledSend, updateScheduledSendNextRun, updateScheduledSendDetails,
  // Templates
  createTemplate, getTemplates, getTemplateById, updateTemplate, deleteTemplate,
  DB_PATH,
}
