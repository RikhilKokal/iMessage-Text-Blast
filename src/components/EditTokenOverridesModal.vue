<template>
  <div class="overlay" @click.self="closeModal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">
          Token Overrides for
          <div class="chip-wrap" ref="chipWrap" style="display: inline-block; margin-left: 8px;">
            <button class="contact-chip" @click="toggleOpen">
              {{ currentContact?.name || 'Select contact' }}
              <span class="chip-arrow">▾</span>
            </button>
            <div v-if="open" class="dropdown" :style="{ maxHeight: dropdownMaxH + 'px' }">
              <button
                v-for="c in props.contacts"
                :key="c.id"
                class="dropdown-item"
                :class="{ active: c.id === currentContact?.id }"
                @click="selectContact(c)"
              >{{ c.name }}</button>
              <div class="dropdown-separator"></div>
              <button
                class="dropdown-item"
                :class="{ active: currentContact?.id === 'empty-defaults' }"
                @click="selectContact({ id: 'empty-defaults', name: 'Empty Value Defaults' })"
              >Empty Value Defaults</button>
            </div>
          </div>
        </h2>
        <button class="btn-close" @click="closeModal" title="Close">×</button>
      </div>

      <div class="modal-content">
        <div v-if="isLoading" class="loading-state">Loading overrides…</div>
        <div v-else-if="!currentContact" class="empty-state">No contacts available</div>
        <div v-else>
          <TokenOverrideEditor
            ref="editorRef"
            :contact="currentContact"
            :isEmptyDefaults="currentContact?.id === 'empty-defaults'"
          />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="closeModal">Close</button>
          <button class="btn-primary" @click="saveCurrentContact" v-if="currentContact">
            Save Overrides
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, inject } from 'vue'
import TokenOverrideEditor from './TokenOverrideEditor.vue'

const props = defineProps({
  contacts: { type: Array, required: true },
  memberOverrides: { type: Map, required: true },
})

const emit = defineEmits(['close', 'saved'])
const addToast = inject('addToast')
const editorRef = ref(null)

// State
const open = ref(false)
const currentContact = ref(null)
const draftOverrides = ref({})
const savedOverridesMap = ref(new Map())
const chipWrap = ref(null)
const dropdownMaxH = ref(220)
const isLoading = ref(false)

// On mount: load all contacts' saved overrides and select first
onMounted(async () => {
  if (props.contacts.length === 0) return
  currentContact.value = props.contacts[0]
  isLoading.value = true
  try {
    const overridesMap = new Map()
    // Load contact-level overrides
    for (const contact of props.contacts) {
      try {
        const overrides = await window.api.getContactTokenOverrides(contact.id)
        if (Object.keys(overrides).length > 0) {
          overridesMap.set(contact.id, overrides)
        }
      } catch (err) {
        console.warn(`Failed to load overrides for ${contact.id}:`, err)
      }
    }
    // Load empty value defaults
    try {
      const emptyDefaults = await window.api.getEmptyValueDefaults()
      if (Object.keys(emptyDefaults).length > 0) {
        overridesMap.set('empty-defaults', emptyDefaults)
      }
    } catch (err) {
      console.warn('Failed to load empty value defaults:', err)
    }
    savedOverridesMap.value = overridesMap
  } finally {
    isLoading.value = false
  }
  await nextTick()
  loadContactDraft(currentContact.value)
  document.addEventListener('mousedown', onClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
})

// Load contact's saved overrides (or empty if none exist) into draftOverrides
function loadContactDraft(contact) {
  if (!contact) return
  const saved = savedOverridesMap.value.get(contact.id) || {}
  editorRef.value?.setOverrides(saved)
  draftOverrides.value = { ...saved }
}

// Save current contact's draftOverrides to database
async function saveCurrentContact() {
  if (!currentContact.value) return
  try {
    const overrides = editorRef.value.getOverrides()
    const saved = savedOverridesMap.value.get(currentContact.value.id) || {}
    const hasChanges = JSON.stringify(overrides) !== JSON.stringify(saved)

    if (!hasChanges) return

    const isEmptyDefaults = currentContact.value.id === 'empty-defaults'

    if (Object.keys(overrides).length > 0) {
      if (isEmptyDefaults) {
        await window.api.saveEmptyValueDefaults(overrides)
      } else {
        await window.api.saveContactTokenOverrides(currentContact.value.id, overrides)
      }
      savedOverridesMap.value.set(currentContact.value.id, overrides)
    } else {
      if (isEmptyDefaults) {
        await window.api.deleteEmptyValueDefaults()
      } else {
        await window.api.deleteContactTokenOverrides(currentContact.value.id)
      }
      savedOverridesMap.value.delete(currentContact.value.id)
    }
    draftOverrides.value = overrides
    addToast(`Token overrides for ${currentContact.value.name} saved.`, '', 'success')
    emit('saved')
  } catch (err) {
    addToast(`Failed to save overrides: ${err.message}`, '', 'error')
  }
}

// Auto-save current contact and switch to new contact
async function selectContact(contact) {
  if (!currentContact.value) {
    currentContact.value = contact
    loadContactDraft(contact)
    open.value = false
    return
  }

  // Auto-save before switching (only if there are changes)
  await saveCurrentContact()

  // Switch to new contact
  currentContact.value = contact
  loadContactDraft(contact)
  open.value = false
}

// Dropdown positioning logic (copied from MessagePreview)
function toggleOpen() {
  if (!open.value && chipWrap.value) {
    const rect = chipWrap.value.getBoundingClientRect()
    let clipBottom = window.innerHeight
    let el = chipWrap.value.parentElement
    while (el) {
      const style = getComputedStyle(el)
      if (style.overflow === 'auto' || style.overflowY === 'auto' ||
          style.overflow === 'scroll' || style.overflowY === 'scroll') {
        clipBottom = el.getBoundingClientRect().bottom
        break
      }
      el = el.parentElement
    }
    dropdownMaxH.value = Math.max(80, clipBottom - rect.bottom - 32)
  }
  open.value = !open.value
}

function closeModal() {
  emit('close')
}

// Close dropdown on outside click
function onClickOutside(e) {
  if (chipWrap.value && !chipWrap.value.contains(e.target)) open.value = false
}
</script>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.btn-close {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text-2);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.btn-close:hover { background: var(--bg); color: var(--text); }

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.modal-actions {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-secondary,
.btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-tertiary);
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

/* Contact chip and dropdown — reuse MessagePreview styles */
.chip-wrap {
  position: relative;
  display: inline-block;
}

.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px 2px 10px;
  background: var(--accent-tint);
  color: var(--accent-tint-text);
  border: 1px solid var(--accent-tint-border);
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font);
  letter-spacing: 0.03em;
  text-transform: none;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.contact-chip:hover {
  background: #cce2ff;
  border-color: var(--accent-tint-text);
}

.chip-arrow {
  font-size: 16px;
  opacity: 0.7;
  position: relative;
  top: -1px;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  z-index: 1001;
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--font);
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.dropdown-item:hover  { background: var(--bg); }
.dropdown-item.active { background: var(--accent-tint); color: var(--accent-tint-text); font-weight: 600; }

.dropdown-separator {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.loading-state {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-2);
}

</style>
