<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
      <div class="icon">⚠️</div>
      <h2 id="dlg-title">Delete Group?</h2>
      <p>You're about to permanently delete "<strong>{{ groupName }}</strong>". This action cannot be undone.</p>
      <div class="buttons">
        <button @click="$emit('close')">Cancel</button>
        <button class="btn-danger" @click="$emit('confirm')">Delete</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
defineProps({ groupName: String })
const emit = defineEmits(['confirm', 'close'])
function onKeydown(e) { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.dialog {
  background: var(--surface);
  border-radius: 12px;
  border-top: 4px solid var(--danger);
  padding: 32px 28px;
  width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon { font-size: 44px; line-height: 1; }

h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--danger);
  margin: 0;
}

p {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.6;
  margin: 0;
}
p strong { color: var(--text); font-weight: 600; }

.buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 8px;
}
.buttons button { padding: 8px 22px; }
</style>
