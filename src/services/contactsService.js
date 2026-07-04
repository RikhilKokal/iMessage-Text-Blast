const { execFile } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const execFileAsync = promisify(execFile)
const db = require('../../db/database')

function getBinaryPath() {
  if (process.resourcesPath && !process.resourcesPath.includes('node_modules')) {
    // Production: binary is in app Resources
    return path.join(process.resourcesPath, 'contacts_sync')
  }
  // Dev: binary is in project resources/
  return path.join(__dirname, '..', '..', 'resources', 'contacts_sync')
}

async function syncFromMacOS() {
  const binaryPath = getBinaryPath()

  let stdout
  try {
    const result = await execFileAsync(binaryPath, [], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    })
    stdout = result.stdout
  } catch (err) {
    const msg = (err.stderr || err.message || '').toLowerCase()
    if (msg.includes('authorization') || msg.includes('not authorized') || msg.includes('denied')) {
      console.warn('[Contacts] Permission denied.')
      return { count: 0, denied: true }
    }
    console.error('[Contacts] Binary error:', err.stderr || err.message)
    return { count: 0, denied: false, error: err.stderr || err.message }
  }

  // Parse TSV: macosId TAB name TAB phone TAB label TAB email TAB company TAB nickname
  const lines = stdout.split('\n').filter(Boolean)
  let inserted = 0, updated = 0
  const seenMacosIds = []
  const insertedMacosIds = []

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

  const { removed } = seenMacosIds.length > 0
    ? db.removeStaleMacOSContacts(seenMacosIds)
    : { removed: 0 }

  const seenSet = new Set(seenMacosIds)
  const removedMacosIds = prevMacosIds.filter(id => !seenSet.has(id))
  const removedPrefixes = new Set(removedMacosIds.map(id => id.split('|')[0]))
  let edited = 0
  for (const id of insertedMacosIds) {
    if (removedPrefixes.has(id.split('|')[0])) edited++
  }
  const netInserted = inserted - edited
  const netRemoved  = removed  - edited

  return { count: netInserted, updated, edited, removed: netRemoved, denied: false }
}

const ME_SCRIPT = `\
import Contacts
let store = CNContactStore()
let keys = [
    CNContactGivenNameKey, CNContactFamilyNameKey,
    CNContactPhoneNumbersKey, CNContactEmailAddressesKey,
    CNContactOrganizationNameKey, CNContactNicknameKey
] as [CNKeyDescriptor]
do {
    let me = try store.unifiedMeContactWithKeys(toFetch: keys)
    let name = [me.givenName, me.familyName].filter { !$0.isEmpty }.joined(separator: " ")
    let phone = me.phoneNumbers.first?.value.stringValue ?? ""
    let email = (me.emailAddresses.first?.value as String?) ?? ""
    let company = me.organizationName
    let nickname = me.nickname
    print("\\(name)\\t\\(phone)\\t\\(email)\\t\\(company)\\t\\(nickname)")
} catch { exit(0) }`

async function getMeContact() {
  const tmpScript = path.join(os.tmpdir(), 'imessage_me_contact.swift')
  fs.writeFileSync(tmpScript, ME_SCRIPT, 'utf8')
  try {
    const { stdout } = await execFileAsync('swift', [tmpScript], { timeout: 10000 })
    const line = stdout.trim()
    if (!line) return null
    const [name, phone, email, company, nickname] = line.split('\t')
    return { id: -1, name: name || 'Me', phone: phone || '', email: email || '', company: company || '', nickname: nickname || '', service: 'iMessage', service_confirmed: 0 }
  } catch {
    return null
  } finally {
    try { fs.unlinkSync(tmpScript) } catch (_) {}
  }
}

module.exports = { syncFromMacOS, getMeContact }
