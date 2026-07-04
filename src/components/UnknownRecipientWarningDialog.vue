<template>
  <div v-if="warning" class="overlay" @click.self="$emit('cancel')">
    <div class="unknown-warning-box">
      <h3>Messaging app unknown for some recipients</h3>
      <p>
        No message history found for <strong>{{ warning.names.join(', ') }}</strong>, so we can't tell if they use iMessage or SMS.
      </p>
      <p>
        If you know, you can set it using the "Unknown" label next to their name.
        <template v-if="hasFda">If not, don't worry. The message will still deliver, though you may see a brief error notification while it sends.</template>
        <template v-else>If you don't set it, the message may not deliver if the recipient uses SMS rather than iMessage. You can also turn on Full Disk Access in Permissions, which will ensure that the message delivers.</template>
      </p>
      <div class="unknown-warning-actions">
        <button @click="$emit('cancel')">Go Back</button>
        <button class="btn-primary" @click="$emit('confirm')">Send Anyway</button>
      </div>
      <div class="unknown-warning-never" @click="$emit('update:neverCheck', !neverCheck)">
        <span class="round-check" :class="{ checked: neverCheck }"></span>
        <span>Don't show again</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  warning: { type: Object, default: null },
  hasFda: { type: Boolean, default: true },
  neverCheck: { type: Boolean, default: false },
})
defineEmits(['cancel', 'confirm', 'update:neverCheck'])
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

.unknown-warning-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px 28px 20px;
  max-width: 420px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.unknown-warning-box h3 { font-size: 16px; font-weight: 700; margin: 0; }
.unknown-warning-box p  { font-size: 13px; line-height: 1.55; margin: 0; color: var(--text); }
.unknown-warning-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.unknown-warning-actions button { padding: 8px 18px; }
.unknown-warning-never {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}
</style>
