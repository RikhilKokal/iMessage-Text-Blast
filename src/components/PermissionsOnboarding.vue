<template>
  <div class="onboarding-screen">
    <div class="onboarding-card">

      <div class="onboarding-header">
        <div class="onboarding-icon">💬</div>
        <h1 class="onboarding-title">Welcome to iMessage Bulk Scheduler</h1>
        <p class="onboarding-subtitle">
          Before you start, we need a few permissions to send messages on your behalf.
          Required permissions must be granted to continue.
        </p>
      </div>

      <div class="perm-list">
        <!-- AppleScript Automation -->
        <div class="perm-row" :class="statusClass(perms.applescript)">
          <div class="perm-info">
            <div class="perm-name-row">
              <span class="perm-name">AppleScript Automation</span>
              <span class="badge badge-required">Required</span>
            </div>
            <p class="perm-desc">Lets the app control Messages to send iMessages and SMS on your behalf.</p>
            <p v-if="perms.applescript === 'denied'" class="perm-error">
              Still denied. Enable this app in System Settings → Privacy &amp; Security → Automation, then click Check Again.
            </p>
            <p v-if="applescriptAwaitingCheck" class="perm-optional-note">
              Enable access in System Settings → Automation, then click Check Again.
            </p>
          </div>
          <div class="perm-action">
            <span v-if="perms.applescript === 'granted'" class="status-icon granted">✓</span>
            <span v-else-if="perms.applescript === 'denied'" class="status-icon denied">✗</span>
            <button v-else-if="perms.applescript === 'pending'" class="btn-perm" disabled>Checking…</button>
            <template v-else-if="applescriptAwaitingCheck">
              <button class="btn-perm" @click="recheckAppleScript">Check Again</button>
            </template>
            <button v-else class="btn-perm" @click="requestAppleScript">Allow</button>
            <button v-if="perms.applescript === 'denied'" class="btn-perm btn-retry" @click="requestAppleScript">Open System Settings</button>
          </div>
        </div>

        <!-- Contacts Access -->
        <div class="perm-row" :class="statusClass(perms.contacts)">
          <div class="perm-info">
            <div class="perm-name-row">
              <span class="perm-name">Contacts Access</span>
              <span class="badge badge-required">Required</span>
            </div>
            <p class="perm-desc">Imports your contacts so you can build groups and personalise messages.</p>
            <p v-if="perms.contacts === 'denied'" class="perm-error">
              Still denied. Enable this app in System Settings → Privacy &amp; Security → Contacts, then click Check Again.
            </p>
            <p v-if="contactsAwaitingCheck" class="perm-optional-note">
              Enable access in System Settings → Contacts, then click Check Again.
            </p>
          </div>
          <div class="perm-action">
            <span v-if="perms.contacts === 'granted'" class="status-icon granted">✓</span>
            <span v-else-if="perms.contacts === 'denied'" class="status-icon denied">✗</span>
            <button v-else-if="perms.contacts === 'pending'" class="btn-perm" disabled>Checking…</button>
            <template v-else-if="contactsAwaitingCheck">
              <button class="btn-perm" @click="recheckContacts">Check Again</button>
            </template>
            <button v-else class="btn-perm" @click="requestContacts">Allow</button>
            <button v-if="perms.contacts === 'denied'" class="btn-perm btn-retry" @click="requestContacts">Open System Settings</button>
          </div>
        </div>

        <!-- Full Disk Access -->
        <div class="perm-row" :class="statusClass(perms.fda)">
          <div class="perm-info">
            <div class="perm-name-row">
              <span class="perm-name">Full Disk Access</span>
              <span class="badge badge-optional">Optional</span>
            </div>
            <p class="perm-desc">Reads your Messages database to detect whether each contact uses iMessage or SMS, enabling automatic fallback.</p>
            <p v-if="perms.fda === 'denied'" class="perm-optional-note">
              Unavailable — you can enable this later in System Settings → Privacy &amp; Security → Full Disk Access.
            </p>
            <p v-if="!fdaAwaitingCheck && perms.fda !== 'granted'" class="perm-optional-note">
              macOS requires this to be enabled manually in System Settings.
            </p>
            <p v-if="fdaAwaitingCheck" class="perm-optional-note">
              Grant access in System Settings, then click Check Again.
            </p>
          </div>
          <div class="perm-action">
            <span v-if="perms.fda === 'granted'" class="status-icon granted">✓</span>
            <template v-else-if="fdaAwaitingCheck">
              <button class="btn-perm" @click="recheckFda">Check Again</button>
            </template>
            <button v-else-if="perms.fda === 'pending'" class="btn-perm" disabled>Checking…</button>
            <button v-else class="btn-perm btn-optional" @click="requestFda">Open System Settings</button>
          </div>
        </div>

        <!-- Mac Notifications -->
        <div class="perm-row" :class="statusClass(perms.notifications)">
          <div class="perm-info">
            <div class="perm-name-row">
              <span class="perm-name">Mac Notifications</span>
              <span class="badge badge-optional">Optional</span>
            </div>
            <p class="perm-desc">Alerts you when a scheduled or buffered send finishes delivering.</p>
            <p v-if="perms.notifications === 'denied'" class="perm-optional-note">
              Unavailable — you can enable this later in System Settings → Notifications.
            </p>
          </div>
          <div class="perm-action">
            <span v-if="perms.notifications === 'granted'" class="status-icon granted">✓</span>
            <span v-else-if="perms.notifications === 'denied'" class="status-icon denied muted">✗</span>
            <button v-else-if="perms.notifications === 'pending'" class="btn-perm" disabled>Checking…</button>
            <button v-else class="btn-perm btn-optional" @click="requestNotifications">Allow</button>
          </div>
        </div>
      </div>

      <div class="onboarding-footer">
        <button
          class="btn-continue"
          :disabled="!canContinue"
          @click="handleContinue"
        >
          Continue
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const emit = defineEmits(['done'])

