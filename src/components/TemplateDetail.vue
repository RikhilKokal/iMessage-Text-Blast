<template>
  <div class="template-detail">
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
        <h1 v-else class="template-title" @click="startEdit" title="Click to rename">
          {{ localName || 'Untitled Template' }}
          <span class="edit-hint">✎</span>
        </h1>
      </div>
      <button class="btn-danger" @click="showDeleteDialog = true">Delete Template</button>
    </div>

    <div class="detail-body">

      <!-- ── Message Card ── -->
      <section class="card">
        <div class="card-header"><h2>Message Template</h2></div>

        <TokenEditor
          ref="tokenEditorEl"
          v-model="localBody"
          :tokens="TOKEN_LABELS"
          placeholder="Write your template message here… use the variable buttons below to personalize."
        />

        <div class="var-picker">
          <span class="var-label">Insert:</span>
          <button
            v-for="v in VARIABLES"
            :key="v.key"
            class="var-btn"
            :title="'Insert ' + v.label"
            @click="insertVariable(v.key)"
            v-text="v.label"
          ></button>
        </div>

        <!-- Preview -->
        <MessagePreview
          v-if="previewContactGroups"
          :template="localBody"
          :contacts="previewContactGroups.flatMap(g => g.contacts)"
          :contactGroups="previewContactGroups"
        />
        <MessagePreview
          v-else-if="previewContacts.length > 0"
          :template="localBody"
          :contacts="previewContacts"
        />
        <div v-else-if="localBody.trim()" class="raw-preview">
          <div class="raw-preview-label">Preview</div>
          <div class="raw-preview-bubble" v-html="rawPreviewHtml"></div>
        </div>
        <div v-else class="preview-placeholder">
          Type a message above to see a live preview.
        </div>

      </section>

      <!-- ── Attachment ── -->
      <AttachmentPicker v-model="localAttachments" />

      <!-- ── Send Card ── -->
      <section class="card">
        <div class="card-header">
          <h2>Send Template</h2>
          <div class="send-tabs">
            <button :class="{ active: sendMode === 'contacts' }" @click="sendMode = 'contacts'">To Contacts</button>
            <button :class="{ active: sendMode === 'groups' }" @click="sendMode = 'groups'">To Groups</button>
          </div>
        </div>

        <!-- Send to Contacts -->
        <div v-if="sendMode === 'contacts'" class="send-panel">
          <div class="search-row">
            <input
              v-model="contactSearch"
              type="text"
              placeholder="Search contacts by name or phone…"
              class="contact-search"
            />
          </div>

          <div v-if="filteredContacts.length > 0" class="contact-results">
            <div
              v-for="c in filteredContacts"
              :key="c.id"
              class="contact-result-row"
              :class="{ selected: selectedContactIds.has(c.id) }"
              @click="toggleContact(c.id)"
            >
              <span class="round-check contact-check" :class="{ checked: selectedContactIds.has(c.id) }"></span>
              <div class="contact-info">
                <div class="contact-name">{{ c.name }}</div>
                <div class="contact-phone">{{ c.phone }}</div>
              </div>
            </div>
          </div>
          <div v-else-if="contactSearch" class="no-results">No contacts match "{{ contactSearch }}"</div>
          <div v-else class="no-results">No contacts found. Import via CSV or sync from macOS.</div>

          <!-- Selected chips -->
          <div v-if="selectedContactIds.size > 0" class="selected-chips">
            <div v-for="c in selectedContactObjects" :key="c.id" class="chip">
              {{ c.name }}
              <button class="chip-remove" @click="toggleContact(c.id)">×</button>
            </div>
          </div>

          <div class="send-bar">
            <p class="send-info">
              <template v-if="selectedContactIds.size > 0">
                Sending to <strong>{{ selectedContactIds.size }}</strong> {{ selectedContactIds.size === 1 ? 'contact' : 'contacts' }}
              </template>
              <template v-else>Select contacts above to send to.</template>
            </p>
            <button
              class="btn-primary"
              :disabled="selectedContactIds.size === 0 || !canSendTemplate || isSending"
              @click="checkUnknownThenProceed(sendNow)"
            >
              <template v-if="!isSending">Send Now</template>
              <template v-else-if="sendProgress">Sent {{ sendProgress.sent }} / {{ sendProgress.total }}…</template>
              <template v-else>Sending…</template>
            </button>
          </div>
          <div class="buffer-wrap">
            <div class="buffer-row buffer-row--right" @click="useBuffer = !useBuffer">
              <span class="round-check" :class="{ checked: useBuffer }"></span>
              <span>Delay between messages</span>
              <BufferSecondsInput v-model="bufferSeconds" :disabled="!useBuffer" />
              <span>sec</span>
            </div>
            <div class="buffer-hint">max 60</div>
          </div>
        </div>

        <!-- Send to Groups -->
        <div v-else class="send-panel">
          <div v-if="groups.length > 0" class="group-checkboxes">
            <label
              v-for="g in groups"
              :key="g.id"
              class="group-check-row"
              @click.prevent="selectedGroupIds.includes(g.id) ? selectedGroupIds.splice(selectedGroupIds.indexOf(g.id), 1) : selectedGroupIds.push(g.id)"
            >
              <span class="round-check group-check" :class="{ checked: selectedGroupIds.includes(g.id) }"></span>
              <span class="group-check-name">{{ g.name }}</span>
              <span class="group-check-count">{{ g.memberCount }} {{ g.memberCount === 1 ? 'member' : 'members' }}</span>
            </label>
          </div>
          <div v-else class="no-results">No groups yet. Create a group first.</div>

          <div class="send-bar">
            <p class="send-info">
              <template v-if="selectedGroupIds.length > 0">
                Broadcasting to <strong>{{ selectedGroupIds.length }}</strong> {{ selectedGroupIds.length === 1 ? 'group' : 'groups' }}
              </template>
              <template v-else>Select groups above to send to.</template>
            </p>
            <button
              class="btn-primary"
              :disabled="totalGroupContacts === 0 || !canSendTemplate || isSending"
              @click="checkUnknownThenProceed(sendNow)"
            >
              <template v-if="!isSending">Send to {{ selectedGroupIds.length }} {{ selectedGroupIds.length === 1 ? 'Group' : 'Groups' }}</template>
              <template v-else-if="sendProgress">Sent {{ sendProgress.sent }} / {{ sendProgress.total }}…</template>
              <template v-else>Sending…</template>
            </button>
          </div>
          <div class="buffer-wrap">
            <div class="buffer-row buffer-row--right" @click="useBuffer = !useBuffer">
              <span class="round-check" :class="{ checked: useBuffer }"></span>
              <span>Delay between messages</span>
              <BufferSecondsInput v-model="bufferSeconds" :disabled="!useBuffer" />
              <span>sec</span>
            </div>
            <div class="buffer-hint">max 60</div>
          </div>
        </div>

      </section>
    </div>

    <!-- Unknown recipients warning -->
    <UnknownRecipientWarningDialog
      :warning="unknownWarning"
      :hasFda="props.hasFda"
      v-model:neverCheck="unknownWarningNeverCheck"
      @cancel="unknownWarning = null"
      @confirm="unknownWarning.proceed()"
    />

    <DeleteConfirmDialog
      v-if="showDeleteDialog"
      :itemName="localName"
      itemType="Template"
      @confirm="confirmDelete"
      @close="showDeleteDialog = false"
    />

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, inject, onMounted, onUnmounted } from 'vue'
import TokenEditor        from './TokenEditor.vue'
import MessagePreview     from './MessagePreview.vue'
import AttachmentPicker   from './AttachmentPicker.vue'
import BufferSecondsInput from './BufferSecondsInput.vue'
import DeleteConfirmDialog from './DeleteConfirmDialog.vue'
import UnknownRecipientWarningDialog from './UnknownRecipientWarningDialog.vue'
import { useUnknownRecipientWarning, getUnconfirmedNames } from '../composables/useUnknownRecipientWarning'
import { VARIABLES, TOKEN_LABELS } from '../constants/variables'

