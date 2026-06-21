<template>
  <div class="drag-region" />
  <div class="app-container">
    <!-- Left Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>Groups</h2>
        <button class="btn-icon-new" @click="showCreateDialog = true" title="New group">+</button>
      </div>
      <GroupsList
        :groups="groups"
        :selectedGroupId="selectedGroupId"
        @select="selectGroup"
      />

      <div class="sidebar-section-header">
        <span>Templates</span>
        <button class="btn-icon-new" @click="createNewTemplate" title="New template">+</button>
      </div>
      <TemplatesList
        :templates="templates"
        :selectedTemplateId="selectedTemplateId"
        @select="selectTemplate"
      />

      <div class="sidebar-footer">
        <button class="btn-secondary small full-width" @click="showHistory = true">
          📋 Send History
        </button>
        <button class="btn-secondary small full-width" @click="showScheduled = true">
          🕐 Scheduled Texts
        </button>
        <button class="btn-secondary small full-width" @click="syncContacts()" :disabled="syncing">
          {{ syncing ? 'Syncing…' : '↻ Refresh Contacts' }}
        </button>
        <button class="btn-secondary small full-width" @click="toggleTheme">
          {{ isDark ? '☀️ Light Mode' : '🌙 Dark Mode' }}
        </button>
        <div class="notif-toggle-row">
          <span>Mac Notifications</span>
          <button
            class="toggle-switch"
            :class="{ on: macNotifs }"
            @click="toggleMacNotifs"
            :aria-label="macNotifs ? 'Disable Mac notifications' : 'Enable Mac notifications'"
          ><span class="toggle-knob"></span></button>
        </div>
        <button
          v-if="scheduledSyncPreference"
          class="btn-secondary small full-width reset-sync-pref"
          @click="resetScheduledSyncPreference"
          :title="`Currently set to always ${scheduledSyncPreference === 'always' ? 'add/remove' : 'skip'} scheduled text updates`"
        >
          ↺ Reset schedule sync preference
        </button>
        <div v-if="lastSyncTime" class="sync-time">
          Last sync: {{ lastSyncTime.toLocaleTimeString() }}
        </div>
      </div>
    </div>

    <!-- FDA Banner -->
    <div v-if="fdaBanner" class="fda-banner">
      <span>⚠️ <strong>Full Disk Access needed</strong> for automatic iMessage → SMS routing.</span>
      <div class="fda-banner-actions">
        <button class="fda-btn-open" @click="openFdaSettings">Open Settings</button>
        <button class="fda-btn-check" @click="recheckFda">Check Again</button>
        <button class="fda-btn-dismiss" @click="fdaBanner = false">Dismiss</button>
      </div>
    </div>

    <!-- Main Panel -->
    <div class="main-panel">
      <GroupDetail
        v-if="selectedGroup"
        :group="selectedGroup"
        :members="groupMembers"
        :hasFda="!fdaBanner"
        @update-name="updateGroupName"
        @delete-group="deleteGroup"
        @add-member="addMemberToGroup"
        @remove-member="removeMemberFromGroup"
        @set-service="selectGroup(selectedGroupId)"
      />
      <TemplateDetail
        v-else-if="selectedTemplate"
        :template="selectedTemplate"
        :groups="groups"
        :draft="templateDrafts[selectedTemplate.id] ?? null"
        :hasFda="!fdaBanner"
        @deleted="onTemplateDeleted"
        @updated="loadTemplates"
        @renamed="onTemplateRenamed"
        @draft="onTemplateDraft"
        @saved="onTemplateSaved"
      />
      <div v-else-if="groupsLoading" class="empty-state-center">
        <p class="loading-text">Loading groups…</p>
      </div>
      <div v-else class="empty-state-center">
        <div class="empty-icon">💬</div>
        <p>Select a group or create a new one to get started.</p>
        <button class="btn-primary" @click="showCreateDialog = true">+ New Group</button>
      </div>
    </div>

    <div v-if="toast.message" class="app-banner" :class="toast.type">
      {{ toast.message }}
    </div>

    <div class="app-toast-stack">
      <template v-if="collapsedModeActive">
        <div class="collapsed-toast" @click="showNotificationsPanel = true">
          <div class="toast-icon">ℹ</div>
          <div class="toast-body">
            <div class="toast-title">You have {{ notificationsLog.length }} notifications</div>
            <div class="toast-message">Click to view all</div>
          </div>
          <button class="toast-close" @click.stop="clearAllToasts" title="Dismiss all">×</button>
        </div>
      </template>
      <template v-else>
        <Toast
          v-for="t in appToasts"
          :key="t.id"
          :visible="true"
          :title="t.title"
          :message="t.message"
          :type="t.type"
          :duration="t.duration"
          :stacked="true"
          @close="removeAppToast(t.id)"
        />
      </template>
    </div>

    <NotificationsPanel
      v-if="showNotificationsPanel"
      :toasts="notificationsLog"
      @close="clearAllToasts"
    />

    <AttachmentErrorDialog
      v-if="pendingAttachmentError"
      :error="pendingAttachmentError"
      @send-text="onSendTextOnly"
      @dismiss="pendingAttachmentError = null"
    />

    <!-- Create Group Dialog -->
    <CreateGroupDialog
      v-if="showCreateDialog"
      :error="createGroupError"
      @create="createGroup"
      @close="showCreateDialog = false; createGroupError = ''"
    />

    <SendHistoryDashboard
      v-if="showHistory"
      @close="showHistory = false"
    />
    <ScheduledSendsDashboard
      v-if="showScheduled"
      :refresh-key="scheduledRefreshKey"
      @close="showScheduled = false"
    />

    <!-- Scheduled sync modal -->
    <ScheduledSyncModal
      v-if="scheduledSyncModal"
      :contactName="scheduledSyncModal.contactName"
      :action="scheduledSyncModal.action"
      :sends="scheduledSyncModal.sends"
      @confirm="onSyncModalConfirm"
      @cancel="onSyncModalCancel"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'

