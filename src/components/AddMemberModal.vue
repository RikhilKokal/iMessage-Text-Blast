<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">Add Member</h2>
        <div class="header-actions">
          <button
            class="btn-secondary small"
            :class="{ active: mode === 'import' }"
            @click="mode = mode === 'import' ? 'browse' : 'import'"
            title="Import from CSV"
          >{{ mode === 'import' ? '← Back' : 'Import from CSV 📥' }}</button>
          <button class="btn-close" @click="$emit('close')" title="Close">×</button>
        </div>
      </div>

      <!-- Browse mode -->
      <template v-if="mode === 'browse'">
        <input
          ref="searchEl"
          v-model="search"
          placeholder="Search by name or phone…"
          class="search-input"
          @keyup.enter="filtered.length > 0 && $emit('add', filtered[0].id)"
        />

        <div class="list-wrap">
          <div v-if="loading" class="state-msg">Loading contacts…</div>
          <div v-else-if="available.length === 0" class="state-msg">
            {{ allContacts.length === 0 ? 'No contacts found. Sync from macOS or import CSV.' : 'All contacts already in this group.' }}
          </div>
          <div v-else-if="filtered.length === 0" class="state-msg">No contacts match "{{ search }}".</div>

          <div
            v-for="contact in filtered"
            :key="contact.id"
            class="contact-row"
            @click="$emit('add', contact.id)"
          >
            <div class="avatar">{{ initials(contact.name) }}</div>
            <div class="info">
              <div class="name">{{ contact.name }}</div>
              <div class="phone">
                {{ contact.phone }}
                <span v-if="contact.phone_label && nameHasMultiple(contact.name)" class="phone-label">({{ contact.phone_label }})</span>
                <span v-if="contact.source === 'csv'" class="csv-label">(Imported from CSV)</span>
              </div>
            </div>
            <span class="add-icon">+</span>
          </div>
        </div>
      </template>

      <!-- Import CSV mode -->
      <template v-else>
        <CSVImportModal
          title="Import Members"
          :on-import-selected="importCsvToGroup"
          :group-name="groupName"
          @close="mode = 'browse'"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import CSVImportModal from './CSVImportModal.vue'

const props = defineProps({
  existingMemberIds: { type: Array, default: () => [] },
  groupId: { type: Number, required: false },
  groupName: { type: String, default: '' },
})
const emit = defineEmits(['add', 'imported', 'close'])
const addToast = inject('addToast')

const mode = ref('browse')
const allContacts = ref([])
const search = ref('')
const loading = ref(true)
const searchEl = ref(null)

function onKeydown(e) { if (e.key === 'Escape') emit('close') }
onMounted(async () => {
  allContacts.value = await window.api.getContacts()
  loading.value = false
  searchEl.value?.focus()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const available = computed(() =>
  allContacts.value.filter((c) => !props.existingMemberIds.includes(c.id))
)

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return available.value
  const qDigits = q.replace(/\D/g, '')
  return available.value.filter(c => {
    if (c.name.toLowerCase().includes(q)) return true
    if ((c.nickname || '').toLowerCase().includes(q)) return true
    if (qDigits && c.phone.replace(/\D/g, '').includes(qDigits)) return true
    return false
  })
})

const multiplePhoneNames = computed(() => {
  const counts = {}
  for (const c of available.value) counts[c.name] = (counts[c.name] || 0) + 1
  return new Set(Object.keys(counts).filter(n => counts[n] > 1))
})

function nameHasMultiple(name) {
  return multiplePhoneNames.value.has(name)
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

async function importCsvToGroup(contacts) {
  if (!props.groupId) {
    throw new Error('Error: Group ID not provided')
  }

  console.log(`[CSV Import] Starting import of ${contacts.length} contacts to group ${props.groupId}`)

  let added = 0
  let alreadyAdded = 0
  for (const contact of contacts) {
    try {
      console.log(`[CSV Import] Adding contact: ${contact.name} (${contact.phone})`)
      let id = await window.api.addContact(contact.name, contact.phone, '', 'csv')
      console.log(`[CSV Import] addContact returned ID: ${id}`)

      if (!id) {
        console.log(`[CSV Import] addContact returned null (duplicate). Looking up existing contact.`)
        const existingContact = await window.api.getContactByPhone(contact.phone)
        if (existingContact) {
          id = existingContact.id
          console.log(`[CSV Import] Found existing contact ID: ${id}`)
        }
      }

      if (id) {
        console.log(`[CSV Import] Adding contact ID ${id} to group ${props.groupId}`)
        const alreadyInGroup = await window.api.isContactInGroup(props.groupId, id)
        if (alreadyInGroup) {
          console.log(`[CSV Import] Contact already in group`)
          alreadyAdded++
        } else {
          await window.api.addMemberToGroup(props.groupId, id)
          console.log(`[CSV Import] Successfully added to group`)
          added++
        }
      }
    } catch (err) {
      console.error(`[CSV Import] Error adding contact ${contact.name}:`, err)
      throw new Error(`Failed to add ${contact.name}: ${err.message}`)
    }
  }

  console.log(`[CSV Import] Import complete. Added ${added}/${contacts.length} contacts`)

  if (addToast) {
    const parts = []
    if (added > 0) parts.push(`Added ${added} contact${added === 1 ? '' : 's'}`)
    if (alreadyAdded > 0) parts.push(`${alreadyAdded} already added`)
    const message = parts.length > 0 ? parts.join(', ') + '.' : 'No new contacts imported.'
    addToast('CSV imported', message, 'success')
  }

  emit('imported', { added })
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal {
  background: var(--surface);
  border-radius: 12px;
  width: 480px;
  max-height: 560px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 0;
}
.modal-header h2 { font-size: 17px; font-weight: 700; }

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-mode {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: var(--bg);
  color: var(--text-2);
  font-size: 14px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.btn-mode:hover { background: var(--border); }
.btn-mode.active { background: var(--accent); color: white; }

.btn-close {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: var(--bg);
  color: var(--text-2);
  font-size: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.btn-close:hover { background: var(--border); }

.search-input {
  margin: 14px 20px 10px;
  width: calc(100% - 40px);
}

.list-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
}

.state-msg {
  padding: 24px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.12s;
}
.contact-row:hover { background: var(--bg); }
.contact-row:hover .add-icon { opacity: 1; }

.avatar {
  width: 34px;
  height: 34px;
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

.info { flex: 1; min-width: 0; }
.name  { font-size: 13px; font-weight: 500; }
.phone { font-size: 11px; color: var(--text-2); margin-top: 1px; }
.phone-label { opacity: 0.7; }
.csv-label {
  color: var(--text-2);
  font-weight: 500;
  margin-left: 4px;
}

.add-icon {
  font-size: 18px;
  color: var(--accent);
  font-weight: 700;
  opacity: 0;
  transition: opacity 0.12s;
}
</style>
