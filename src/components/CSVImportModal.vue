<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">{{ title }}</h2>
        <button class="btn-close" @click="$emit('close')" title="Close">×</button>
      </div>

      <div class="import-content">
        <div v-if="!csvParsed" class="state-section">
          <button class="btn-primary full-width" @click="selectFile" :disabled="csvParsing">
            {{ csvParsing ? 'Selecting file…' : 'Choose CSV File' }}
          </button>
          <p class="hint-text">CSV needs Name (or First Name + Last Name) and Phone columns. Column names are case-insensitive, order doesn't matter, and extra columns are ignored.</p>
          <p class="context-text">{{ groupName ? `Contacts will be added to in-app contact list and to the "${groupName}" group.` : 'Contacts will be added to in-app contact list (not to any specific group).' }}</p>
        </div>

        <div v-else class="state-section">
          <div class="preview-header">
            <h3>Found {{ csvParsed.length }} contact{{ csvParsed.length === 1 ? '' : 's' }}</h3>
            <button class="btn-secondary small" @click="csvParsed = null">Change file</button>
          </div>

          <div v-if="csvParsed.length === 0" class="state-msg">
            No valid contacts found in file.
          </div>

          <div v-else class="preview-list">
            <div
              v-for="(contact, idx) in csvParsed"
              :key="idx"
              class="preview-row"
            >
              <label class="preview-checkbox">
                <input
                  type="checkbox"
                  :checked="csvSelectedRows.has(idx)"
                  @change="toggleCsvRow(idx)"
                />
              </label>
              <div class="preview-info">
                <div class="preview-name">{{ contact.name }}</div>
                <div class="preview-phone">{{ contact.phone }}</div>
              </div>
            </div>
          </div>

          <div class="action-buttons">
            <button class="btn-secondary" @click="csvParsed = null">Cancel</button>
            <button
              class="btn-primary"
              @click="importSelected"
              :disabled="csvSelectedRows.size === 0 || csvImporting"
            >
              {{ csvImporting ? 'Importing…' : `Add ${csvSelectedRows.size}` }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: { type: String, default: 'Import Contacts' },
  onImportSelected: { type: Function, required: true },
  groupName: { type: String, default: null },
})

const emit = defineEmits(['close'])

const csvParsing = ref(false)
const csvImporting = ref(false)
const csvParsed = ref(null)
const csvSelectedRows = ref(new Set())

function toggleCsvRow(idx) {
  if (csvSelectedRows.value.has(idx)) {
    csvSelectedRows.value.delete(idx)
  } else {
    csvSelectedRows.value.add(idx)
  }
}

async function selectFile() {
  csvParsing.value = true
  const filePath = await window.api.openFileDialog({
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  csvParsing.value = false

  if (!filePath) return

  try {
    const result = await window.api.parseCSV(filePath)
    if (result.error) {
      alert(`CSV Error: ${result.error}`)
      return
    }

    csvParsed.value = result.rows
    csvSelectedRows.value.clear()
    for (let i = 0; i < csvParsed.value.length; i++) {
      csvSelectedRows.value.add(i)
    }
  } catch (err) {
    alert(`Failed to parse CSV: ${err.message}`)
  }
}

async function importSelected() {
  csvImporting.value = true
  try {
    const selected = Array.from(csvSelectedRows.value).map(idx => csvParsed.value[idx])
    await props.onImportSelected(selected)
    emit('close')
  } catch (err) {
    console.error('[CSV Import] Error:', err)
    alert(`Import failed: ${err.message}`)
  } finally {
    csvImporting.value = false
  }
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

.modal-header h2 {
  font-size: 17px;
  font-weight: 700;
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

.import-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.full-width {
  width: 100%;
  justify-content: center;
}

.hint-text {
  font-size: 12px;
  color: var(--text-2);
  text-align: center;
  margin: 0;
  line-height: 1.4;
}

.context-text {
  font-size: 12px;
  color: var(--accent);
  text-align: center;
  margin: 0;
  line-height: 1.4;
  font-weight: 500;
}

.state-msg {
  padding: 24px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.preview-header h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}

.preview-list {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  max-height: 250px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
  transition: background 0.12s;
}

.preview-row:last-child {
  border-bottom: none;
}

.preview-row:hover {
  background: var(--bg);
}

.preview-checkbox {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-checkbox input {
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
  margin: 0;
  padding: 0;
}

.preview-checkbox input:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.preview-checkbox input:checked::after {
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

.preview-info {
  flex: 1;
  min-width: 0;
}

.preview-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.preview-phone {
  font-size: 11px;
  color: var(--text-2);
  margin-top: 2px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: auto;
}

.action-buttons button {
  flex: 0 0 auto;
}
</style>
