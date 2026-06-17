<template>
  <div class="overlay" @click.self="$emit('dismiss')">
    <div class="dialog">
      <div class="dialog-icon">⚠️</div>
      <h2 class="dialog-title">Attachment Missing</h2>

      <p v-if="error.hasText" class="dialog-body">
        The image{{ error.missingCount > 1 ? 's' : '' }} attached to the scheduled message for
        <strong>{{ error.groupName }}</strong> could not be found and {{ error.missingCount > 1 ? 'were' : 'was' }} not sent.
        Would you like to send the text message without the image, or cancel?
      </p>
      <p v-else class="dialog-body">
        The image{{ error.missingCount > 1 ? 's' : '' }} attached to the scheduled message for
        <strong>{{ error.groupName }}</strong> could not be found. The message was not sent.
      </p>

      <div class="dialog-actions">
        <button v-if="error.hasText" class="btn-primary" :disabled="sending" @click="handleSendText(error.scheduledSendId)">
          {{ sending ? 'Sending…' : 'Send Text Only' }}
        </button>
        <button class="btn-secondary" @click="$emit('dismiss')">
          {{ error.hasText ? 'Cancel Send' : 'OK' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
defineProps({ error: { type: Object, required: true } })
const emit = defineEmits(['send-text', 'dismiss'])
const sending = ref(false)
function handleSendText(id) {
  if (sending.value) return
  sending.value = true
  emit('send-text', id)
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
  backdrop-filter: blur(2px);
}

.dialog {
  background: var(--surface);
  border-radius: 12px;
  border-top: 4px solid var(--danger);
  width: min(400px, calc(100vw - 48px));
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  gap: 12px;
}

.dialog-icon { font-size: 44px; line-height: 1; }

.dialog-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--danger);
}

.dialog-body {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.6;
  max-width: 340px;
}

.dialog-body strong { color: var(--text); font-weight: 600; }

.dialog-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  justify-content: center;
}

.btn-primary {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font);
}
.btn-primary:hover { background: var(--accent-h); }

.btn-secondary {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font);
}
.btn-secondary:hover { background: var(--bg); }
</style>
