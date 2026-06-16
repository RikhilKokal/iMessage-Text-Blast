<template>
  <div class="group-detail">
    <!-- Header -->
    <div class="detail-header">
      <div class="title-area">
        <input
          v-if="editingName"
          ref="nameInput"
          v-model="draftName"
          class="name-editor"
          @blur="saveName"
          @keyup.enter="saveName"
          @keyup.escape="cancelEdit"
        />
        <h1 v-else class="group-title" @click="startEdit" title="Click to rename">
          {{ group.name }}
          <span class="edit-hint">✎</span>
        </h1>
        <div class="member-badge">{{ members.length }} {{ members.length === 1 ? 'member' : 'members' }}</div>
      </div>
      <button class="btn-danger" @click="showDeleteDialog = true">Delete Group</button>
    </div>

    <!-- Scrollable body -->
    <div class="detail-body">

      <!-- ── Members ── -->
      <section class="card">
        <div class="card-header">
          <h2>Members</h2>
          <div class="card-header-right">
            <label v-if="members.length > 0" class="select-all-label">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              All
            </label>
            <button
              v-if="members.length > 0"
              class="btn-secondary small"
              :disabled="checkingCapability"
              @click="checkCapability"
            >{{ checkingCapability ? `Checking ${checkedCount}/${props.members.length}…` : '🔍 Check iMessage' }}</button>
            <button class="btn-primary small" @click="showAddModal = true">+ Add Member</button>
          </div>
        </div>

        <div v-if="members.length > 0" class="members-list">
          <div
            v-for="member in members"
            :key="member.id"
            class="member-row"
            :class="{ 'member-deselected': !selectedMemberIds.has(member.id) }"
          >
            <span
              class="member-checkbox"
              :class="{ checked: selectedMemberIds.has(member.id) }"
              @click.stop="toggleMember(member.id)"
            ></span>
            <div class="member-avatar">{{ initials(member.name) }}</div>
            <div class="member-info">
              <div class="member-name">{{ member.name }}</div>
              <div class="member-sub">{{ member.phone }}{{ member.email ? ` · ${member.email}` : '' }}</div>
            </div>
            <button
              class="btn-service"
              :class="!member.service_confirmed ? 'unknown' : member.service === 'SMS' ? 'sms' : 'imessage'"
              :title="!member.service_confirmed ? 'Unknown — click to set as iMessage' : member.service === 'SMS' ? 'Click to switch to iMessage' : 'Click to switch to SMS'"
              @click="toggleService(member)"
            >{{ !member.service_confirmed ? 'Unknown' : member.service === 'SMS' ? '📱 SMS' : '💬 iMessage' }}</button>
            <button class="btn-remove" @click="$emit('remove-member', member.id)" title="Remove">×</button>
          </div>
        </div>
        <div v-else class="empty-card">No members yet — click "+ Add Member" to get started.</div>
      </section>

      <!-- ── Template ── -->
      <section class="card">
        <div class="card-header">
          <h2>Message Template</h2>
        </div>

        <TokenEditor
          ref="tokenEditorEl"
          v-model="template"
          :tokens="TOKEN_LABELS"
          placeholder="Write your message here… use the variable buttons below to personalize."
        />

        <!-- Variable picker -->
        <div class="var-picker">
          <span class="var-label">Insert:</span>
          <button
            v-for="v in VARIABLES"
            :key="v.key"
            class="var-btn"
            :title="'Insert ' + v.label"
            @click="insertVariable(v.key)"
            v-text="v.label"></button>
        </div>

        <!-- Preview -->
        <MessagePreview
          v-if="template.trim() && selectedMembers.length > 0"
          :template="template"
          :contacts="selectedMembers"
        />
        <div v-else class="preview-placeholder">
          {{ !template.trim() ? 'Type a message above to see a live preview.' : 'Add members to see a preview.' }}
        </div>
      </section>

      <!-- ── Send ── -->
      <section class="send-bar">
        <p class="send-info">
          You're about to send to <strong>{{ selectedMembers.length }}</strong> of {{ members.length }} {{ members.length === 1 ? 'person' : 'people' }}
        </p>
        <div class="send-actions">
          <button :disabled="!canSend" @click="checkUnknownThenProceed(() => showScheduleModal = true)">Schedule</button>
          <button class="btn-primary" :disabled="!canSend || isSending" @click="checkUnknownThenProceed(sendNow)">
            <template v-if="!isSending">Send Now</template>
            <template v-else-if="sendProgress">
              Sent {{ sendProgress.sent }} / {{ sendProgress.total }}…
            </template>
            <template v-else>Sending…</template>
          </button>
        </div>
      </section>

    </div><!-- end detail-body -->

    <!-- ── Modals ── -->
    <AddMemberModal
      v-if="showAddModal"
      :existingMemberIds="members.map(m => m.id)"
      @add="onAdd"
      @close="showAddModal = false"
    />

    <DeleteConfirmDialog
      v-if="showDeleteDialog"
      :groupName="group.name"
      @confirm="confirmDelete"
      @close="showDeleteDialog = false"
    />

    <ScheduleModal
      v-if="showScheduleModal"
      @schedule="handleSchedule"
      @close="showScheduleModal = false"
    />

    <!-- Unknown recipients warning -->
    <div v-if="unknownWarning" class="modal-overlay" @click.self="unknownWarning = null">
      <div class="unknown-warning-box">
        <h3>Messaging app unknown for some recipients</h3>
        <p>
          No message history found for <strong>{{ unknownWarning.names.join(', ') }}</strong>, so we can't tell if they use iMessage or SMS.
        </p>
        <p>
          If you know, you can set it using the "Unknown" label next to their name. If not, don't worry. The message will still deliver, though you may see a brief error notification while it sends.
        </p>
        <div class="unknown-warning-actions">
          <button @click="unknownWarning = null">Go Back</button>
          <button class="btn-primary" @click="unknownWarning.proceed()">Send Anyway</button>
        </div>
      </div>
    </div>

    <div class="toast-stack">
      <Toast
        v-for="t in toasts"
        :key="t.id"
        :visible="true"
        :title="t.title"
        :message="t.message"
        :type="t.type"
        :duration="t.duration"
        :stacked="true"
        @close="removeToast(t.id)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import Toast from './Toast.vue'