const props = defineProps({
  template: { type: Object, required: true },
  groups:   { type: Array, default: () => [] },
  draft:    { type: Object, default: null },
  hasFda:   { type: Boolean, default: true },
})
const emit = defineEmits(['deleted', 'updated', 'renamed', 'draft', 'saved'])

const showToast = inject('addToast')

// ── Local editable state ───────────────────────────────────────────────────
const localName        = ref('')
const localBody        = ref('')
const localAttachments = ref([])
const editingName      = ref(false)
const draftName        = ref('')
const nameInput        = ref(null)
const tokenEditorEl    = ref(null)
const saving           = ref(false)

function syncFromProp() {
  localName.value = props.template.name
  if (props.draft) {
    localBody.value        = props.draft.body
    localAttachments.value = props.draft.attachments ?? []
  } else {
    localBody.value = props.template.template_text
    try {
      localAttachments.value = props.template.attachment_path ? JSON.parse(props.template.attachment_path) : []
    } catch {
      localAttachments.value = []
    }
  }
}

watch(() => props.template.id, async (newId, oldId) => {
  if (oldId !== undefined) {
    await doSave({ showFeedback: false })
    selectedContactIds.value = new Set()
    selectedGroupIds.value = []
  }
  syncFromProp()
}, { immediate: true })