const perms = ref({
  applescript:   'idle',
  contacts:      'idle',
  fda:           'idle',
  notifications: 'idle',
})

const fdaAwaitingCheck = ref(false)
const contactsAwaitingCheck = ref(false)
const applescriptAwaitingCheck = ref(false)

const canContinue = computed(() =>
  perms.value.applescript === 'granted' && perms.value.contacts === 'granted'
)

function statusClass(status) {
  if (status === 'granted') return 'row-granted'
  if (status === 'denied')  return 'row-denied'
  return ''
}

// ── AppleScript ────────────────────────────────────────────────────────────
async function requestAppleScript() {
  applescriptAwaitingCheck.value = false
  perms.value.applescript = 'pending'
  try {
    const result = await window.api.checkAppleScript()
    if (result.granted) {
      perms.value.applescript = 'granted'
    } else {
      // Already denied — open System Settings
      await window.api.openAutomationSettings()
      perms.value.applescript = 'idle'
      applescriptAwaitingCheck.value = true
    }
  } catch {
    perms.value.applescript = 'idle'
    applescriptAwaitingCheck.value = true
    await window.api.openAutomationSettings()
  }
}

async function recheckAppleScript() {
  const result = await window.api.checkAppleScript()
  perms.value.applescript = result.granted ? 'granted' : 'denied'
  applescriptAwaitingCheck.value = false
}

// ── Contacts ───────────────────────────────────────────────────────────────
async function requestContacts() {
  contactsAwaitingCheck.value = false
  perms.value.contacts = 'pending'
  try {
    const result = await window.api.syncContactsFromMacOS()
    if (!result.denied) {
      perms.value.contacts = 'granted'
    } else {
      // Already denied — open System Settings
      await window.api.openContactsSettings()
      perms.value.contacts = 'idle'
      contactsAwaitingCheck.value = true
    }
  } catch {
    perms.value.contacts = 'idle'
    contactsAwaitingCheck.value = true
    await window.api.openContactsSettings()
  }
}

async function recheckContacts() {
  const result = await window.api.syncContactsFromMacOS()
  perms.value.contacts = result.denied ? 'denied' : 'granted'
  contactsAwaitingCheck.value = false
}

// ── Full Disk Access ───────────────────────────────────────────────────────
async function requestFda() {
  perms.value.fda = 'pending'
  const check = await window.api.checkFda()
  if (check.granted) {
    perms.value.fda = 'granted'
    fdaAwaitingCheck.value = false
    return
  }
  // Not granted — open System Settings and wait for user to check again
  await window.api.openFdaSettings()
  perms.value.fda = 'idle'
  fdaAwaitingCheck.value = true
}

