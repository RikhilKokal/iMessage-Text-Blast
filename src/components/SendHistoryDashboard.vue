<template>
  <DashboardPanel title="Send History" width="720px" @close="$emit('close')">
    <template #header-actions>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Filter by group…"
        class="search-input"
      />
      <button class="btn-trash" @click="confirmClear = true" title="Clear history"><span class="trash-icon">🗑</span></button>
    </template>

    <template #default>
      <div v-if="filteredHistory.length > 0" class="sends-list">
          <div
            v-for="send in filteredHistory"
            :key="send.id"
            class="send-card"
            :class="send.status"
          >
            <div class="card-top">
              <span class="group-name">{{ send.group_name || send.template_name || '(deleted group)' }}</span>
              <span
                class="badge"
                :class="{
                  'badge-green':  send.status === 'sent',
                  'badge-red':    send.status === 'failed',
                  'badge-orange': send.status === 'partial',
                  'badge-gray':   send.status === 'pending',
                }"
              >{{ statusLabel(send.status) }}</span>
            </div>
            <div class="preview">{{ truncate(send.template_text) }}</div>
            <div class="meta">{{ fmtDate(send.created_at) }}</div>
            <div
              v-if="send.sent_to_count > 0 || send.group_member_count > 0"
              class="recipients-line"
              @click="openRecipients(send)"
            >
              {{ recipientLabel(send) }}
            </div>
            <div
              v-if="parseAttachments(send.attachment_path).length > 0"
              class="attachments-line"
              :class="{ clickable: attachmentLineTruncated(send.attachment_path) }"
              @click="attachmentLineTruncated(send.attachment_path) && openAttachments(send.attachment_path)"
            >
              📎 {{ attachmentLineText(send.attachment_path) }}
            </div>
            <div v-if="send.error_log" class="error-log">{{ send.error_log }}</div>
          </div>
        </div>
        <div v-else class="empty">No send history yet.</div>
    </template>

    <template #popups>
    <!-- Recipients popup -->
    <div v-if="recipientsPopup" class="confirm-overlay" @click.self="recipientsPopup = null">
      <div class="confirm-box recipients-box">
        <p class="recipients-title">Recipients</p>

        <div class="recipients-section">
          <div class="recipients-section-label sent-label">✓ Sent to</div>
          <div class="recipients-list">
            <div v-for="r in recipientsPopup.sent" :key="r.phone" class="recipient-row">
              <span class="recipient-name">{{ r.name }}</span>
              <span class="recipient-phone">{{ r.phone }}</span>
            </div>
            <div v-if="recipientsPopup.sent.length === 0" class="recipient-empty">None</div>
          </div>
        </div>

        <div v-if="recipientsPopup.notSent.length > 0" class="recipients-section">
          <div class="recipients-section-label not-sent-label">✕ Not sent to</div>
          <div class="recipients-list">
            <div v-for="r in recipientsPopup.notSent" :key="r.phone" class="recipient-row">
              <span class="recipient-name">{{ r.name }}</span>
              <span class="recipient-phone">{{ r.phone }}</span>
            </div>
          </div>
        </div>

        <div class="confirm-actions">
          <button @click="recipientsPopup = null">Close</button>
        </div>
      </div>
    </div>

    <!-- Attachments popup -->
    <div v-if="attachmentsPopup" class="confirm-overlay" @click.self="attachmentsPopup = null">
      <div class="confirm-box recipients-box">
        <p class="recipients-title">Attachments</p>
        <div class="recipients-section">
          <div class="recipients-list">
            <div v-for="name in attachmentsPopup" :key="name" class="recipient-row">
              <span class="recipient-name">📎 {{ name }}</span>
            </div>
          </div>
        </div>
        <div class="confirm-actions">
          <button @click="attachmentsPopup = null">Close</button>
        </div>
      </div>
    </div>

    <!-- Clear history confirm -->
    <div v-if="confirmClear" class="confirm-overlay">
      <div class="confirm-box">
        <p>Are you sure you want to clear all send history? This cannot be undone.</p>
        <div class="confirm-actions">
          <button @click="confirmClear = false">Cancel</button>
          <button class="btn-danger" @click="doClear">Clear All</button>
        </div>
      </div>
    </div>
    </template>
  </DashboardPanel>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import DashboardPanel from './DashboardPanel.vue'

defineEmits(['close'])

const searchQuery = ref('')
const sendHistory = ref([])
const confirmClear = ref(false)
const recipientsPopup  = ref(null)
const attachmentsPopup = ref(null)

const ATTACHMENT_LINE_MAX = 60