watch([localBody, localAttachments], ([body, attachments]) => {
  const savedBody = props.template.template_text
  let savedAttachments = []
  try { savedAttachments = props.template.attachment_path ? JSON.parse(props.template.attachment_path) : [] } catch {}
  const isDirty = body !== savedBody || JSON.stringify(attachments) !== JSON.stringify(savedAttachments)
  if (isDirty) emit('draft', { id: props.template.id, body, attachments: [...attachments] })
}, { deep: true })

async function doSave({ showFeedback = false } = {}) {
  if (saving.value) return
  saving.value = true
  try {
    await window.api.updateTemplate(props.template.id, localName.value.trim(), localBody.value, [...localAttachments.value])
    emit('updated')
    emit('saved', props.template.id)
  } catch (err) {
    if (showFeedback) {
      const msg = /UNIQUE constraint failed|already exists/i.test(err.message)
        ? `A template named "${localName.value.trim()}" already exists. Please choose a different name.`
        : err.message
      showToast('Save failed', msg, 'error')
    }
    throw err
  } finally {
    saving.value = false
  }
}

// ── Name editing ───────────────────────────────────────────────────────────
function startEdit() {
  draftName.value = localName.value
  editingName.value = true
  nextTick(() => nameInput.value?.select())
}

async function saveName() {
  const t = draftName.value.trim()
  editingName.value = false
  if (!t || t === localName.value) return
  const prev = localName.value
  localName.value = t
  try {
    await window.api.updateTemplate(props.template.id, t, localBody.value, [...localAttachments.value])
    emit('updated')
    emit('renamed')
  } catch (err) {
    localName.value = prev
    const msg = /UNIQUE constraint failed|already exists/i.test(err.message)
      ? `A template named "${localName.value.trim()}" already exists. Please choose a different name.`
      : err.message
    showToast('Rename failed', msg, 'error')
  }
}

function cancelEdit() { editingName.value = false }

function insertVariable(key) {
  tokenEditorEl.value?.insertChip(key)
}

// ── Delete ─────────────────────────────────────────────────────────────────
const showDeleteDialog = ref(false)

async function confirmDelete() {
  showDeleteDialog.value = false
  try {
    await window.api.deleteTemplate(props.template.id)
    emit('deleted')
  } catch (err) {
    showToast('Delete failed', err.message, 'error')
  }
}

// ── Send ───────────────────────────────────────────────────────────────────
const sendMode          = ref('contacts')
const isSending         = ref(false)
const useBuffer         = ref(false)
const bufferSeconds     = ref(5)
const sendProgress      = ref(null)

// Contacts tab
const allContacts        = ref([])
const contactSearch      = ref('')
const selectedContactIds = ref(new Set())

