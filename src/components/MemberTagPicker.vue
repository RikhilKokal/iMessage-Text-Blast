<template>
  <div class="tag-picker-wrap" ref="wrapEl">
    <button class="btn-service unknown add-tag-pill" title="Add tag" @click="toggleOpen">+</button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="dropdownEl"
        class="member-tag-picker-dropdown"
        :style="{ top: dropdownTop + 'px', left: dropdownLeft + 'px', maxHeight: dropdownMaxH + 'px' }"
      >
        <div v-if="availableTags.length === 0" class="dropdown-empty">No more existing tags</div>
        <button
          v-for="tag in availableTags"
          :key="tag.id"
          class="dropdown-item"
          @click="select(tag)"
        >{{ tag.name }}</button>

        <div class="new-tag-row">
          <input
            v-model="newTagName"
            maxlength="25"
            class="new-tag-input"
            :class="{ 'at-limit': newTagName.length >= 25 }"
            placeholder="New tag…"
            @keyup.enter="createAndAssign"
            @click.stop
          />
          <button class="new-tag-btn" :disabled="!newTagName.trim()" @click="createAndAssign">Add</button>
        </div>
        <p class="char-counter" :class="{ 'at-limit': newTagName.length >= 25 }">{{ newTagName.length }}/25</p>
        <p v-if="newTagError" class="error-msg">{{ newTagError }}</p>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  member: { type: Object, required: true },
  groupId: { type: [Number, String], required: true },
  groupTags: { type: Array, default: () => [] },
})
const emit = defineEmits(['assigned'])

const open = ref(false)
const wrapEl = ref(null)
const dropdownEl = ref(null)
const newTagName = ref('')
const newTagError = ref('')
const dropdownMaxH = ref(260)
const dropdownTop = ref(0)
const dropdownLeft = ref(0)

const availableTags = computed(() => {
  const assignedIds = new Set((props.member.tags || []).map(t => t.id))
  return props.groupTags.filter(t => !assignedIds.has(t.id))
})

function cleanErrorMessage(err) {
  // Extract meaningful error message, removing IPC wrapper text
  const msg = err.message || String(err)
  const match = msg.match(/Error: (.+)$/)
  return match ? match[1] : msg
}

async function toggleOpen() {
  if (open.value) {
    open.value = false
    return
  }
  if (!wrapEl.value) { open.value = true; return }

  const rect = wrapEl.value.getBoundingClientRect()
  // Teleported to <body>, so no ancestor's overflow/scroll clipping applies —
  // the only real boundary is the window itself.
  dropdownTop.value = rect.bottom + 4
  dropdownLeft.value = rect.left
  dropdownMaxH.value = Math.max(80, window.innerHeight - rect.bottom - 32)

  newTagName.value = ''
  newTagError.value = ''
  open.value = true

  // Render left-anchored first, then measure the actual rendered edge and
  // shift left only if it's genuinely overflowing the window — more reliable
  // than guessing the dropdown's width ahead of time.
  await nextTick()
  if (dropdownEl.value) {
    const dRect = dropdownEl.value.getBoundingClientRect()
    if (dRect.right > window.innerWidth) {
      dropdownLeft.value = Math.max(8, rect.right - dRect.width)
    }
  }
}

async function select(tag) {
  open.value = false
  await window.api.addTagToMember(tag.id, props.member.id)
  emit('assigned')
}

async function createAndAssign() {
  const trimmed = newTagName.value.trim()
  if (!trimmed) return
  newTagError.value = ''
  try {
    const tagId = await window.api.createTag(props.groupId, trimmed)
    await window.api.addTagToMember(tagId, props.member.id)
    open.value = false
    newTagName.value = ''
    emit('assigned')
  } catch (err) {
    newTagError.value = cleanErrorMessage(err)
  }
}

function onClickOutside(e) {
  if (open.value && wrapEl.value && !wrapEl.value.contains(e.target) && dropdownEl.value && !dropdownEl.value.contains(e.target)) {
    open.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style scoped>
.tag-picker-wrap {
  position: relative;
  display: inline-block;
}

.add-tag-pill {
  cursor: pointer;
  width: 18px;
  height: 18px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  border-radius: 50%;
  flex-shrink: 0;
  /* GroupDetail.vue's .btn-service/.unknown look, self-contained here rather
     than relying on it — Vue's scoped CSS only reaches a child component's
     ROOT element, not elements nested inside a child's own template, so
     GroupDetail's scoped rules never actually apply to this button. */
  border: 1.5px solid var(--border);
  background: var(--bg);
  color: var(--text-2);
  transition: opacity 0.12s;
}
.add-tag-pill:hover { opacity: 0.75; }
</style>

<style>
/* Unscoped: this dropdown is teleported to <body>, outside this component's
   scoped-style DOM subtree, so scoped styles wouldn't apply to it. Class name
   is unique to this component to avoid colliding with SelectByTagDropdown's
   own teleported dropdown, which is also unscoped for the same reason. */
.member-tag-picker-dropdown {
  position: fixed;
  min-width: 160px;
  max-width: 220px;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 1000;
}
.member-tag-picker-dropdown .dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.member-tag-picker-dropdown .dropdown-item:hover { background: var(--bg); }

.member-tag-picker-dropdown .dropdown-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-2);
}

.member-tag-picker-dropdown .new-tag-row {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--border);
}

.member-tag-picker-dropdown .new-tag-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  padding: 4px 8px;
}
.member-tag-picker-dropdown .new-tag-input.at-limit {
  border-color: var(--error);
}

.member-tag-picker-dropdown .char-counter {
  font-size: 11px;
  color: var(--text-2);
  padding: 0 8px 6px;
  margin: 0;
}
.member-tag-picker-dropdown .char-counter.at-limit {
  color: var(--error);
}

.member-tag-picker-dropdown .new-tag-btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--accent-tint-border);
  background: var(--accent-tint);
  color: var(--accent-tint-text);
  cursor: pointer;
  flex-shrink: 0;
}
.member-tag-picker-dropdown .new-tag-btn:disabled { opacity: 0.5; cursor: default; }

.member-tag-picker-dropdown .error-msg {
  font-size: 11px;
  color: var(--error);
  padding: 0 8px 6px;
  margin: 0;
}
</style>