import GroupsList from './components/GroupsList.vue'
import GroupDetail from './components/GroupDetail.vue'
import TemplatesList from './components/TemplatesList.vue'
import TemplateDetail from './components/TemplateDetail.vue'
import CreateGroupDialog from './components/CreateGroupDialog.vue'
import SendHistoryDashboard    from './components/SendHistoryDashboard.vue'
import ScheduledSendsDashboard from './components/ScheduledSendsDashboard.vue'
import ScheduledSyncModal from './components/ScheduledSyncModal.vue'
import Toast from './components/Toast.vue'
import NotificationsPanel from './components/NotificationsPanel.vue'
import AttachmentErrorDialog from './components/AttachmentErrorDialog.vue'

// ── Theme ──────────────────────────────────────────────────────────────────
const isDark = ref(localStorage.getItem('theme') === 'dark')
const macNotifs = ref(localStorage.getItem('macNotifs') !== 'false')

function toggleMacNotifs() {
  macNotifs.value = !macNotifs.value
  localStorage.setItem('macNotifs', String(macNotifs.value))
  window.api.setMacNotifs(macNotifs.value)
}
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}
function toggleTheme() {
  isDark.value = !isDark.value
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  applyTheme(isDark.value)
}
applyTheme(isDark.value)

const groups = ref([])
const selectedGroupId = ref(null)
const groupsLoading = ref(true)
const groupMembers = ref([])
const showCreateDialog = ref(false)
const showHistory   = ref(false)
const showScheduled = ref(false)
const syncing = ref(false)
const lastSyncTime = ref(null)
const toast = ref({ message: '', type: 'success' })
const scheduledRefreshKey = ref(0)
const appToasts = ref([])
const notificationsLog = ref([])
const collapsedModeActive = ref(false)
const showNotificationsPanel = ref(false)
const pendingAttachmentError = ref(null)
let   appToastSeq = 0
function addAppToast(title, message = '', type = 'info', duration = 4000) {
  const id = ++appToastSeq
  const entry = { id, title, message, type, duration }

  if (collapsedModeActive.value) {
    notificationsLog.value.push(entry)
    return
  }

  appToasts.value.push(entry)

  if (appToasts.value.length > 3) {
    notificationsLog.value.push(...appToasts.value)
    appToasts.value = []
    collapsedModeActive.value = true
  }
}
function removeAppToast(id) {
  appToasts.value = appToasts.value.filter(t => t.id !== id)
}
provide('addToast', addAppToast)

function clearAllToasts() {
  appToasts.value = []
  notificationsLog.value = []
  collapsedModeActive.value = false
  showNotificationsPanel.value = false
}

const fdaBanner = ref(false)

async function recheckFda() {
  const result = await window.api.checkFda()
  fdaBanner.value = !result.granted
  if (result.granted) showToast('Full Disk Access granted — automatic routing enabled.')
}