const filteredContacts = computed(() => {
  const q = contactSearch.value.toLowerCase()
  if (!q) return allContacts.value
  const qDigits = q.replace(/\D/g, '')
  return allContacts.value.filter(c => {
    if (c.name.toLowerCase().includes(q)) return true
    if ((c.nickname || '').toLowerCase().includes(q)) return true
    if (qDigits && c.phone.replace(/\D/g, '').includes(qDigits)) return true
    return false
  })
})

const selectedContactObjects = computed(() =>
  allContacts.value.filter(c => selectedContactIds.value.has(c.id))
)

function toggleContact(id) {
  const s = new Set(selectedContactIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedContactIds.value = s
}

// Groups tab
const selectedGroupIds = ref([])

const canSendTemplate = computed(() =>
  localBody.value.trim().length > 0 || localAttachments.value.length > 0
)

// ── Preview ────────────────────────────────────────────────────────────────
const groupMembersCache = ref({})

watch(selectedGroupIds, async (ids) => {
  for (const id of ids) {
    if (!groupMembersCache.value[id]) {
      const members = await window.api.getGroupMembers(id)
      groupMembersCache.value = { ...groupMembersCache.value, [id]: members }
    }
  }
}, { deep: true })

const previewContactGroups = computed(() => {
  if (sendMode.value !== 'groups' || selectedGroupIds.value.length === 0) return null
  const groups = selectedGroupIds.value
    .map(id => {
      const group = props.groups.find(g => g.id === id)
      const members = groupMembersCache.value[id] || []
      return members.length ? { groupName: group?.name ?? 'Group', contacts: members } : null
    })
    .filter(Boolean)
  return groups.length ? groups : null
})

const totalGroupContacts = computed(() =>
  selectedGroupIds.value.reduce((sum, id) => sum + (groupMembersCache.value[id]?.length ?? 0), 0)
)

const previewContacts = computed(() => {
  if (sendMode.value === 'contacts' && selectedContactObjects.value.length > 0)
    return selectedContactObjects.value
  return []
})

const rawPreviewHtml = computed(() => {
  const escaped = localBody.value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/⟦(\w+)⟧/g, (_, key) => {
    const label = TOKEN_LABELS[key]
    if (!label) return `⟦${key}⟧`
    return `<span class="raw-token-chip">${label}</span>`
  })
})

const showRawPreview = computed(() =>
  (sendMode.value === 'contacts' && selectedContactIds.value.size === 0) ||
  (sendMode.value === 'groups' && !previewContactGroups.value?.length)
)

function onKeydown(e) {
  if (e.key !== 'Escape') return
  if (showDeleteDialog.value) { showDeleteDialog.value = false; return }
}
function onBeforeUnload() { doSave({ showFeedback: false }) }

onMounted(async () => {
  allContacts.value = await window.api.getContacts()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  doSave({ showFeedback: false })
})

const { unknownWarning, unknownWarningNeverCheck, checkUnknownThenProceed: warnIfUnknown } = useUnknownRecipientWarning()

function checkUnknownThenProceed(proceedFn) {
  const mode = sendMode.value
  let unknowns = []
  if (mode === 'contacts') {
    unknowns = selectedContactObjects.value
  } else {
    unknowns = selectedGroupIds.value.flatMap(id => groupMembersCache.value[id] || [])
  }
  const names = getUnconfirmedNames(unknowns)
  warnIfUnknown(names, proceedFn)
}

