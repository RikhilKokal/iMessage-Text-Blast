<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <h2 id="dialog-title">New Group</h2>
      <p class="hint">Give your group a clear name like "Sales Q2" or "Team Leads".</p>
      <input
        ref="inputEl"
        v-model="name"
        maxlength="60"
        placeholder="Group name"
        :class="{ 'input-error': error, 'at-limit': name.length >= 60 }"
        @keyup.enter="submit"
        @keyup.escape="$emit('close')"
      />
      <p class="char-counter" :class="{ 'at-limit': name.length >= 60 }">{{ name.length }}/60</p>
      <p v-if="error" class="error-msg">{{ error }}</p>
      <div class="actions">
        <button @click="$emit('close')">Cancel</button>
        <button class="btn-primary" :disabled="!name.trim()" @click="submit">Create</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  error: { type: String, default: '' },
})
const emit = defineEmits(['create', 'close'])
const name = ref('')
const inputEl = ref(null)

onMounted(() => inputEl.value?.focus())

function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('create', trimmed)
  // Don't clear the name — App.vue clears it only on success
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

.dialog {
  background: var(--surface);
  border-radius: 12px;
  padding: 28px;
  width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h2 { font-size: 18px; font-weight: 700; }
.hint { font-size: 12px; color: var(--text-2); margin-top: -4px; }

input { width: 100%; }
input.input-error { border-color: var(--error); }
input.at-limit { border-color: var(--error); }

.char-counter {
  font-size: 12px;
  color: var(--text-2);
  margin: 4px 0 0 0;
  padding: 0;
}
.char-counter.at-limit {
  color: var(--error);
}

.error-msg { font-size: 12px; color: var(--error); margin-top: -4px; }

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
