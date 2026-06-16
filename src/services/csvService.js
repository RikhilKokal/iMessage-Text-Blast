const fs = require('fs')
const { parse } = require('csv-parse/sync')
const db = require('../../db/database')

// Expected CSV columns: name, phone, email (case-insensitive header match)
function importFromCSV(filePath) {
  console.log(`[CSV] Importing from: ${filePath}`)

  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    throw new Error(`Cannot read file: ${err.message}`)
  }

  let rows
  try {
    rows = parse(raw, {
      columns: true,          // first row is header
      skip_empty_lines: true,
      trim: true,
    })
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`)
  }

  // Normalize header names to lowercase for flexible column matching
  const normalized = rows.map((row) => {
    const lower = {}
    for (const key of Object.keys(row)) {
      lower[key.toLowerCase()] = row[key]
    }
    return {
      name: lower.name || lower.full_name || lower.fullname || '',
      phone: lower.phone || lower.phone_number || lower.phonenumber || lower.mobile || '',
      email: lower.email || lower.email_address || '',
    }
  })

  const result = db.importContactsFromCSV(normalized)
  console.log(`[CSV] Imported ${result.success}, skipped ${result.skipped}, errors: ${result.errors.length}`)
  return result
}

module.exports = { importFromCSV }