import AddMemberModal      from './AddMemberModal.vue'
import DeleteConfirmDialog from './DeleteConfirmDialog.vue'
import MessagePreview      from './MessagePreview.vue'
import ScheduleModal       from './ScheduleModal.vue'
import TokenEditor         from './TokenEditor.vue'

// ── Props & emits ──────────────────────────────────────────────────────────
const props = defineProps({
  group:   { type: Object, required: true },
  members: { type: Array,  default: () => [] },
})
const emit = defineEmits(['update-name', 'delete-group', 'add-member', 'remove-member', 'set-service'])

// ── Variables supported in Tier 1 ─────────────────────────────────────────
const VARIABLES = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName',  label: 'Last Name'  },
  { key: 'fullName',  label: 'Full Name'  },
  { key: 'email',     label: 'Email'      },
  { key: 'phone',     label: 'Phone'      },
  { key: 'company',   label: 'Company'    },
  { key: 'nickname',  label: 'Nickname'   },
]

const TOKEN_LABELS = Object.fromEntries(VARIABLES.map(v => [v.key, v.label]))

// ── State ──────────────────────────────────────────────────────────────────
const editingName     = ref(false)
const draftName       = ref('')
const nameInput       = ref(null)
const tokenEditorEl   = ref(null)
const showAddModal    = ref(false)
const showDeleteDialog = ref(false)
const showScheduleModal = ref(false)
const template          = ref('')
const selectedMemberIds = ref(new Set())
const knownMemberIds    = ref(new Set())
const isSending    = ref(false)
const sendProgress = ref(null)

