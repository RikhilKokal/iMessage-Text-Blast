<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="panel">
      <div class="panel-header">
        <h2>Notifications</h2>
        <button class="btn-close" @click="$emit('close')" title="Close">×</button>
      </div>
      <div class="panel-body">
        <div class="notif-list">
          <div
            v-for="t in toasts"
            :key="t.id"
            class="notif-card"
            :class="t.type"
          >
            <div class="notif-icon">
              <span v-if="t.type === 'success'">✓</span>
              <span v-else-if="t.type === 'error'">✕</span>
              <span v-else>ℹ</span>
            </div>
            <div class="notif-body">
              <div class="notif-title">{{ t.title }}</div>
              <div v-if="t.message" class="notif-message">{{ t.message }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
defineProps({ toasts: { type: Array, required: true } })
const emit = defineEmits(['close'])
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
  z-index: 10001;
  backdrop-filter: blur(2px);
}

.panel {
  background: var(--surface);
  border-radius: 12px;
  width: min(480px, calc(100vw - 48px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.panel-header h2 { font-size: 15px; font-weight: 600; }

.btn-close {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--text-2);
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.btn-close:hover { background: var(--bg); color: var(--text); }

.panel-body {
  overflow-y: auto;
  flex: 1;
  padding: 12px 16px 16px;
}

.notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notif-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  border-left-width: 4px;
  background: var(--surface);
}
.notif-card.success { border-left-color: var(--success, #34c759); }
.notif-card.error   { border-left-color: var(--danger); }
.notif-card.info    { border-left-color: var(--accent); }

.notif-icon {
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}
.notif-card.success .notif-icon { color: var(--success, #34c759); }
.notif-card.error   .notif-icon { color: var(--danger); }
.notif-card.info    .notif-icon { color: var(--accent); }

.notif-body { flex: 1; min-width: 0; }

.notif-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

.notif-message {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 3px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
