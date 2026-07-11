<template>
  <div class="tag-list-wrap" ref="tagListWrapEl" :style="{ maxWidth: maxWidth + 'px' }">
    <!-- Hidden measuring pass: identical pill markup, invisible, used only to
         read each pill's natural rendered width so we know how many fit. -->
    <div class="measure-row" aria-hidden="true">
      <span
        v-for="(t, i) in member.tags"
        :key="'measure-' + t.id"
        :ref="el => setMeasureRef(i, el)"
        class="btn-service unknown tag-pill"
      >{{ t.name }}<button class="tag-remove">×</button></span>
    </div>

    <div class="visible-tags">
      <span v-for="t in visibleTags" :key="t.id" class="btn-service unknown tag-pill">
        {{ t.name }}<button class="tag-remove" title="Remove tag" @click.stop="remove(t.id)">×</button>
      </span>
      <button
        v-if="overflowTags.length > 0"
        ref="overflowBtn"
        class="btn-service unknown overflow-pill"
        @click="toggleOverflow"
      >+{{ overflowTags.length }} other{{ overflowTags.length === 1 ? '' : 's' }}</button>
    </div>

    <Teleport to="body">
      <div
        v-if="overflowOpen"
        ref="overflowDropdown"
        class="tag-overflow-dropdown"
        :style="{ top: dropdownTop + 'px', left: dropdownLeft + 'px', maxHeight: dropdownMaxH + 'px' }"
      >
        <div v-for="t in overflowTags" :key="t.id" class="overflow-tag-row">
          {{ t.name }}
          <button class="tag-remove" title="Remove tag" @click.stop="remove(t.id)">×</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  member: { type: Object, required: true },
  maxWidth: { type: Number, default: 200 },
})
const emit = defineEmits(['removed'])

const measureEls = ref([])
function setMeasureRef(i, el) { measureEls.value[i] = el }

const tagListWrapEl = ref(null)
const cutoffCount = ref(props.member.tags.length)

async function recomputeCutoff() {
  await nextTick()
  await nextTick() // Extra tick to ensure flex layout has settled
  const tags = props.member.tags
  const GAP = 4
  if (tags.length === 0) { cutoffCount.value = 0; return }

  // Use actual rendered width (accounts for parent flex compression from sibling elements)
  let availableWidth = tagListWrapEl.value?.getBoundingClientRect().width ?? 0
  if (availableWidth <= 0) availableWidth = props.maxWidth

  // Does everything fit without needing an overflow pill at all?
  let totalAll = 0
  for (let i = 0; i < tags.length; i++) {
    const el = measureEls.value[i]
    if (!el) { cutoffCount.value = tags.length; return } // not measured yet — show all as a safe fallback
    totalAll += (i > 0 ? GAP : 0) + el.getBoundingClientRect().width
  }
  if (totalAll <= availableWidth) {
    cutoffCount.value = tags.length
    return
  }

  // Doesn't fit — reserve room for the "+N others" pill, then find how many
  // pills fit before it (always at least 1, so a lone long tag still shows).
  const OVERFLOW_PILL_WIDTH = 60
  const budget = availableWidth - OVERFLOW_PILL_WIDTH
  let total = 0
  let count = 0
  for (let i = 0; i < tags.length; i++) {
    const w = measureEls.value[i].getBoundingClientRect().width
    const next = total + (count > 0 ? GAP : 0) + w
    if (next > budget && count > 0) break
    total = next
    count++
  }
  cutoffCount.value = Math.max(1, Math.min(count, tags.length - 1))
}

watch(() => props.member.tags, () => {
  // Clear stale refs when tags change to prevent array index mismatch
  // (Vue's element recycling can leave measureEls with refs that don't correspond to current tags)
  measureEls.value = []
  recomputeCutoff()
}, { immediate: true, deep: true, flush: 'post' })

const visibleTags = computed(() => props.member.tags.slice(0, cutoffCount.value))
const overflowTags = computed(() => props.member.tags.slice(cutoffCount.value))

// If a removal (or anything else) empties the overflow list while the dropdown
// is open, close it — otherwise it keeps rendering as an empty floating box.
watch(overflowTags, (tags) => {
  if (tags.length === 0) overflowOpen.value = false
})

async function remove(tagId) {
  emit('removed', tagId)
}

// ── Overflow dropdown (same Teleport + real-measurement pattern as
// MemberTagPicker/SelectByTagDropdown, so it's immune to the small
// .members-list scroll box clipping it) ──────────────────────────────────
const overflowOpen = ref(false)
const overflowBtn = ref(null)
const overflowDropdown = ref(null)
const dropdownTop = ref(0)
const dropdownLeft = ref(0)
const dropdownMaxH = ref(260)

async function toggleOverflow() {
  if (overflowOpen.value) {
    overflowOpen.value = false
    return
  }
  if (!overflowBtn.value) { overflowOpen.value = true; return }

  const rect = overflowBtn.value.getBoundingClientRect()
  dropdownTop.value = rect.bottom + 4
  dropdownLeft.value = rect.left
  dropdownMaxH.value = Math.max(80, window.innerHeight - rect.bottom - 32)
  overflowOpen.value = true

  await nextTick()
  if (overflowDropdown.value) {
    const dRect = overflowDropdown.value.getBoundingClientRect()
    if (dRect.right > window.innerWidth) {
      dropdownLeft.value = Math.max(8, rect.right - dRect.width)
    }
  }
}

function onClickOutside(e) {
  if (overflowOpen.value &&
      overflowBtn.value && !overflowBtn.value.contains(e.target) &&
      overflowDropdown.value && !overflowDropdown.value.contains(e.target)) {
    overflowOpen.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<style scoped>
.tag-list-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.measure-row {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  gap: 4px;
  white-space: nowrap;
  top: 0;
  left: 0;
}

.visible-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
}

/* GroupDetail.vue's .btn-service/.unknown grey-pill look, self-contained here
   rather than relying on it — Vue's scoped CSS only reaches a child
   component's ROOT element, not elements nested inside a child's own
   template, so GroupDetail's scoped rules never actually apply to these. */
.tag-pill,
.overflow-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 20px;
  border: 1.5px solid var(--border);
  background: var(--bg);
  color: var(--text-2);
  transition: opacity 0.12s;
}
.tag-pill { cursor: default; }
.overflow-pill { cursor: pointer; }
.overflow-pill:hover { opacity: 0.75; }

.tag-remove {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 11px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  opacity: 0.6;
}
.tag-remove:hover { opacity: 1; }
</style>

<style>
/* Unscoped: teleported to <body>, outside this component's scoped-style DOM
   subtree. Unique class name to avoid colliding with the other teleported
   dropdowns (MemberTagPicker, SelectByTagDropdown). */
.tag-overflow-dropdown {
  position: fixed;
  min-width: 140px;
  max-width: 220px;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  padding: 6px;
}

.tag-overflow-dropdown .overflow-tag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--text);
  border-radius: 6px;
}
.tag-overflow-dropdown .overflow-tag-row:hover { background: var(--bg); }
</style>