function attachmentLineText(raw) {
  const names = parseAttachments(raw).map(p => p.split('/').pop())
  const full = names.join(', ')
  return full.length <= ATTACHMENT_LINE_MAX ? full : full.slice(0, ATTACHMENT_LINE_MAX).replace(/,?\s*\S*$/, '') + '…'
}

function attachmentLineTruncated(raw) {
  const names = parseAttachments(raw).map(p => p.split('/').pop())
  return names.join(', ').length > ATTACHMENT_LINE_MAX
}

function openAttachments(raw) {
  attachmentsPopup.value = parseAttachments(raw).map(p => p.split('/').pop())
}

async function load() {
  try {
    sendHistory.value = await window.api.getSendHistory()
  } catch (err) {
    console.error('[SendHistory] Load error:', err)
  }
}

function recipientLabel(send) {
  const sent = send.sent_to_count
  const total = send.group_member_count
  if (!sent) return null
  if (sent === total) return `sent to all ${sent} ${sent === 1 ? 'member' : 'members'}`
  return `sent to ${sent} of ${total} members`
}

async function openRecipients(send) {
  const list = await window.api.getSendRecipients(send.id)
  recipientsPopup.value = {
    sent:    list.filter(r => r.received),
    notSent: list.filter(r => !r.received),
  }
}

async function doClear() {
  confirmClear.value = false
  await window.api.clearSendHistory()
  await load()
}

onMounted(load)

const filteredHistory = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return sendHistory.value.filter(s =>
    (s.group_name || s.template_name || '').toLowerCase().includes(q)
  )
})

function parseAttachments(raw) {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [raw] }
}

function truncate(text, len = 100) {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

function fmtDate(ts) {
  if (!ts) return '—'
  try {
    // SQLite CURRENT_TIMESTAMP is UTC but has no "Z" suffix, so new Date()
    // would wrongly treat it as local time. Append Z to force UTC parsing.
    const normalized = typeof ts === 'string' && !ts.endsWith('Z') ? ts + 'Z' : ts
    return new Date(normalized).toLocaleString()
  } catch { return ts }
}

function statusLabel(status) {
  return { sent: '✓ Sent', failed: '✕ Failed', partial: '⚠ Partial', pending: '⏳ Pending' }[status] || status
}
</script>

<style scoped>
.search-input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  width: 200px;
}

.btn-trash {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: none;
  background: #ffcccc;
  font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  padding: 0; cursor: pointer; flex-shrink: 0;
  color: var(--danger);
}
.btn-trash:hover { background: var(--danger); }
.btn-trash:hover .trash-icon { filter: brightness(0) invert(1); }

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
.btn-danger { background: var(--danger); color: #fff; border-color: var(--danger); }
.btn-danger:hover { opacity: 0.85; }

.sends-list { display: flex; flex-direction: column; gap: 8px; }

.send-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.send-card.sent    { border-left: 3px solid #34c759; }
.send-card.failed  { border-left: 3px solid var(--error); }
.send-card.partial { border-left: 3px solid #ff9500; }

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
.badge-green  { background: var(--success-tint); color: var(--success-tint-text); }
.badge-red    { background: var(--error-tint); color: var(--error-tint-text); }
.badge-orange { background: #fff3d4; color: #7a4a00; }
.badge-gray   { background: var(--bg); color: var(--text-2); }

.preview { font-size: 12px; color: var(--text-2); font-style: italic; line-height: 1.4; }
.meta    { font-size: 11px; color: var(--text-2); }

.attachments-line {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachments-line.clickable {
  cursor: pointer;
}
.attachments-line.clickable:hover {
  color: var(--accent);
  text-decoration: underline;
}

.error-log {
  font-size: 11px;
  font-family: 'SF Mono', 'Menlo', monospace;
  color: var(--error);
  background: var(--error-tint);
  border-radius: 4px;
  padding: 6px 8px;
  white-space: pre-wrap;
  word-break: break-word;
  margin-top: 2px;
}

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
  width: 380px;
  max-height: 560px;
  gap: 12px;
}

.recipients-title {
  font-size: 15px;
  font-weight: 700;
}

.recipients-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recipients-section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sent-label    { color: var(--success-tint-text); }
.not-sent-label { color: var(--error-tint-text); }

.recipients-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
}

.recipient-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.recipient-name { font-weight: 500; }
.recipient-phone { color: var(--text-2); font-size: 12px; }
.recipient-empty { font-size: 12px; color: var(--text-2); font-style: italic; }

.empty {
  padding: 48px;
  text-align: center;
  font-size: 13px;
  color: var(--text-2);
  font-style: italic;
}
</style>