async function sendNow() {
  if (isSending.value) return
  isSending.value = true
  sendProgress.value = null
  window.api.onSendProgress((p) => { sendProgress.value = p })

  // Snapshot selections synchronously before any async work
  const mode         = sendMode.value
  const contactIds   = [...selectedContactIds.value]
  const groupIds     = [...selectedGroupIds.value]

  try {
    // Auto-save current body/attachments before sending so the outgoing text is up-to-date
    await doSave({ showFeedback: false })

    const delaySeconds = useBuffer.value ? Math.max(1, Math.min(60, bufferSeconds.value)) : 0

    if (mode === 'contacts') {
      const ids = contactIds
      const result = await window.api.templateSend(props.template.id, 'contacts', ids, delaySeconds)
      if (result.failed === 0) {
        if (result.buffered) {
          showToast('Messages are delivering', 'Messages have started delivering and will continue to deliver with the buffer delay.', 'success', 7000)
        } else {
          showToast(`Sent to ${result.succeeded} ${result.succeeded === 1 ? 'person' : 'people'}`, '', 'success')
        }
        selectedContactIds.value = new Set()
        contactSearch.value = ''
      } else if (result.succeeded === 0) {
        showToast('Send failed', 'Could not reach any recipients.', 'error')
      } else {
        showToast(`Sent ${result.succeeded}, failed ${result.failed}`, '', 'error')
      }
    } else {
      const result = await window.api.templateSend(props.template.id, 'groups', groupIds, delaySeconds)
      if (result.buffered) {
        showToast('Messages are delivering', 'Messages have started delivering and will continue to deliver with the buffer delay.', 'success', 7000)
        selectedGroupIds.value = []
      } else {
        const total = result.results.reduce((sum, r) => sum + r.succeeded, 0)
        const failed = result.results.reduce((sum, r) => sum + r.failed, 0)
        if (failed === 0) {
          showToast(`Sent to ${result.results.length} ${result.results.length === 1 ? 'group' : 'groups'}`, `${total} messages delivered.`, 'success')
          selectedGroupIds.value = []
        } else {
          showToast(`Sent with errors`, `${total} delivered, ${failed} failed.`, 'error')
        }
      }
    }
  } catch (err) {
    showToast('Send failed', err.message, 'error')
  } finally {
    window.api.offSendProgress()
    sendProgress.value = null
    isSending.value = false
  }
}
</script>

<style src="../styles/message-panel.css"></style>

<style scoped>
.template-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Header overrides ────────────────────────────────────────────────────── */
.detail-header { align-items: center; }

.title-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.template-title {
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.edit-hint { font-size: 14px; font-weight: 400; transition: opacity 0.15s; }
.template-title:hover .edit-hint { opacity: 1; }

.name-editor { font-size: 20px; max-width: 400px; }

.detail-body { padding: 20px 28px; gap: 16px; }
.attachment-row { margin-top: -12px; }

.raw-preview {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  margin-top: 12px;
}
.raw-preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}
.raw-preview-bubble :deep(.raw-token-chip) {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  border: 1px solid var(--accent-tint-border);
  background: var(--accent-tint);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-tint-text);
  line-height: 1.6;
}

.raw-preview-bubble {
  background: var(--surface);
  border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}


.save-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.saved-label { font-size: 12px; color: var(--text-2); }

/* ── Send tabs ── */
.send-tabs {
  display: flex;
  gap: 4px;
}
.send-tabs button {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-2);
  cursor: pointer;
}
.send-tabs button.active {
  background: var(--accent-tint);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.send-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 0;
}

/* ── Contact picker ── */
.search-row { display: flex; }
.contact-search {
  width: 100%;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
}
.contact-search:focus { border-color: var(--accent); }

.contact-results {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
}
.contact-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid var(--border);
}
.contact-result-row:last-child { border-bottom: none; }
.contact-result-row:hover { background: var(--bg); }
.contact-result-row.selected { background: var(--accent-tint); }

.contact-info { flex: 1; min-width: 0; }
.contact-name { font-size: 13px; font-weight: 500; }
.contact-phone { font-size: 11px; color: var(--text-2); margin-top: 1px; }

.no-results {
  font-size: 13px;
  color: var(--text-2);
  padding: 8px 0;
  text-align: center;
}

.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--accent-tint);
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
}
.chip-remove {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 14px;
  padding: 0;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.chip-remove:hover { opacity: 0.7; background: none; }

/* ── Group checkboxes ── */
.group-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.group-check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid var(--border);
}
.group-check-row:last-child { border-bottom: none; }
.group-check-row:hover { background: var(--bg); }
.group-check-name { flex: 1; font-size: 13px; font-weight: 500; }
.group-check-count { font-size: 11px; color: var(--text-2); }

/* ── Send bar ── */
.send-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  margin-top: 4px;
}

</style>