// ── Computed ───────────────────────────────────────────────────────────────
const selectedMembers = computed(() => props.members.filter(m => selectedMemberIds.value.has(m.id)))
const allSelected     = computed(() => props.members.length > 0 && props.members.every(m => selectedMemberIds.value.has(m.id)))
const canSend         = computed(() => template.value.trim().length > 0 && selectedMembers.value.length > 0)

function toggleMember(id) {
  const s = new Set(selectedMemberIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedMemberIds.value = s
}

function toggleAll() {
  selectedMemberIds.value = allSelected.value
    ? new Set()
    : new Set(props.members.map(m => m.id))
}

// Reset everything when switching to a different group
watch(() => props.group.id, () => {
  editingName.value = false
  const ids = new Set(props.members.map(m => m.id))
  selectedMemberIds.value = new Set(ids)
  knownMemberIds.value    = new Set(ids)
})

// When members reload, only auto-check genuinely new members; preserve existing checked/unchecked state
watch(() => props.members, (members) => {
  const selected = new Set(selectedMemberIds.value)
  const known    = new Set(knownMemberIds.value)
  for (const m of members) {
    if (!known.has(m.id)) {
      selected.add(m.id) // new member — check by default
      known.add(m.id)
    }
  }
  // Remove IDs that no longer exist in the group
  for (const id of selected) {
    if (!members.find(m => m.id === id)) selected.delete(id)
  }
  for (const id of known) {
    if (!members.find(m => m.id === id)) known.delete(id)
  }
  selectedMemberIds.value = selected
  knownMemberIds.value    = known
}, { immediate: true })


// ── Name editing ───────────────────────────────────────────────────────────
function startEdit() {
  draftName.value = props.group.name
  editingName.value = true
  nextTick(() => nameInput.value?.select())
}
function saveName() {
  const t = draftName.value.trim()
  if (t && t !== props.group.name) emit('update-name', t)
  editingName.value = false
}
function cancelEdit() { editingName.value = false }

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

// ── Variable insertion ─────────────────────────────────────────────────────
function insertVariable(key) {
  tokenEditorEl.value?.insertChip(key)
}

// ── Service toggle ─────────────────────────────────────────────────────────
async function toggleService(member) {
  // unconfirmed → iMessage; iMessage ↔ SMS
  const next = member.service_confirmed ? (member.service === 'SMS' ? 'iMessage' : 'SMS') : 'iMessage'
  await window.api.setContactService(member.id, next)
  emit('set-service')
}

// ── iMessage capability check ──────────────────────────────────────────────
const checkingCapability = ref(false)
const checkedCount       = ref(0)

async function checkCapability() {
  if (checkingCapability.value || !props.members.length) return
  checkingCapability.value = true
  checkedCount.value = 0
  try {
    const timer = setInterval(() => {
      if (checkedCount.value < props.members.length) checkedCount.value++
    }, 800)
    const results = await window.api.checkCapability(
      props.members.map(m => ({ id: m.id, phone: m.phone, email: m.email || null }))
    )
    clearInterval(timer)
    emit('set-service')

    const checked  = results.filter(r => r.checked)
    const unknown  = results.filter(r => !r.checked)
    const imsg     = checked.filter(r => r.service === 'iMessage').length
    const sms      = checked.filter(r => r.service === 'SMS').length
    const parts    = []
    if (imsg)    parts.push(`${imsg} iMessage`)
    if (sms)     parts.push(`${sms} SMS`)
    if (unknown.length) parts.push(`${unknown.length} unknown (no prior history)`)
    showToast('Capability check complete', parts.join(', '), 'info')
  } catch (err) {
    console.error('[Check] error:', err)
    showToast('Check failed', err.message, 'error')
  } finally {
    checkingCapability.value = false
    checkedCount.value = 0
  }
}

// ── Member actions ─────────────────────────────────────────────────────────
function onAdd(contactId) {
  emit('add-member', contactId)
  showAddModal.value = false
}

// ── Delete ─────────────────────────────────────────────────────────────────
function confirmDelete() {
  showDeleteDialog.value = false
  emit('delete-group')
}

// ── Toast helpers ──────────────────────────────────────────────────────────
const toasts   = ref([])
let   toastSeq = 0
function showToast(title, message = '', type = 'info', duration = 4000) {
  const id = ++toastSeq
  toasts.value.push({ id, title, message, type, duration })
}
function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}