async function recheckFda() {
  const check = await window.api.checkFda()
  if (check.granted) {
    perms.value.fda = 'granted'
    fdaAwaitingCheck.value = false
  } else {
    perms.value.fda = 'denied'
    fdaAwaitingCheck.value = false
  }
}

// ── Notifications ──────────────────────────────────────────────────────────
async function requestNotifications() {
  perms.value.notifications = 'pending'
  const result = await Notification.requestPermission()
  perms.value.notifications = result === 'granted' ? 'granted' : 'denied'
}

// ── Continue ───────────────────────────────────────────────────────────────
function handleContinue() {
  if (!canContinue.value) return
  emit('done')
}

// ── Silent checks on mount ─────────────────────────────────────────────────
onMounted(async () => {
  // Notifications: synchronous
  const notifPerm = Notification.permission
  if (notifPerm === 'granted') perms.value.notifications = 'granted'
  else if (notifPerm === 'denied') perms.value.notifications = 'denied'

  // FDA: synchronous-ish, no dialog
  const fda = await window.api.checkFda()
  if (fda.granted) perms.value.fda = 'granted'

  // AppleScript + Contacts: only pre-check silently if we suspect they may have been granted
  // (i.e. this isn't truly first launch). We check AppleScript silently — it won't re-prompt.
  const as = await window.api.checkAppleScript()
  if (as.granted) perms.value.applescript = 'granted'

  // Contacts: a sync with silent=true won't prompt but will return denied if not granted
  const contacts = await window.api.syncContactsFromMacOS()
  if (!contacts.denied && contacts.count >= 0) perms.value.contacts = 'granted'

})
</script>

<style scoped>
.onboarding-screen {
  position: fixed;
  inset: 0;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  padding: 24px;
  -webkit-app-region: drag;
}

.onboarding-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.onboarding-header {
  padding: 32px 32px 24px;
  text-align: center;
  border-bottom: 1px solid var(--border);
}

.onboarding-icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 12px;
}

.onboarding-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 8px;
}

.onboarding-subtitle {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.55;
  margin: 0;
  max-width: 400px;
  margin-inline: auto;
}

/* ── Permission rows ─────────────────────────────────────────────────────── */
.perm-list {
  display: flex;
  flex-direction: column;
}

.perm-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.perm-row.row-granted { background: rgba(52, 199, 89, 0.06); }
.perm-row.row-denied  { background: rgba(255, 59, 48, 0.05); }

.perm-info {
  flex: 1;
  min-width: 0;
}

.perm-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.perm-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.badge-required {
  background: var(--accent-tint);
  color: var(--accent-tint-text);
  border: 1px solid var(--accent-tint-border);
}

.badge-optional {
  background: var(--bg);
  color: var(--text-2);
  border: 1px solid var(--border);
}

.perm-desc {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
  margin: 0;
}

.perm-error {
  font-size: 11px;
  color: var(--danger);
  margin: 6px 0 0;
  line-height: 1.4;
}

.perm-optional-note {
  font-size: 11px;
  color: var(--text-2);
  opacity: 0.7;
  margin: 6px 0 0;
  line-height: 1.4;
}

/* ── Action column ───────────────────────────────────────────────────────── */
.perm-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
  padding-top: 2px;
}

.status-icon {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.status-icon.granted { color: var(--success); }
.status-icon.denied  { color: var(--danger); }
.status-icon.muted   { opacity: 0.5; }

.btn-perm {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, opacity 0.12s;
}

.btn-perm:hover { background: var(--accent-h); border-color: var(--accent-h); }
.btn-perm:disabled { opacity: 0.5; cursor: default; }

.btn-perm.btn-optional {
  background: var(--surface);
  color: var(--accent);
}
.btn-perm.btn-optional:hover { background: var(--accent-tint); }

.btn-perm.btn-retry {
  background: var(--surface);
  color: var(--danger);
  border-color: var(--danger);
  font-size: 11px;
  padding: 4px 10px;
}
.btn-perm.btn-retry:hover { background: var(--error-tint); }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.onboarding-footer {
  padding: 20px 24px;
  display: flex;
  justify-content: flex-end;
}

.btn-continue {
  padding: 10px 28px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font);
  cursor: pointer;
  transition: background 0.12s, opacity 0.12s;
}

.btn-continue:hover:not(:disabled) { background: var(--accent-h); }

.btn-continue:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