function openFdaSettings() {
  // Deep-link to the Full Disk Access pane in System Settings
  window.api.openFdaSettings?.() // graceful if not wired
}

const selectedGroup = computed(() =>
  groups.value.find((g) => g.id === selectedGroupId.value) ?? null
)

// ── Templates ───────────────────────────────────────────────────────────────
const templates = ref([])
const selectedTemplateId = ref(null)
const selectedTemplate = computed(() =>
  templates.value.find(t => t.id === selectedTemplateId.value) ?? null
)

async function loadTemplates() {
  templates.value = await window.api.getTemplates()
}

function selectTemplate(id) {
  selectedTemplateId.value = id
  selectedGroupId.value = null
}

async function createNewTemplate() {
  try {
    const existingNames = new Set(templates.value.map(t => t.name))
    let name = 'New Template'
    let n = 2
    while (existingNames.has(name)) name = `New Template ${n++}`
    const { id } = await window.api.createTemplate(name, '', [])
    await loadTemplates()
    selectTemplate(id)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

async function onTemplateDeleted() {
  selectedTemplateId.value = null
  await loadTemplates()
}

async function onTemplateRenamed() {
  await loadTemplates()
  showToast('Template renamed.')
}

const templateDrafts = ref({})

function onTemplateDraft({ id, body, attachments }) {
  templateDrafts.value = { ...templateDrafts.value, [id]: { body, attachments } }
}
function onTemplateSaved(id) {
  const d = { ...templateDrafts.value }
  delete d[id]
  templateDrafts.value = d
}

let toastTimer = null
function showToast(message, type = 'success') {
  toast.value = { message, type }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = { message: '', type: 'success' } }, 3500)
}

async function loadGroups() {
  groups.value = await window.api.getGroups()
  groupsLoading.value = false
}

async function selectGroup(groupId) {
  selectedGroupId.value = groupId
  selectedTemplateId.value = null
  groupMembers.value = await window.api.getGroupMembers(groupId)
}

const createGroupError = ref('')

async function createGroup(name) {
  createGroupError.value = ''
  try {
    await window.api.createGroup(name)
    showCreateDialog.value = false
    createGroupError.value = ''
    await loadGroups()
    const created = groups.value.find((g) => g.name === name)
    if (created) await selectGroup(created.id)
    showToast(`Group "${name}" created.`)
  } catch (err) {
    if (/unique|already exists/i.test(err.message)) {
      createGroupError.value = `A group named "${name}" already exists. Please choose a different name.`
    } else {
      showToast(err.message, 'error')
    }
  }
}

async function updateGroupName(newName) {
  try {
    await window.api.updateGroupName(selectedGroupId.value, newName)
    await loadGroups()
    showToast('Group renamed.')
  } catch (err) {
    const msg = /UNIQUE constraint failed|already exists/i.test(err.message)
      ? `A group named "${newName}" already exists. Please choose a different name.`
      : err.message
    addAppToast('Rename failed', msg, 'error')
  }
}