// ── Unknown warning ────────────────────────────────────────────────────────
const unknownWarning = ref(null)

function checkUnknownThenProceed(proceedFn) {
  const unknowns = selectedMembers.value.filter(m => !m.service_confirmed)
  if (!unknowns.length) { proceedFn(); return }
  unknownWarning.value = { names: unknowns.map(m => m.name), proceed: () => { unknownWarning.value = null; proceedFn() } }
}

// ── Send Now ───────────────────────────────────────────────────────────────
async function sendNow() {
  if (!canSend.value || isSending.value) return

  isSending.value = true
  sendProgress.value = null

  // Listen for per-message progress events from the main process
  window.api.onSendProgress((progress) => {
    sendProgress.value = progress
  })

  try {
    const result = await window.api.sendToGroup(props.group.id, template.value, [...selectedMemberIds.value])

    // Reload member badges if any contacts were auto-switched to SMS
    if (result.autoRouted?.length) {
      emit('set-service')
    }

    // Send summary
    if (result.failed === 0) {
      template.value = ''
      showToast(
        `Sent to ${result.succeeded} ${result.succeeded === 1 ? 'person' : 'people'}`,
        '', 'success'
      )
    } else if (result.succeeded === 0) {
      showToast('Send failed', 'Could not reach any recipients. Check that Messages has permission.', 'error')
    } else {
      showToast(`Sent ${result.succeeded}, failed ${result.failed}`, result.errors.join('\n'), 'error')
    }

    // Auto-routing notification — shown as a second toast stacked above the summary
    if (result.autoRouted?.length) {
      const noun = result.autoRouted.length === 1 ? 'contact' : 'contacts'
      showToast(
        `${result.autoRouted.length} ${noun} switched to SMS`,
        `${result.autoRouted.join(', ')} — iMessage failed. Future sends will use SMS automatically.`,
        'info', 7000
      )
    }
  } catch (err) {
    showToast('Error', err.message, 'error')
  } finally {
    window.api.offSendProgress()
    sendProgress.value = null
    isSending.value = false
  }
}

