async function run() {
  const macContacts = require('node-mac-contacts')

  const authStatus = macContacts.getAuthStatus()
  if (authStatus === 'Denied' || authStatus === 'Restricted') {
    process.parentPort.postMessage({ ok: true, denied: true, contacts: [] })
    return
  }
  if (authStatus === 'Not Determined') {
    const result = await macContacts.requestAccess()
    if (result !== 'Authorized') {
      process.parentPort.postMessage({ ok: true, denied: true, contacts: [] })
      return
    }
  }

  const contacts = macContacts.getAllContacts(['organizationName'])
  process.parentPort.postMessage({ ok: true, denied: false, contacts })
}

run().catch(err => process.parentPort.postMessage({ ok: false, error: err.message }))
