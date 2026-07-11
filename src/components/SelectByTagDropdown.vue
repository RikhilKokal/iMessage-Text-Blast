<template>
  <div class="select-by-tag-wrap" ref="wrapEl">
    <button class="btn-secondary small" :disabled="tags.length === 0" @click="toggleOpen">Select by Tag</button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="dropdownEl"
        class="select-by-tag-dropdown"
        :style="{ top: dropdownTop + 'px', left: dropdownLeft + 'px', maxHeight: dropdownMaxH + 'px' }"
      >
        <div v-if="tags.length === 0" class="dropdown-empty">No tags in this group yet</div>
        <div v-else class="dropdown-header">
          <span class="header-text">Select members with</span>
          <button class="mode-pill" @click="toggleMode">{{ tagMode }}</button>
          <span class="header-text">of the following tags</span>
        </div>
        <label v-for="tag in tags" :key="tag.id" class="dropdown-item tag-item">
          <input type="checkbox" :checked="checkedTagIds.has(tag.id)" @change="toggleTag(tag.id)" />
          {{ tag.name }}
        </label>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'

const props = defineProps({
  members: { type: Array, default: () => [] },
  tags: { type: Array, default: () => [] },
  selectedIds: { type: Set, required: true },
})
const emit = defineEmits(['update:selected-ids'])

const open = ref(false)
const wrapEl = ref(null)
const dropdownEl = ref(null)
const checkedTagIds = ref(new Set())
const tagMode = ref('any')
const dropdownMaxH = ref(220)
const dropdownTop = ref(0)
const dropdownLeft = ref(0)

// Snapshot of the selection as it was before opening this dropdown — not a ref,
// since it never needs to drive rendering, only the union recompute below.
let baseline = new Set()

function getStorageKey() {
  // Get a unique key for this dropdown's mode preference
  // Since we don't have direct access to group.id, we'll use tags as a proxy
  // Generate a simple hash from tag IDs to create a unique key per group
  if (props.tags.length === 0) return null
  const tagIds = props.tags.map(t => t.id).sort().join('-')
  return `tag-mode:${tagIds}`
}

function loadModePreference() {
  const key = getStorageKey()
  if (!key) return
  const saved = localStorage.getItem(key)
  if (saved === 'all' || saved === 'any') {
    tagMode.value = saved
  }
}

function saveModePreference() {
  const key = getStorageKey()
  if (key) {
    localStorage.setItem(key, tagMode.value)
  }
}

function toggleMode() {
  tagMode.value = tagMode.value === 'any' ? 'all' : 'any'
  saveModePreference()
  // Recalculate selection with new mode
  recalculateSelection()
}

function recalculateSelection() {
  const result = new Set(baseline)

  // If no tags are checked, select all members
  if (checkedTagIds.value.size === 0) {
    result.clear()
    for (const m of props.members) {
      result.add(m.id)
    }
  } else if (tagMode.value === 'any') {
    // Union mode: members matching ANY of the checked tags
    for (const m of props.members) {
      if (m.tags?.some(t => checkedTagIds.value.has(t.id))) result.add(m.id)
    }
  } else {
    // Intersection mode: members matching ALL of the checked tags
    result.clear()
    for (const m of props.members) {
      const hasAllTags = Array.from(checkedTagIds.value).every(tagId => m.tags?.some(t => t.id === tagId))
      if (hasAllTags) result.add(m.id)
    }
  }
  emit('update:selected-ids', result)
}

async function toggleOpen() {
  if (open.value) {
    open.value = false
    return
  }
  baseline = new Set()
  loadModePreference()

  if (wrapEl.value) {
    const rect = wrapEl.value.getBoundingClientRect()
    // Teleported to <body>, so no ancestor's overflow/scroll clipping applies —
    // the only real boundary is the window itself.
    dropdownTop.value = rect.bottom + 4
    dropdownLeft.value = rect.left
    dropdownMaxH.value = Math.max(80, window.innerHeight - rect.bottom - 32)
  }

  open.value = true

  // Render left-anchored first, then measure the actual rendered edge and
  // shift left only if it's genuinely overflowing the window — more reliable
  // than guessing the dropdown's width ahead of time.
  await nextTick()
  if (wrapEl.value && dropdownEl.value) {
    const rect = wrapEl.value.getBoundingClientRect()
    const dRect = dropdownEl.value.getBoundingClientRect()
    if (dRect.right > window.innerWidth) {
      dropdownLeft.value = Math.max(8, rect.right - dRect.width)
    }
  }
}

function toggleTag(tagId) {
  const s = new Set(checkedTagIds.value)
  s.has(tagId) ? s.delete(tagId) : s.add(tagId)
  checkedTagIds.value = s
  recalculateSelection()
}

function onClickOutside(e) {
  if (open.value && wrapEl.value && !wrapEl.value.contains(e.target) && dropdownEl.value && !dropdownEl.value.contains(e.target)) {
    open.value = false
  }
}

watch(() => props.members, () => {
  checkedTagIds.value = new Set()
})

// Clear tag state if selection is manually edited while dropdown is closed
watch(() => props.selectedIds, () => {
  if (!open.value) {
    checkedTagIds.value = new Set()
    tagMode.value = 'any'
    // Clear the localStorage preference so it resets on next open
    const key = getStorageKey()
    if (key) localStorage.removeItem(key)
  }
})

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style scoped>
.select-by-tag-wrap {
  position: relative;
  display: inline-block;
}
</style>

<style>
/* Unscoped: this dropdown is teleported to <body>, outside this component's
   scoped-style DOM subtree, so scoped styles wouldn't apply to it. Class name
   is unique to this component to avoid colliding with MemberTagPicker's own
   teleported dropdown, which is also unscoped for the same reason. */
.select-by-tag-dropdown {
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

.select-by-tag-dropdown .dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.select-by-tag-dropdown .dropdown-item:hover { background: var(--bg); }

.select-by-tag-dropdown .tag-item input[type="checkbox"] {
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
.select-by-tag-dropdown .tag-item input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.select-by-tag-dropdown .tag-item input[type="checkbox"]:checked::after {
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

.select-by-tag-dropdown .dropdown-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-2);
}

.select-by-tag-dropdown .dropdown-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-2);
}

.select-by-tag-dropdown .header-text {
  white-space: nowrap;
}

.select-by-tag-dropdown .mode-pill {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  text-transform: capitalize;
  flex-shrink: 0;
}

.select-by-tag-dropdown .mode-pill:hover {
  background: var(--accent-h);
}
</style>