async function handleSchedule(info) {
  if (!canSend.value) return

  const scheduleData = info.type === 'once'
    ? { dateTime: info.dateTime }
    : { interval: info.interval, time: info.time, weekday: info.weekday, monthDay: info.monthDay }

  isSending.value = true
  try {
    const result = await window.api.createScheduledSend(
      props.group.id,
      template.value,
      info.type,
      scheduleData,
      [...selectedMemberIds.value],
    )
    showScheduleModal.value = false
    template.value = ''
    showToast(
      'Scheduled',
      `Message scheduled for ${new Date(result.nextRun).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
      'success',
    )
  } catch (err) {
    console.error('[Schedule] Error:', err)
    showToast('Schedule Failed', err.message, 'error')
  } finally {
    isSending.value = false
  }
}
</script>

<style scoped>
.group-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.detail-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.title-area { flex: 1; min-width: 0; }

.group-title {
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 6px;
  padding: 2px 4px;
  margin: -2px -4px;
  transition: background 0.12s;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group-title:hover { background: var(--bg); }
.edit-hint { font-size: 13px; color: var(--text-2); opacity: 0; transition: opacity 0.12s; }
.group-title:hover .edit-hint { opacity: 1; }

.name-editor {
  font-size: 22px;
  font-weight: 700;
  border: 2px solid var(--accent);
  border-radius: 6px;
  padding: 2px 6px;
  width: 100%;
  max-width: 440px;
}

.member-badge { font-size: 12px; color: var(--text-2); margin-top: 4px; }

/* ── Scrollable body ─────────────────────────────────────────────────────── */
.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-body > * {
  flex-shrink: 0;
}

/* ── Card ────────────────────────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: visible;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  border-radius: var(--radius) var(--radius) 0 0;
}
.card-header h2 { font-size: 13px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; }

/* ── Members ─────────────────────────────────────────────────────────────── */
.members-list {
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow-y: auto;
}

.member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}
.member-row:last-child { border-bottom: none; }
.member-row:hover { background: var(--bg); }

.member-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-tint);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-info { flex: 1; min-width: 0; }
.member-name { font-size: 13px; font-weight: 500; }
.member-sub  { font-size: 11px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }


.btn-service {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 20px;
  border: 1.5px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.12s;
}
.btn-service:hover { opacity: 0.75; }
.btn-service.imessage { background: var(--accent-tint); color: var(--accent-tint-text); border-color: var(--accent-tint-border); }
.btn-service.sms      { background: var(--success-tint); color: var(--success-tint-text); border-color: var(--success-tint-border, #a5d6a7); }
.btn-service.unknown  { background: var(--bg); color: var(--text-2); border-color: var(--border); }

.card-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.select-all-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}

.select-all-label input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.select-all-label input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.select-all-label input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  left: 3.5px;
  top: 1.5px;
  width: 4px;
  height: 7px;
  border: 1.5px solid #fff;
  border-top: none;
  border-left: none;
  transform: rotate(45deg);
}

.member-checkbox {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.member-checkbox.checked {
  background: var(--accent);
  border-color: var(--accent);
}
.member-checkbox.checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 2px;
  width: 4px;
  height: 7px;
  border: 1.5px solid #fff;
  border-top: none;
  border-left: none;
  transform: rotate(45deg);
}

.member-deselected {
  opacity: 0.45;
}

.btn-remove {
  width: 24px; height: 24px;
  border-radius: 50%; border: none; background: transparent;
  color: var(--text-2); font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; padding: 0;
}
.btn-remove:hover { background: var(--error-tint); color: var(--danger); }

.empty-card {
  padding: 28px;
  text-align: center;
  font-size: 13px;
  color: var(--text-2);
}

/* ── Template ────────────────────────────────────────────────────────────── */
.var-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.var-label { font-size: 11px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 2px; }

.var-btn {
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid var(--accent-tint-border);
  background: var(--accent-tint);
  font-family: var(--font);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-tint-text);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  line-height: 1.6;
}
.var-btn:hover { background: #cce2ff; border-color: var(--accent-tint-text); }

.preview-placeholder {
  padding: 20px 16px;
  font-size: 13px;
  color: var(--text-2);
  text-align: center;
  font-style: italic;
}

/* ── Toast stack ─────────────────────────────────────────────────────────── */

/* ── Send bar ────────────────────────────────────────────────────────────── */
.send-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.send-info {
  font-size: 13px;
  color: var(--text-2);
}
.send-info strong { color: var(--text); font-weight: 600; }

.send-actions { display: flex; gap: 8px; }
.send-actions button { padding: 7px 18px; }

.toast-stack {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
  pointer-events: none;
}
.toast-stack > * { pointer-events: all; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}

.unknown-warning-box {
  background: var(--surface);
  border-radius: 12px;
  padding: 24px;
  width: min(420px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.unknown-warning-box h3 { font-size: 16px; font-weight: 700; margin: 0; }
.unknown-warning-box p  { font-size: 13px; line-height: 1.55; margin: 0; color: var(--text); }

.unknown-warning-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.unknown-warning-actions button { padding: 8px 18px; }
</style>
