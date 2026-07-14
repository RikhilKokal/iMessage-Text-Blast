<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">Add Group Chat</h2>
        <button class="btn-close" @click="$emit('close')" title="Close">×</button>
      </div>

      <input
        ref="searchEl"
        v-model="search"
        placeholder="Search group chats…"
        class="search-input"
        @keyup.enter="filtered.length > 0 && $emit('add', filtered[0])"
      />

      <div class="list-wrap">
        <div v-if="loading" class="state-msg">Loading group chats…</div>
        <div v-else-if="available.length === 0" class="state-msg">
          {{ allChats.length === 0 ? 'No group chats found.' : 'All group chats already in this group.' }}
        </div>
        <div v-else-if="filtered.length === 0" class="state-msg">No group chats match "{{ search }}".</div>

        <div
          v-for="chat in filtered"
          :key="chat.chat_identifier"
          class="contact-row"
          @click="$emit('add', chat)"
        >
          <div class="avatar">👥</div>
          <div class="info">
            <div class="name">{{ chat.resolved_label }}</div>
            <div class="phone">{{ chat.participant_handles.length }} participants</div>
          </div>
          <span class="add-icon">+</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, markRaw } from 'vue'


const props = defineProps({
  existingChatIdentifiers: { type: Array, default: () => [] },
})
const emit = defineEmits(['add', 'close'])

const allChats = ref([])
const search = ref('')
const loading = ref(true)
const searchEl = ref(null)

function onKeydown(e) { if (e.key === 'Escape') emit('close') }
onMounted(async () => {
  // markRaw so this list (and its nested participant_handles arrays) stays a plain
  // object all the way through to ipcRenderer.invoke — emitting a reactive Proxy
  // there throws "object could not be cloned" since structured-clone can't handle it.
  allChats.value = markRaw(await window.api.getChatGroups())
  loading.value = false
  searchEl.value?.focus()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// Group chats not already in this group
const available = computed(() =>
  allChats.value.filter((c) => !props.existingChatIdentifiers.includes(c.chat_identifier))
)

// Filtered by search query — split into terms on comma/whitespace so multiple names
// can be searched in any order (e.g. "Tester, Test" matches the same chat as
// "Test, Tester"), matched against the chat's label plus every member's name/nickname
// (see search_terms in chatGroupsService.js), not just whichever label is displayed.
const filtered = computed(() => {
  const terms = search.value.toLowerCase().split(/[,\s]+/).map(t => t.trim()).filter(Boolean)
  if (!terms.length) return available.value
  return available.value.filter(c => {
    const haystack = [c.resolved_label, ...(c.search_terms || [])]
    return terms.every(term => haystack.some(entry => entry.toLowerCase().includes(term)))
  })
})
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
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.info { flex: 1; min-width: 0; }
.name  { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.phone { font-size: 11px; color: var(--text-2); margin-top: 1px; }

.add-icon {
  font-size: 18px;
  color: var(--accent);
  font-weight: 700;
  opacity: 0;
  transition: opacity 0.12s;
}
</style>
