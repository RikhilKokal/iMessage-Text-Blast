const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync } = require('child_process')

/**
 * Creates sqlite3-CLI-backed dbSelect/dbExec functions for detached helper scripts
 * that can't use better-sqlite3 (compiled for Electron's Node ABI, not the system
 * node these scripts run under).
 *
 * @param {object} opts
 * @param {string} opts.selectTmpPrefix — temp filename prefix used by dbSelect
 * @param {string} opts.execTmpPrefix   — temp filename prefix used by dbExec
 * @param {string} opts.execDbPath      — the DB dbExec always writes to
 */
function createSqliteCliAdapter({ selectTmpPrefix, execTmpPrefix, execDbPath }) {
  function dbSelect(sql, dbPath) {
    const tmpSql = path.join(os.tmpdir(), `${selectTmpPrefix}-${Date.now()}.sql`)
    fs.writeFileSync(tmpSql, sql, 'utf8')
    try {
      const out = execSync(
        `sqlite3 -separator $'\\t' "${dbPath}" < "${tmpSql}"`,
        { shell: '/bin/bash', timeout: 10000 }
      ).toString().trim()
      if (!out) return []
      return out.split('\n').map(row => row.split('\t'))
    } catch (err) {
      throw new Error(`sqlite3 query failed: ${err.stderr?.toString() || err.message}`)
    } finally {
      try { fs.unlinkSync(tmpSql) } catch (_) {}
    }
  }

  function dbExec(sql) {
    const tmpSql = path.join(os.tmpdir(), `${execTmpPrefix}-${Date.now()}.sql`)
    fs.writeFileSync(tmpSql, sql, 'utf8')
    try {
      execSync(`sqlite3 "${execDbPath}" < "${tmpSql}"`, { shell: '/bin/bash', timeout: 10000 })
    } catch (err) {
      throw new Error(`sqlite3 exec failed: ${err.stderr?.toString() || err.message}`)
    } finally {
      try { fs.unlinkSync(tmpSql) } catch (_) {}
    }
  }

  return { dbSelect, dbExec }
}

module.exports = { createSqliteCliAdapter }
