<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">Edit Tags</h2>
        <button class="btn-close" @click="$emit('close')" title="Close">×</button>
      </div>

      <div class="new-tag-row">
        <input
          ref="newTagInput"
          v-model="newTagName"
          maxlength="25"
          placeholder="New tag name…"
          :class="{ 'input-error': newTagError, 'at-limit': newTagName.length >= 25 }"
          @keyup.enter="submitNewTag"
        />
        <button class="btn-primary small" :disabled="!newTagName.trim()" @click="submitNewTag">Add</button>
      </div>
      <p class="char-counter" :class="{ 'at-limit': newTagName.length >= 25 }">{{ newTagName.length }}/25</p>
      <p v-if="newTagError" class="error-msg">{{ newTagError }}</p>

      <div class="list-wrap">
        <div v-if="tags.length === 0" class="state-msg">No tags yet — add one above.</div>

        <div v-for="tag in tags" :key="tag.id" class="tag-row">
          <div class="tag-row-main">
            <input
              class="tag-name-input"
              :value="tag.name"
              :class="{ 'input-error': renameErrors[tag.id] }"
              @blur="e => submitRename(tag, e.target.value)"
              @keyup.enter="e => e.target.blur()"
            />
            <button class="btn-secondary small" @click="toggleExpanded(tag.id)">
              {{ expandedTagId === tag.id ? 'Hide Members' : 'Edit Members' }}
            </button>
            <button class="btn-remove" title="Delete tag" @click="tagPendingDelete = tag">×</button>
          </div>
          <p v-if="renameErrors[tag.id]" class="error-msg">{{ renameErrors[tag.id] }}</p>

          <div v-if="expandedTagId === tag.id" class="member-checklist">
            <div v-for="m in members" :key="m.id" class="member-check-row" @click="toggleMemberTag(tag, m)">
              <span class="round-check" :class="{ checked: hasTag(m, tag.id) }"></span>
              {{ m.name }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <DeleteConfirmDialog
      v-if="tagPendingDelete"
      :itemName="tagPendingDelete.name"
      itemType="Tag"
      @confirm="confirmDeleteTag"
      @close="tagPendingDelete = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import DeleteConfirmDialog from './DeleteConfirmDialog.vue'

const props = defineProps({
  group: { type: Object, required: true },
  tags: { type: Array, default: () => [] },
  members: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'changed'])

const newTagName = ref('')
const newTagError = ref('')
const newTagInput = ref(null)
const renameErrors = ref({})
const expandedTagId = ref(null)
const tagPendingDelete = ref(null)

onMounted(() => {
  newTagInput.value?.focus()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onKeydown(e) {
  if (e.key === 'Escape' && !tagPendingDelete.value) emit('close')
}

function hasTag(member, tagId) {
  return (member.tags || []).some(t => t.id === tagId)
}

function cleanErrorMessage(err) {
  // Extract meaningful error message, removing IPC wrapper text
  const msg = err.message || String(err)
  const match = msg.match(/Error: (.+)$/)
  return match ? match[1] : msg
}

async function submitNewTag() {
  const trimmed = newTagName.value.trim()
  if (!trimmed) return
  newTagError.value = ''
  try {
    await window.api.createTag(props.group.id, trimmed)
    newTagName.value = ''
    emit('changed')
  } catch (err) {
    newTagError.value = cleanErrorMessage(err)
  }
}

async function submitRename(tag, newValue) {
  const trimmed = newValue.trim()
  if (!trimmed || trimmed === tag.name) return
  renameErrors.value = { ...renameErrors.value, [tag.id]: '' }
  try {
    await window.api.renameTag(tag.id, trimmed)
    emit('changed')
  } catch (err) {
    renameErrors.value = { ...renameErrors.value, [tag.id]: cleanErrorMessage(err) }
  }
}

function toggleExpanded(tagId) {
  expandedTagId.value = expandedTagId.value === tagId ? null : tagId
}

async function toggleMemberTag(tag, member) {
  if (hasTag(member, tag.id)) {
    await window.api.removeTagFromMember(tag.id, member.id)
  } else {
    await window.api.addTagToMember(tag.id, member.id)
  }
  emit('changed')
}

async function confirmDeleteTag() {
  const tag = tagPendingDelete.value
  tagPendingDelete.value = null
  await window.api.deleteTag(tag.id)
  if (expandedTagId.value === tag.id) expandedTagId.value = null
  emit('changed')
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
  max-height: 620px;
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

.new-tag-row {
  display: flex;
  gap: 8px;
  margin: 14px 20px 0;
}
.new-tag-row input { flex: 1; }

.error-msg {
  font-size: 12px;
  color: var(--error);
  margin: 4px 20px 0;
}

input.input-error { border-color: var(--error); }

input.at-limit { border-color: var(--error); }

.char-counter {
  font-size: 12px;
  color: var(--text-2);
  padding: 0 20px;
  margin: 4px 0 0;
}
.char-counter.at-limit {
  color: var(--error);
}

.list-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 20px;
}

.state-msg {
  padding: 24px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}

.tag-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.tag-row:last-child { border-bottom: none; }

.tag-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-name-input {
  flex: 1;
  min-width: 0;
}

.btn-remove {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
}
.btn-remove:hover { background: var(--error-tint); color: var(--danger); }

.member-checklist {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--bg);
  border-radius: var(--radius);
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.member-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 3px 0;
  cursor: pointer;
}
</style>
