const fs = require('fs')
const { parse } = require('csv-parse/sync')
const db = require('../../db/database')

// Parse CSV file and return preview data
function parseCSVForPreview(filePath) {
  console.log(`[CSV] Parsing preview from: ${filePath}`)

  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    throw new Error(`Cannot read file: ${err.message}`)
  }

  let rows
  try {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`)
  }

  // Normalize header names to lowercase and replace spaces with underscores
  const normalized = rows.map((row) => {
    const lower = {}
    for (const key of Object.keys(row)) {
      lower[key.toLowerCase().replace(/ /g, '_')] = row[key]
    }

    // Handle name: first_name + last_name takes precedence over full_name
    let name = ''
    if (lower.first_name || lower.last_name) {
      name = [lower.first_name, lower.last_name].filter(Boolean).join(' ').trim()
    } else {
      name = lower.name || lower.full_name || lower.fullname || ''
    }

    return {
      name: name,
      phone: lower.phone || lower.phone_number || lower.phonenumber || lower.mobile || '',
    }
  })

  // Filter to only valid contacts (must have both name and phone)
  const withIds = normalized
    .map((row, idx) => ({
      idx,
      name: row.name,
      phone: row.phone,
      email: row.email,
    }))
    .filter(row => row.name && row.phone) // Only keep rows with both name AND phone

  return { rows: withIds }
}

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

  // Normalize header names to lowercase and replace spaces with underscores
  const normalized = rows.map((row) => {
    const lower = {}
    for (const key of Object.keys(row)) {
      lower[key.toLowerCase().replace(/ /g, '_')] = row[key]
    }

    // Handle name: first_name + last_name takes precedence over full_name
    let name = ''
    if (lower.first_name || lower.last_name) {
      name = [lower.first_name, lower.last_name].filter(Boolean).join(' ').trim()
    } else {
      name = lower.name || lower.full_name || lower.fullname || ''
    }

    return {
      name: name,
      phone: lower.phone || lower.phone_number || lower.phonenumber || lower.mobile || '',
    }
  })

  const result = db.importContactsFromCSV(normalized)
  console.log(`[CSV] Imported ${result.success}, skipped ${result.skipped}, errors: ${result.errors.length}`)
  return result
}

module.exports = { parseCSVForPreview, importFromCSV }
