const fs = require('fs')
const { execSync } = require('child_process')

// launchd and detached child processes run outside any shell profile, so we can't rely
// on $PATH containing nvm / homebrew entries unless we look them up now from the
// current process's own PATH.
function detectNodePath() {
  try {
    const p = execSync('which node', { shell: '/bin/bash', env: process.env }).toString().trim()
    if (p) return p
  } catch (_) { /* fall through */ }
  // Common hard-coded fallbacks
  for (const candidate of [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return 'node' // last resort — may not work from launchd
}

module.exports = { detectNodePath }
