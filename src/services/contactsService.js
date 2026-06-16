const { execFile } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const os = require('os')
const execFileAsync = promisify(execFile)
const db = require('../../db/database')

// Output: tab-separated — macosId TAB name TAB phone TAB label TAB email TAB company TAB nickname
// One row per phone number (contacts with multiple numbers produce multiple rows).
// macosId is contactIdentifier + "|" + normalizedPhone so each number is a stable unique key.
const SWIFT_SCRIPT = `\
import Contacts

func normalizePhone(_ raw: String) -> String {
    let digits = raw.filter { $0.isNumber }
    if digits.count == 11 && digits.hasPrefix("1") {
        return String(digits.dropFirst())
    }
    return digits
}

func humanLabel(_ raw: String) -> String {
    // CNContact labels look like "_$!<Mobile>!$_" — extract the readable part
    if raw.hasPrefix("_$!<") && raw.hasSuffix(">!$_") {
        return String(raw.dropFirst(4).dropLast(4))
    }
    return raw
}

let store = CNContactStore()
let keys = [
    CNContactIdentifierKey,
    CNContactGivenNameKey,
    CNContactFamilyNameKey,
    CNContactPhoneNumbersKey,
    CNContactEmailAddressesKey,
    CNContactOrganizationNameKey,
    CNContactNicknameKey
] as [CNKeyDescriptor]
let req = CNContactFetchRequest(keysToFetch: keys)
var lines: [String] = []
do {
    try store.enumerateContacts(with: req) { contact, _ in
        let phones = contact.phoneNumbers
        guard !phones.isEmpty else { return }
        let parts    = [contact.givenName, contact.familyName].filter { !$0.isEmpty }
        let name     = parts.joined(separator: " ")
        let email    = contact.emailAddresses.first?.value as String? ?? ""
        let company  = contact.organizationName
        let nickname = contact.nickname
        var seenNorms = Set<String>()
        for labeled in phones {
            let phone = labeled.value.stringValue
            guard !phone.isEmpty else { continue }
            let norm  = normalizePhone(phone)
            guard !norm.isEmpty else { continue }
            guard seenNorms.insert(norm).inserted else { continue } // skip duplicate numbers
            let label = humanLabel(labeled.label ?? "")
            let id    = contact.identifier + "|" + phone
            lines.append("\\(id)\\t\\(name)\\t\\(phone)\\t\\(label)\\t\\(email)\\t\\(company)\\t\\(nickname)")
        }
    }
    print(lines.joined(separator: "\\n"))
} catch {
    fputs("ERROR: \\(error.localizedDescription)\\n", stderr)
    exit(1)
}`

async function syncFromMacOS() {
  console.log('[Contacts] Syncing via Swift/CNContactStore…')

  const tmpScript = path.join(os.tmpdir(), 'imessage_contacts_sync.swift')
  fs.writeFileSync(tmpScript, SWIFT_SCRIPT, 'utf8')

  let stdout
  try {
    const result = await execFileAsync('swift', [tmpScript], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    })
    stdout = result.stdout
  } catch (err) {
    const msg = (err.stderr || err.message || '').toLowerCase()
    if (msg.includes('authorization') || msg.includes('not authorized') || msg.includes('denied')) {
      console.warn('[Contacts] Permission denied — user can import via CSV.')
      return { count: 0, denied: true }
    }
    console.error('[Contacts] Swift error:', err.stderr || err.message)
    return { count: 0, denied: false, error: err.stderr || err.message }
  } finally {
    try { fs.unlinkSync(tmpScript) } catch (_) {}
  }

  // Parse TSV: macosId TAB name TAB phone TAB label TAB email TAB company TAB nickname
  const lines = stdout.split('\n').filter(Boolean)
  let inserted = 0, updated = 0
  const seenMacosIds = []
  const insertedMacosIds = []

  // Snapshot of macosIds before the sync so we can identify which ones disappear
  const prevMacosIds = db.getPrevMacOSContactIds()

  for (const line of lines) {
    const [macosId, name, phone, phoneLabel, email, company, nickname] = line.split('\t')
    if (!phone?.trim() || !macosId?.trim()) continue

    const result = db.upsertMacOSContact(
      macosId.trim(),
      (name       || '').trim(),
      phone.trim(),
      (phoneLabel || '').trim() || null,
      (email      || '').trim() || null,
      (company    || '').trim() || null,
      (nickname   || '').trim() || null,
    )
    if (result) {
      seenMacosIds.push(macosId.trim())
      if (result.action === 'inserted') {
        inserted++
        insertedMacosIds.push(macosId.trim())
      } else if (result.action === 'updated') {
        updated++
      }
    }
  }

  // Remove (or detach) contacts that are no longer in macOS Contacts
  const { removed } = seenMacosIds.length > 0
    ? db.removeStaleMacOSContacts(seenMacosIds)
    : { removed: 0 }

  // Detect edits: an insert + remove pair sharing the same contactIdentifier prefix
  // means the user edited a phone number (macosId = contactIdentifier|phone).
  const seenSet = new Set(seenMacosIds)
  const removedMacosIds = prevMacosIds.filter(id => !seenSet.has(id))
  const removedPrefixes = new Set(removedMacosIds.map(id => id.split('|')[0]))
  let edited = 0
  for (const id of insertedMacosIds) {
    if (removedPrefixes.has(id.split('|')[0])) edited++
  }
  console.log('[Contacts] Edit detection — inserted:', insertedMacosIds, 'removed:', removedMacosIds, 'edited:', edited)
  const netInserted = inserted - edited
  const netRemoved  = removed  - edited

  console.log(`[Contacts] Done — ${netInserted} new, ${updated} updated, ${edited} edited, ${netRemoved} removed.`)
  return { count: netInserted, updated, edited, removed: netRemoved, denied: false }
}

module.exports = { syncFromMacOS }
