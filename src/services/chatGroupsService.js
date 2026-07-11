/**
 * chatGroupsService.js
 *
 * Reads ~/Library/Messages/chat.db to list existing iMessage GROUP chats
 * (chat.style = 43; 1:1 chats are style = 45) so they can be added as a
 * standalone "member" of an app-side group — see db/database.js's
 * chat_group_members table. Requires Full Disk Access.
 */

const Database = require('better-sqlite3')
const os = require('os')
const path = require('path')
const db = require('../../db/database')

const CHAT_DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')

// The recency-sorted query below (a correlated subquery per chat, plus a separate
// handle lookup per chat) is noticeably slow against a large chat.db, so the result
// is cached indefinitely for the life of the process — computed once (warmed at
// app startup) and only ever recomputed via an explicit user-triggered refresh,
// never automatically.
let _cache = null

function computeAndCache() {
  const chatDb = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true })
  try {
    const chats = chatDb.prepare(`
      SELECT c.ROWID as rowid, c.chat_identifier, c.display_name,
             (SELECT MAX(m.date) FROM chat_message_join cmj
              JOIN message m ON m.ROWID = cmj.message_id
              WHERE cmj.chat_id = c.ROWID) AS last_message_date
      FROM chat c
      WHERE c.style = 43
      ORDER BY last_message_date DESC
    `).all()

    const handleStmt = chatDb.prepare(`
      SELECT h.id
      FROM chat_handle_join chj
      JOIN handle h ON h.ROWID = chj.handle_id
      WHERE chj.chat_id = ?
    `)

    const result = chats
      .map((c) => {
        const participant_handles = handleStmt.all(c.rowid).map((r) => r.id)
        const display_name = c.display_name && c.display_name.trim() ? c.display_name.trim() : null
        const resolvedParticipants = participant_handles.map(db.resolveHandleInfo)
        const resolved_label = display_name || resolvedParticipants.map((p) => p.displayName).join(', ') || c.chat_identifier
        // Every name variant (display name + each participant's real name/nickname)
        // so search can match on any of them, not just whichever one resolved_label shows.
        const search_terms = [
          ...(display_name ? [display_name] : []),
          ...resolvedParticipants.flatMap((p) => p.searchTerms),
        ]
        return { chat_identifier: c.chat_identifier, display_name, resolved_label, participant_handles, search_terms }
      })
      .filter((c) => c.participant_handles.length > 1)

    _cache = result

    // Keep any already-added chat_group_members rows (display_name/participant_handles)
    // in sync with live chat.db data whenever we requery — runs on both the startup
    // warm-up and an explicit refresh, at no extra query cost.
    const updated = db.syncChatGroupsFromLive(result)

    return { result, updated }
  } finally {
    chatDb.close()
  }
}

/**
 * Returns [{ chat_identifier, display_name, resolved_label, participant_handles }]
 * for every existing iMessage group chat found in chat.db, sorted by most recent
 * message activity. Cached indefinitely — see computeAndCache().
 */
function listGroupChats() {
  if (_cache) return _cache
  return computeAndCache().result
}

/** Forces a fresh chat.db read regardless of the current cache state. */
function refreshGroupChats() {
  const { result, updated } = computeAndCache()
  return { chats: result, updated }
}

module.exports = { listGroupChats, refreshGroupChats }