async function deleteGroup() {
  if (!selectedGroup.value) return
  const name = selectedGroup.value.name
  try {
    await window.api.deleteGroup(selectedGroupId.value)
    selectedGroupId.value = null
    groupMembers.value = []
    await loadGroups()
    showToast(`Group "${name}" deleted.`)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ── Scheduled sync preference ─────────────────────────────────────────────
const SYNC_PREF_KEY = 'scheduledSyncPreference'
const scheduledSyncPreference = ref(localStorage.getItem(SYNC_PREF_KEY) || null)
const scheduledSyncModal = ref(null) // { contactName, contactId, action, sends, groupMembers, resolve }

function resetScheduledSyncPreference() {
  localStorage.removeItem(SYNC_PREF_KEY)
  scheduledSyncPreference.value = null
  showToast("Schedule sync preference cleared. You'll be asked again next time.")
}

async function applyScheduledSync(action, contactId, sends, allGroupMembers) {
  const cid = Number(contactId)
  for (const send of sends) {
    const existingIds = send.member_ids ? JSON.parse(send.member_ids).map(Number) : null
    let newIds
    if (action === 'add') {
      if (existingIds === null) continue // null means "all" — already included
      if (existingIds.includes(cid)) continue // already in the list
      newIds = [...existingIds, cid]
    } else {
      if (existingIds !== null && !existingIds.includes(cid)) continue // not in explicit list, nothing to remove
      const base = existingIds ?? allGroupMembers.map(m => Number(m.id))
      newIds = base.filter(id => id !== cid)
      const remainingCount = allGroupMembers.filter(m => Number(m.id) !== cid).length
      if (newIds.length === remainingCount) newIds = null // covers everyone remaining — back to "all"
    }
    const interval = send.schedule_interval ? JSON.parse(send.schedule_interval) : {}
    const scheduleData = send.schedule_type === 'once'
      ? { dateTime: send.next_run }
      : { interval: interval.interval, time: interval.time, weekday: interval.weekday, monthDay: interval.monthDay }
    await window.api.updateScheduledSend(send.id, send.launchd_plist_id, send.template_text, send.schedule_type, scheduleData, newIds)
  }
}

async function maybePromptScheduledSync(action, contactId, contactName, allGroupMembers) {
  const sends = await window.api.getScheduledSends(selectedGroupId.value)
  if (!sends.length) return

  const pref = scheduledSyncPreference.value

  if (pref === 'always') {
    await applyScheduledSync(action, contactId, sends, allGroupMembers)
    return
  }
  if (pref === 'never') {
    // Still need to pin explicit lists for removes so the contact isn't silently dropped
    if (action === 'remove') {
      const cid = Number(contactId)
      for (const send of sends) {
        if (send.member_ids !== null) continue
        const pinnedIds = allGroupMembers.map(m => Number(m.id))
        const interval = send.schedule_interval ? JSON.parse(send.schedule_interval) : {}
        const scheduleData = send.schedule_type === 'once'
          ? { dateTime: send.next_run }
          : { interval: interval.interval, time: interval.time, weekday: interval.weekday, monthDay: interval.monthDay }
        await window.api.updateScheduledSend(send.id, send.launchd_plist_id, send.template_text, send.schedule_type, scheduleData, pinnedIds)
      }
    }
    return
  }

  await new Promise(resolve => {
    scheduledSyncModal.value = { contactName, contactId, action, sends, allGroupMembers, resolve }
  })
}

async function onSyncModalConfirm(saveChoice) {
  const { contactId, action, sends, allGroupMembers, resolve } = scheduledSyncModal.value
  scheduledSyncModal.value = null
  if (saveChoice) {
    localStorage.setItem(SYNC_PREF_KEY, 'always')
    scheduledSyncPreference.value = 'always'
  }
  await applyScheduledSync(action, contactId, sends, allGroupMembers)
  resolve()
}

async function onSyncModalCancel(saveChoice) {
  const { contactId, action, sends, allGroupMembers, resolve } = scheduledSyncModal.value
  scheduledSyncModal.value = null
  if (saveChoice) {
    localStorage.setItem(SYNC_PREF_KEY, 'never')
    scheduledSyncPreference.value = 'never'
  }
  // When declining to remove someone, any send with member_ids=null (all members)
  // must be pinned to an explicit list that still includes the removed contact —
  // otherwise they'd be silently dropped because they're no longer in the group.
  if (action === 'remove') {
    const cid = Number(contactId)
    for (const send of sends) {
      if (send.member_ids !== null) continue // explicit list already preserved
      const pinnedIds = allGroupMembers.map(m => Number(m.id)) // includes the removed contact
      const interval = send.schedule_interval ? JSON.parse(send.schedule_interval) : {}
      const scheduleData = send.schedule_type === 'once'
        ? { dateTime: send.next_run }
        : { interval: interval.interval, time: interval.time, weekday: interval.weekday, monthDay: interval.monthDay }
      await window.api.updateScheduledSend(send.id, send.launchd_plist_id, send.template_text, send.schedule_type, scheduleData, pinnedIds)
    }
  }
  resolve()
}

async function addMemberToGroup(contactId) {
  try {
    await window.api.addMemberToGroup(selectedGroupId.value, contactId)
    await selectGroup(selectedGroupId.value)
    await loadGroups()
    const contact = groupMembers.value.find(m => m.id === contactId)
    const name = contact?.name ?? 'This person'
    await maybePromptScheduledSync('add', contactId, name, groupMembers.value)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

async function removeMemberFromGroup(contactId) {
  try {
    const contact = groupMembers.value.find(m => m.id === contactId)
    const name = contact?.name ?? 'This person'
    const membersWithContact = [...groupMembers.value] // capture before removal
    await window.api.removeMemberFromGroup(selectedGroupId.value, contactId)
    await selectGroup(selectedGroupId.value)
    await loadGroups()
    await maybePromptScheduledSync('remove', contactId, name, membersWithContact)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// silent=true → only show a toast on errors or when new contacts are actually found
async function syncContacts(silent = false) {
  syncing.value = true
  try {
    const result = await window.api.syncContactsFromMacOS()
    lastSyncTime.value = new Date()
    if (result.denied) {
      showToast('Contacts permission denied. Import via CSV instead.', 'error')
    } else {
      const parts = []
      if (result.count   > 0) parts.push(`${result.count} new`)
      if (result.updated > 0) parts.push(`${result.updated} updated`)
      if (result.edited  > 0) parts.push(`${result.edited} edited`)
      if (result.removed > 0) parts.push(`${result.removed} removed`)
      if (parts.length > 0) {
        showToast(`Contacts synced: ${parts.join(', ')}.`)
      } else if (!silent) {
        showToast('Contacts up to date.')
      }
    }
  } catch (err) {
    console.error('[Contacts] Sync error:', err.message)
  } finally {
    syncing.value = false
    if (selectedGroupId.value) await selectGroup(selectedGroupId.value)
  }
}

onMounted(async () => {
  // Check Full Disk Access — needed for auto iMessage→SMS routing via chat.db
  const fda = await window.api.checkFda()
  fdaBanner.value = !fda.granted

  // Sync notification preference to main process
  window.api.setMacNotifs(macNotifs.value)

  // Silent background sync on launch — only toasts if new contacts are found
  await syncContacts(true)
  await loadGroups()
  await loadTemplates()

  // When the scheduled-send-helper finishes, reload the current group,
  // refresh the scheduled sends dashboard, and show a toast.
  window.api.onDbExternalChange(async (_event, result) => {
    // Reload whichever group the scheduled send targeted (may differ from selected group)
    const affectedGroupId = result?.groupId ?? selectedGroupId.value
    if (affectedGroupId) await selectGroup(affectedGroupId)
    await loadGroups()
    scheduledRefreshKey.value++

    if (result?.isError) return  // handled via attachment:errors channel

    if (result) {
      const noun = result.succeeded === 1 ? 'person' : 'people'
      const time = result.sentAt
        ? new Date(result.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : ''
      const group = result.groupName ?? 'group'
      if (result.failed === 0) {
        addAppToast(`Scheduled message to ${group} sent at ${time}`, `Delivered to ${result.succeeded} ${noun}.`, 'success')
      } else {
        addAppToast(`Scheduled message to ${group} sent at ${time}`, `Sent ${result.succeeded}, failed ${result.failed}.`, 'error')
      }
      if (result.autoRouted?.length) {
        const n = result.autoRouted.length === 1 ? 'contact' : 'contacts'
        addAppToast(
          `${result.autoRouted.length} ${n} switched to SMS`,
          `${result.autoRouted.join(', ')} — iMessage failed, sent as SMS instead. Future sends will use SMS automatically.`,
          'info', 7000
        )
      }
    }
  })

  window.api.onBufferComplete(async (data) => {
    const noun = data.succeeded === 1 ? 'message' : 'messages'
    addAppToast('Buffered send complete', `All ${data.succeeded} ${noun} delivered.`, 'success')
    if (data.autoRouted?.length) {
      const n = data.autoRouted.length === 1 ? 'contact' : 'contacts'
      addAppToast(
        `${data.autoRouted.length} ${n} switched to SMS`,
        `${data.autoRouted.join(', ')} — iMessage failed, sent as SMS instead. Future sends will use SMS automatically.`,
        'info', 7000
      )
      // Reload the current group so the service badge updates
      if (selectedGroupId.value) await selectGroup(selectedGroupId.value)
      await loadGroups()
    }
  })

  window.api.onAttachmentErrors((errors) => {
    if (errors.length && !pendingAttachmentError.value) {
      pendingAttachmentError.value = errors[0]
    }
  })
})

async function onSendTextOnly(scheduledSendId) {
  try {
    await window.api.sendTextOnly(scheduledSendId)
    scheduledRefreshKey.value++
    await loadGroups()
    addAppToast('Message sent', 'Text sent successfully without the missing image.', 'success')
  } catch (err) {
    addAppToast('Send failed', err.message, 'error')
  } finally {
    pendingAttachmentError.value = null
  }
}
</script>

<style>
/* ── FDA Banner ──────────────────────────────────────────────────────────── */
.fda-banner {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: var(--warn-tint);
  border-bottom: 1px solid var(--warn);
  font-size: 13px;
  color: var(--warn-tint-text);
}
.fda-banner-actions { display: flex; gap: 8px; flex-shrink: 0; }
.fda-btn-open    { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--warn); background: var(--warn-tint); color: var(--warn-tint-text); font-size: 12px; font-weight: 600; cursor: pointer; }
.fda-btn-check   { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--warn); background: transparent; color: var(--warn-tint-text); font-size: 12px; cursor: pointer; }
.fda-btn-dismiss { padding: 4px 8px;  border-radius: 6px; border: none; background: transparent; color: var(--warn-tint-text); font-size: 12px; cursor: pointer; }

/* ── Reset ───────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --sidebar-w: 240px;
  --bg: #f5f5f7;
  --surface: #ffffff;
  --border: #d1d1d6;
  --text: #1d1d1f;
  --text-2: #6e6e73;
  --accent: #007aff;
  --accent-h: #0051d5;
  --danger: #ff3b30;
  --danger-h: #c0392b;
  --success-bg: var(--success-tint);
  --success-fg: var(--success-tint-text);
  --error-bg:   var(--error-tint);
  --error-fg:   var(--error-tint-text);
  --radius: 8px;
  --font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

#app { height: 100vh; }

button {
  font-family: var(--font);
  font-size: 13px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
button:hover:not(:disabled) { background: var(--bg); }
button:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-primary  { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-h); }
.btn-danger   { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn-danger:hover:not(:disabled) { background: var(--danger-h); }
.btn-secondary { background: var(--surface); color: var(--text); }
.btn-secondary:hover:not(:disabled) { background: var(--bg); }
.small { padding: 4px 10px; font-size: 12px; }

input[type="text"], input:not([type]) {
  font-family: var(--font);
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 7px 10px;
  outline: none;
  transition: border-color 0.15s;
}
input:focus { border-color: var(--accent); }

/* ── Scrollbar ───────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
</style>

<style scoped>
.drag-region {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 20px;
  -webkit-app-region: drag;
  z-index: 0;
}

.app-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding-top: 44px; /* room for hiddenInset titlebar traffic lights */
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 12px;
  border-bottom: 1px solid var(--border);
}
.sidebar-header h2 { font-size: 15px; font-weight: 600; }

.btn-icon-new {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  background: var(--accent);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-icon-new:hover { background: var(--accent-h); }

.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 4px;
  border-top: 1px solid var(--border);
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  text-transform: none;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.full-width { width: 100%; justify-content: center; }

.sync-time {
  font-size: 11px;
  color: var(--text-2);
  text-align: center;
}

.reset-sync-pref {
  font-size: 11px;
  color: var(--text-2);
  border-color: var(--border);
}

/* ── Main Panel ──────────────────────────────────────────────────────────── */
.main-panel {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.empty-state-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-2);
}
.empty-icon { font-size: 48px; }
.loading-text { font-size: 14px; color: var(--text-2); font-style: italic; }
.empty-state-center p { font-size: 15px; }

/* ── Toast ───────────────────────────────────────────────────────────────── */
.app-banner {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 9999;
  pointer-events: none;
  white-space: nowrap;
}
.app-banner.success { background: var(--success-bg); color: var(--success-fg); }
.app-banner.error   { background: var(--error-bg);   color: var(--error-fg); }
.app-banner.info    { background: var(--accent-tint); color: var(--accent-tint-text); }

.app-toast-stack {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  align-items: flex-end;
  pointer-events: none;
}
.app-toast-stack > * { pointer-events: all; }

.collapsed-toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius);
  padding: 14px 16px;
  max-width: 380px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  cursor: pointer;
  transition: background 0.12s;
}
.collapsed-toast:hover { background: var(--bg); }

.collapsed-toast .toast-icon {
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--accent);
}
.collapsed-toast .toast-body { flex: 1; min-width: 0; }
.collapsed-toast .toast-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}
.collapsed-toast .toast-message {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 3px;
}
.collapsed-toast .toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-2);
  font-size: 18px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: -2px;
}
.collapsed-toast .toast-close:hover { color: var(--text); background: none; }

.notif-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
  font-size: 12px;
  color: var(--text-2);
}
.toggle-switch {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--border);
  border: none;
  cursor: pointer;
  padding: 0;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle-switch.on { background: #34c759; }
.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  display: block;
}
.toggle-switch.on .toggle-knob { transform: translateX(16px); }
</style>
