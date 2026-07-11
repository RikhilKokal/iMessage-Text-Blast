<template>
  <DashboardPanel title="Scheduled Texts" @close="$emit('close')">
    <template #notices>
      <!-- Sent notifications -->
      <div v-if="sentNotices.length > 0" class="notices">
        <div v-for="n in sentNotices" :key="n.id" class="notice">
          ✓ Sent to <strong>{{ n.group_name || 'group' }}</strong> — {{ fmtDate(n.firedAt) }}
        </div>
      </div>

      <!-- Cancelled notifications -->
      <div v-if="cancelledNotices.length > 0" class="notices notices-cancel">
        <div v-for="n in cancelledNotices" :key="n.id" class="notice notice-cancel">
          Canceled send to <strong>{{ n.group_name || 'group' }}</strong>
        </div>
      </div>
    </template>

    <template #default>
      <div v-if="scheduledSends.length > 0" class="sends-list">
          <div
            v-for="send in scheduledSends"
            :key="send.id"
            class="send-card"
          >
            <div class="card-top">
              <span class="group-name">{{ send.group_name || '(deleted group)' }}</span>
              <span class="badge badge-blue">
                {{ send.schedule_type === 'once' ? '🕐 Once' : '🔄 ' + parsedInterval(send.schedule_interval) }}
              </span>
            </div>
            <div class="preview">{{ truncate(send.template_text) }}</div>
            <div class="meta">Next: {{ fmtDate(send.next_run) }}</div>
            <div
              v-if="send.group_id"
              class="recipients-line"
              @click="openRecipientsPreview(send)"
            >{{ recipientLabel(send) }}</div>
            <div class="card-actions">
              <button class="btn-edit" @click="startEdit(send)">Edit</button>
              <button class="btn-cancel" @click="cancelScheduledSend(send)">Cancel</button>
            </div>
          </div>
        </div>
        <div v-else class="empty">No scheduled texts.</div>
    </template>

    <template #popups>
    <!-- Edit modal -->
    <div v-if="editing" class="confirm-overlay">
      <div class="edit-box">
        <h3>Edit Scheduled Text</h3>

        <!-- Message section -->
        <div class="collapsible" :class="{ open: expandMessage }">
          <button type="button" class="collapsible-header" @click="expandMessage = !expandMessage; if (expandMessage) { expandSchedule = false; expandRecipients = false }">
            <span>Message</span>
            <span class="chevron">{{ expandMessage ? '▲' : '▼' }}</span>
          </button>
          <div class="collapsible-body">
            <div class="edit-token-wrap">
              <TokenEditor ref="editTokenEditorEl" v-model="editTemplate" :tokens="TOKEN_LABELS" placeholder="Message template…" />
            </div>
            <div class="var-picker">
              <span class="var-label">Insert:</span>
              <button
                v-for="v in VARIABLES"
                :key="v.key"
                class="var-btn"
                :title="'Insert ' + v.label"
                @click="insertEditVariable(v.key)"
                v-text="v.label"
              ></button>
            </div>
            <div class="attachment-row">
              <button v-if="editAttachmentPaths.length < MAX_ATTACHMENTS" class="btn-attach" @click="pickEditAttachment" title="Attach files (max 8)">📎 Attach File</button>
              <div class="attachment-chips">
                <div v-for="(p, i) in editAttachmentPaths" :key="p" class="attachment-chip">
                  <span class="attachment-name">{{ p.split('/').pop() }}</span>
                  <button class="attachment-remove" @click="removeEditAttachment(i)" title="Remove">×</button>
                </div>
              </div>
            </div>
            <MessagePreview
              v-if="editTemplate.trim() && editPreviewMembers.length > 0"
              :template="editTemplate"
              :contacts="editPreviewMembers"
            />
            <div v-else class="preview-placeholder">
              {{ !editTemplate.trim() ? 'Type a message above to see a live preview.' : 'Select recipients to see a preview.' }}
            </div>
          </div>
        </div>

        <!-- Recipients section -->
        <div class="collapsible" :class="{ open: expandRecipients }">
          <button type="button" class="collapsible-header" @click="expandRecipients = !expandRecipients; if (expandRecipients) { expandMessage = false; expandSchedule = false }">
            <span>Recipients <span class="recipient-count">({{ editSelectedIds.size }} of {{ editGroupMembers.length }})</span></span>
            <span class="chevron">{{ expandRecipients ? '▲' : '▼' }}</span>
          </button>
          <div class="collapsible-body">
            <div v-if="editGroupMembers.length === 0" class="empty-recipients">No members in this group.</div>
            <div v-else>
              <label class="select-all-label">
                <input type="checkbox" :checked="editAllSelected" @change="toggleAllRecipients" />
                Select all
              </label>
              <div class="recipients-list">
                <label
                  v-for="m in editGroupMembers"
                  :key="m.id"
                  class="recipient-row"
                  :class="{ deselected: !editSelectedIds.has(m.id) }"
                >
                  <input
                    type="checkbox"
                    :checked="editSelectedIds.has(m.id)"
                    @change="toggleRecipient(m.id)"
                  />
                  <span class="r-name">{{ m.name }}</span>
                  <span class="r-phone">{{ m.phone }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Schedule section -->
        <div class="collapsible" :class="{ open: expandSchedule }">
          <button type="button" class="collapsible-header" @click="expandSchedule = !expandSchedule; if (expandSchedule) { expandMessage = false; expandRecipients = false }">
            <span>Schedule</span>
            <span class="chevron">{{ expandSchedule ? '▲' : '▼' }}</span>
          </button>
          <div class="collapsible-body">
            <div class="type-toggle">
              <label class="type-option" :class="{ active: editType === 'once' }">
                <input v-model="editType" type="radio" value="once" />Send Once
              </label>
              <label class="type-option" :class="{ active: editType === 'recurring' }">
                <input v-model="editType" type="radio" value="recurring" />Recurring
              </label>
            </div>

            <div v-if="editType === 'once'" style="margin-top: 12px;">
              <DateTimePicker v-model="editDateTime" @update:timeValid="v => editTimeValid = v" />
              <p v-if="editIsPast" class="error-msg" style="margin-top: 6px;">Please choose a time in the future.</p>
            </div>

            <div v-if="editType === 'recurring'" class="field-row" style="margin-top: 12px;">
              <div class="field">
                <label class="field-label">Repeat</label>
                <select v-model="editInterval" class="field-input">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div v-if="editInterval === 'weekly'" class="field">
                <label class="field-label">Day</label>
                <select v-model="editWeekday" class="field-input">
                  <option :value="0">Sunday</option>
                  <option :value="1">Monday</option>
                  <option :value="2">Tuesday</option>
                  <option :value="3">Wednesday</option>
                  <option :value="4">Thursday</option>
                  <option :value="5">Friday</option>
                  <option :value="6">Saturday</option>
                </select>
              </div>
              <div v-if="editInterval === 'monthly'" class="field">
                <label class="field-label">Date</label>
                <select v-model="editMonthDay" class="field-input">
                  <option v-for="d in 31" :key="d" :value="d">{{ ordinal(d) }}</option>
                </select>
              </div>
              <div class="field">
                <label class="field-label">Time of Day</label>
                <input v-model="editTime" type="time" class="field-input" />
              </div>
            </div>
          </div>
        </div>

        <div class="confirm-actions">
          <button @click="editing = null">Cancel</button>
          <button class="btn-primary" :disabled="!editIsValid" @click="saveEdit">Save</button>
        </div>
      </div>
    </div>

    <!-- Recipients preview popup -->
    <div v-if="recipientsPopup" class="confirm-overlay" @click.self="recipientsPopup = null">
      <div class="confirm-box recipients-box">
        <p class="recipients-title">Sending to</p>
        <div class="recipients-list">
          <div v-for="m in recipientsPopup" :key="m.id" class="rp-row">
            <span class="rp-name">{{ m.name }}</span>
            <span class="rp-phone">{{ m.phone }}</span>
          </div>
        </div>
        <div class="confirm-actions">
          <button @click="recipientsPopup = null">Close</button>
        </div>
      </div>
    </div>

    <!-- Cancel confirm -->
    <div v-if="confirmCancel" class="confirm-overlay">
      <div class="confirm-box">
        <p>Cancel scheduled send to <strong>{{ confirmCancel.group_name }}</strong>?</p>
        <div class="confirm-actions">
          <button @click="confirmCancel = null">Keep</button>
          <button class="btn-danger" @click="doCancel">Yes, Cancel</button>
        </div>
      </div>
    </div>
    </template>
  </DashboardPanel>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import DashboardPanel from './DashboardPanel.vue'
import DateTimePicker from './DateTimePicker.vue'
import TokenEditor    from './TokenEditor.vue'
import MessagePreview from './MessagePreview.vue'
import { VARIABLES, TOKEN_LABELS } from '../constants/variables'

const props = defineProps({ refreshKey: { type: Number, default: 0 } })
defineEmits(['close'])

watch(() => props.refreshKey, () => load())

const scheduledSends   = ref([])
const confirmCancel    = ref(null)
const recipientsPopup  = ref(null)

// Cache of groupId → current member array (for counts)
const memberCache = reactive({})
// Cache of contactId → contact object (for resolving member_ids that may include ex-members)
const contactCache = reactive({})

async function getGroupMembers(groupId) {
  if (!memberCache[groupId]) {
    const members = await window.api.getGroupMembers(groupId)
    memberCache[groupId] = members
    for (const m of members) contactCache[m.id] = m
  }
  return memberCache[groupId]
}

async function ensureContactsInCache(ids) {
  const missing = ids.filter(id => !contactCache[id])
  if (!missing.length) return
  const contacts = await window.api.getContactsByIds(missing)
  for (const c of contacts) contactCache[c.id] = c
}

function resolveRecipients(send) {
  const allMembers = memberCache[send.group_id]
  if (!allMembers) return null
  if (!send.member_ids) return allMembers
  const ids = JSON.parse(send.member_ids).map(String)
  return ids.map(id => contactCache[id]).filter(Boolean)
}

function recipientLabel(send) {
  const allMembers = memberCache[send.group_id]
  if (!allMembers) return 'Loading…'
  const recipients = resolveRecipients(send)
  if (!recipients) return 'Loading…'
  const groupMemberIds = new Set(allMembers.map(m => m.id))
  const inGroup  = recipients.filter(m => groupMemberIds.has(m.id)).length
  const exMember = recipients.filter(m => !groupMemberIds.has(m.id)).length
  const total    = allMembers.length
  if (exMember > 0) {
    return `sending to ${recipients.length} members (${inGroup} in group, ${exMember} not in group)`
  }
  if (!send.member_ids || inGroup === total) {
    return `sending to all ${total} ${total === 1 ? 'member' : 'members'}`
  }
  return `sending to ${inGroup} of ${total} members`
}

async function openRecipientsPreview(send) {
  await getGroupMembers(send.group_id)
  if (send.member_ids) {
    await ensureContactsInCache(JSON.parse(send.member_ids).map(String))
  }
  recipientsPopup.value = resolveRecipients(send)
}
const sentNotices    = ref([])   // sends that fired while panel was open
const cancelledIds     = new Set() // ids cancelled this session — suppress "Sent" notice
const cancelledNotices = ref([])
let pollTimer        = null
let knownIds         = new Set()


async function load(isInitial = false) {
  try {
    const fresh = await window.api.getScheduledSends()

    if (!isInitial) {
      // Detect sends that were in the list before but are now gone (fired)
      const freshIds = new Set(fresh.map(s => s.id))
      for (const id of knownIds) {
        if (!freshIds.has(id)) {
          const gone = scheduledSends.value.find(s => s.id === id)
          if (gone && !cancelledIds.has(id)) {
            sentNotices.value.push({ ...gone, firedAt: new Date() })
            // Auto-dismiss notice after 30s
            setTimeout(() => {
              sentNotices.value = sentNotices.value.filter(n => n.id !== id)
            }, 30000)
          }
        }
      }
    }

    scheduledSends.value = fresh
    knownIds = new Set(fresh.map(s => s.id))
    // Pre-load group members for counts, then fetch any extra contacts in member_ids
    const uniqueGroupIds = [...new Set(fresh.map(s => s.group_id).filter(Boolean))]
    await Promise.all(uniqueGroupIds.map(id => getGroupMembers(id)))
    // Fetch contacts referenced in member_ids that may no longer be in the group
    const extraIds = fresh
      .filter(s => s.member_ids)
      .flatMap(s => JSON.parse(s.member_ids).map(String))
    await ensureContactsInCache(extraIds)
  } catch (err) {
    console.error('[ScheduledSends] Load error:', err)
  }
}

onMounted(() => {
  load(true)
  // Poll every 30 seconds
  pollTimer = setInterval(() => load(false), 30000)
})

onUnmounted(() => {
  clearInterval(pollTimer)
})

// ── Edit ──────────────────────────────────────────────────────────────────────
const editing              = ref(null)
const editTokenEditorEl    = ref(null)
const editTemplate         = ref('')
const MAX_ATTACHMENTS      = 8
const editAttachmentPaths  = ref([])

async function pickEditAttachment() {
  const remaining = MAX_ATTACHMENTS - editAttachmentPaths.value.length
  if (remaining <= 0) return
  const filePaths = await window.api.openAttachmentDialog(MAX_ATTACHMENTS)
  if (!filePaths?.length) return
  const combined = [...editAttachmentPaths.value, ...filePaths]
  if (combined.length > MAX_ATTACHMENTS) {
    alert(`Max ${MAX_ATTACHMENTS} files — only the first ${MAX_ATTACHMENTS} selected files were added.`)
  }
  editAttachmentPaths.value = combined.slice(0, MAX_ATTACHMENTS)
}

function removeEditAttachment(index) {
  editAttachmentPaths.value = editAttachmentPaths.value.filter((_, i) => i !== index)
}
const editType         = ref('once')
const editDateTime     = ref('')
const editInterval     = ref('daily')
const editTime         = ref('09:00')
const editWeekday      = ref(new Date().getDay())
const editMonthDay     = ref(new Date().getDate())
const editGroupMembers = ref([])
const editSelectedIds  = ref(new Set())

function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
const expandMessage    = ref(false)
const expandSchedule   = ref(false)
const expandRecipients = ref(false)

const editPreviewMembers = computed(() =>
  editGroupMembers.value.filter(m => editSelectedIds.value.has(m.id))
)

function insertEditVariable(key) {
  editTokenEditorEl.value?.insertChip(key)
}

const editAllSelected = computed(() =>
  editGroupMembers.value.length > 0 &&
  editGroupMembers.value.every(m => editSelectedIds.value.has(m.id))
)

function toggleRecipient(id) {
  const s = new Set(editSelectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  editSelectedIds.value = s
}

function toggleAllRecipients() {
  if (editAllSelected.value) {
    editSelectedIds.value = new Set()
  } else {
    editSelectedIds.value = new Set(editGroupMembers.value.map(m => m.id))
  }
}

const editTimeValid = ref(true)
const editIsPast = computed(() =>
  editType.value === 'once' && !!editDateTime.value && new Date(editDateTime.value) <= new Date()
)
const editIsValid = computed(() => {
  if (!editTemplate.value.trim() && editAttachmentPaths.value.length === 0) return false
  if (editSelectedIds.value.size === 0) return false
  if (editType.value === 'once') return !!editDateTime.value && !editIsPast.value && editTimeValid.value
  return true
})

async function startEdit(send) {
  editing.value            = send
  expandMessage.value      = false
  expandSchedule.value     = false
  expandRecipients.value   = false
  editTemplate.value       = send.template_text || ''
  try {
    editAttachmentPaths.value = send.attachment_path ? JSON.parse(send.attachment_path) : []
  } catch { editAttachmentPaths.value = send.attachment_path ? [send.attachment_path] : [] }
  editType.value           = send.schedule_type || 'once'
  editGroupMembers.value = []
  editSelectedIds.value  = new Set()

  // Pre-fill datetime from next_run for once, or interval+time for recurring
  if (send.schedule_type === 'once') {
    const d = new Date(send.next_run)
    const pad = n => String(n).padStart(2, '0')
    editDateTime.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } else {
    try {
      const data = JSON.parse(send.schedule_interval)
      editInterval.value  = data.interval  || 'daily'
      editTime.value      = data.time      || '09:00'
      editWeekday.value   = data.weekday   ?? new Date().getDay()
      editMonthDay.value  = data.monthDay  ?? new Date().getDate()
    } catch {
      editInterval.value = 'daily'
      editTime.value     = '09:00'
      editWeekday.value  = new Date().getDay()
      editMonthDay.value = new Date().getDate()
    }
  }

  // Load group members and restore the stored selection
  if (send.group_id) {
    try {
      const members = await window.api.getGroupMembers(send.group_id)
      editGroupMembers.value = members
      const storedIds = send.member_ids ? JSON.parse(send.member_ids) : null
      if (storedIds) {
        // JSON round-trips id types faithfully (numbers stay numbers, "gc:N" stays
        // string), and m.id below needs to match natively for Set.has() to work.
        editSelectedIds.value = new Set(storedIds)
      } else {
        // No stored selection means all members were targeted
        editSelectedIds.value = new Set(members.map(m => m.id))
      }
    } catch (err) {
      console.error('[ScheduledSends] Failed to load group members:', err)
    }
  }
}

async function saveEdit() {
  if (!editIsValid.value || !editing.value) return
  const send = editing.value
  editing.value = null

  const scheduleData = editType.value === 'once'
    ? { dateTime: editDateTime.value }
    : { interval: editInterval.value, time: editTime.value, weekday: editWeekday.value, monthDay: editMonthDay.value }

  try {
    const allSelected = editSelectedIds.value.size === editGroupMembers.value.length
    const memberIds = allSelected ? null : [...editSelectedIds.value]
    await window.api.updateScheduledSend(
      send.id,
      send.launchd_plist_id,
      editTemplate.value.trim(),
      editType.value,
      scheduleData,
      memberIds,
      [...editAttachmentPaths.value],
    )
    await load(false)
  } catch (err) {
    console.error('[ScheduledSends] Edit error:', err)
    alert(`Failed to save: ${err.message}`)
  }
}

function cancelScheduledSend(send) {
  confirmCancel.value = send
}

async function doCancel() {
  const send = confirmCancel.value
  confirmCancel.value = null
  if (!send) return
  try {
    cancelledIds.add(send.id)
    await window.api.cancelScheduledSend(send.id, send.launchd_plist_id)
    await load(false)
    cancelledNotices.value.push({ ...send })
    setTimeout(() => {
      cancelledNotices.value = cancelledNotices.value.filter(n => n.id !== send.id)
    }, 30000)
  } catch (err) {
    console.error('[ScheduledSends] Cancel error:', err)
    alert(`Failed to cancel: ${err.message}`)
  }
}

function truncate(text, len = 100) {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

function fmtDate(ts) {
  if (!ts) return '—'
  try {
    const normalized = typeof ts === 'string' && !ts.endsWith('Z') ? ts + 'Z' : ts
    return new Date(normalized).toLocaleString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return ts }
}

function parsedInterval(raw) {
  try {
    const d = JSON.parse(raw)
    return d.interval
      ? d.interval.charAt(0).toUpperCase() + d.interval.slice(1)
      : 'Recurring'
  } catch { return 'Recurring' }
}
</script>

<style scoped>
/* Sent notices */
.notices {
  padding: 10px 24px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.notice {
  background: var(--success-tint);
  color: var(--success-tint-text);
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 13px;
  animation: slide-in 0.25s ease;
}
.notice-cancel {
  background: var(--error-tint);
  color: var(--error-tint-text);
}

@keyframes slide-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.sends-list { display: flex; flex-direction: column; gap: 8px; }

.send-card {
  border: 1px solid var(--accent-tint-border);
  border-radius: var(--radius);
  padding: 12px 14px;
  background: var(--accent-tint);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.group-name { font-size: 13px; font-weight: 600; }

.badge {
  font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 99px;
  white-space: nowrap; flex-shrink: 0;
}
.badge-blue { background: var(--accent-tint); color: var(--accent-tint-text); }

.preview { font-size: 12px; color: var(--text-2); font-style: italic; line-height: 1.4; }
.meta    { font-size: 11px; color: var(--text-2); }

.card-actions { display: flex; gap: 6px; margin-top: 4px; }

.btn-edit {
  padding: 3px 10px;
  font-size: 11px;
  background: var(--surface);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 4px;
  cursor: pointer;
}
.btn-edit:hover { background: var(--accent); color: #fff; }

.btn-cancel {
  padding: 3px 10px;
  font-size: 11px;
  background: var(--error);
  color: #fff;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}
.btn-cancel:hover {
  background: transparent;
  color: var(--error);
  border-color: var(--error);
}

/* Edit modal */
.edit-box {
  background: var(--surface);
  border-radius: 12px;
  padding: 24px;
  width: min(480px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.edit-box h3 { font-size: 16px; font-weight: 700; }

.edit-token-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.edit-token-wrap:focus-within { border-color: var(--accent); }
.edit-token-wrap :deep(.token-editor) {
  border: none;
  min-height: 80px;
  font-size: 13px;
  padding: 8px 10px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #6e6e73);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: -6px;
}

.type-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.type-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #6e6e73);
  user-select: none;
}
.type-option input[type="radio"] { display: none; }
.type-option.active { background: var(--accent); color: #fff; }
.type-option:not(.active):hover { background: var(--bg); }

.field-row { display: flex; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.field-input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font);
  font-size: 13px;
  outline: none;
  background: var(--surface);
  color: var(--text);
}
.field-input:focus { border-color: var(--accent); }

.error-msg { font-size: 12px; color: var(--error); }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }

.empty {
  padding: 48px;
  text-align: center;
  font-size: 13px;
  color: var(--text-2);
  font-style: italic;
}

/* Confirm dialog */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1010;
}
.confirm-box {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 24px;
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.confirm-box p { font-size: 14px; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.confirm-actions button { padding: 7px 16px; }
.btn-danger { background: var(--error); color: #fff; border-color: var(--error); }
.btn-danger:hover { opacity: 0.85; }

.empty {
  padding: 48px;
  text-align: center;
  font-size: 13px;
  color: var(--text-2);
  font-style: italic;
}

/* Collapsible sections in edit modal */
.collapsible {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: visible;
}

.collapsible-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg);
  border: none;
  cursor: pointer;
  font-family: var(--font);
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  text-align: left;
  border-radius: var(--radius);
}
.collapsible.open .collapsible-header {
  border-radius: var(--radius) var(--radius) 0 0;
}
.collapsible-header:hover { background: var(--border); }

.chevron {
  font-size: 10px;
  color: var(--text-secondary, #6e6e73);
}

.collapsible-body {
  display: none;
  padding: 14px;
  background: var(--surface);
}
.collapsible.open .collapsible-body {
  display: block;
}

.recipient-count { font-weight: 400; color: var(--text-2); font-size: 12px; }

.select-all-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
}
.select-all-label input[type="checkbox"],
.recipient-row input[type="checkbox"] {
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
.select-all-label input[type="checkbox"]:checked,
.recipient-row input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.select-all-label input[type="checkbox"]:checked::after,
.recipient-row input[type="checkbox"]:checked::after {
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

.recipients-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}

.recipient-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.recipient-row:hover { background: var(--bg); }
.recipient-row.deselected { opacity: 0.45; }
.r-name { flex: 1; font-weight: 500; }
.r-phone { font-size: 11px; color: var(--text-2); }

.empty-recipients { font-size: 12px; color: var(--text-2); font-style: italic; }

.recipients-line {
  font-size: 11px;
  color: var(--text-2);
  font-style: italic;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.15s, color 0.15s;
}
.recipients-line:hover {
  color: var(--accent);
  text-decoration-color: var(--accent);
}

.recipients-box {
  width: min(360px, calc(100vw - 48px));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.recipients-title { font-size: 14px; font-weight: 700; margin: 0; }
.recipients-list { overflow-y: auto; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.rp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 4px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}
.rp-row:last-child { border-bottom: none; }
.rp-name { font-weight: 500; }
.rp-phone { font-size: 11px; color: var(--text-2); }


.var-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0 4px;
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
.var-btn:hover { background: var(--accent-tint-border); border-color: var(--accent-tint-text); }

.preview-placeholder {
  padding: 16px 0 4px;
  font-size: 13px;
  color: var(--text-2);
  text-align: center;
  font-style: italic;
}

.attachment-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.attachment-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.btn-attach {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-muted);
  transition: border-color 0.15s, color 0.15s;
}
.btn-attach:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.attachment-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-soft, rgba(99,102,241,0.12));
  border: 1px solid var(--accent);
  border-radius: 20px;
  padding: 3px 10px 3px 12px;
  font-size: 12px;
  color: var(--accent);
  max-width: 240px;
}

.attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--accent);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.attachment-remove:hover { opacity: 1; }
</style>
