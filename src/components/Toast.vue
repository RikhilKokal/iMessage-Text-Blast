<template>
  <Transition name="toast">
    <div v-if="visible" class="toast" :class="[type, { 'toast--stacked': stacked }]" role="alert">
      <div class="toast-icon">
        <span v-if="type === 'success'">✓</span>
        <span v-else-if="type === 'error'">✕</span>
        <span v-else>ℹ</span>
      </div>
      <div class="toast-body">
        <div class="toast-title">{{ title }}</div>
        <div v-if="message" class="toast-message">{{ message }}</div>
      </div>
      <button class="toast-close" @click="$emit('close')" aria-label="Dismiss">×</button>
    </div>
  </Transition>
</template>

<script setup>
import { watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  visible:   { type: Boolean, default: false },
  title:     { type: String,  required: true },
  message:   { type: String,  default: '' },
  type:      { type: String,  default: 'info' }, // 'success' | 'error' | 'info'
  duration:  { type: Number,  default: 4000 },   // 0 = stay until closed
  stacked:   { type: Boolean, default: false },   // true = positioning handled by parent
})
const emit = defineEmits(['close'])

let interval   = null
let remaining  = 0
const TICK     = 100

function isVisible() {
  return !document.hidden && document.hasFocus()
}

function startCountdown() {
  clearInterval(interval)
  if (!props.visible || props.duration <= 0) return
  remaining = props.duration
  interval = setInterval(() => {
    if (isVisible()) {
      remaining -= TICK
      if (remaining <= 0) {
        clearInterval(interval)
        emit('close')
      }
    }
  }, TICK)
}

function stopCountdown() {
  clearInterval(interval)
  interval = null
}

watch(() => props.visible, (v) => {
  if (v) startCountdown()
  else stopCountdown()
})

onMounted(() => {
  if (props.visible) startCountdown()
  window.addEventListener('focus', () => { /* interval already ticking, isVisible() now true */ })
  window.addEventListener('blur',  () => { /* interval keeps ticking but isVisible() returns false */ })
})

onUnmounted(stopCountdown)
</script>

<style scoped>
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  max-width: 380px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
}

/* Transition */
.toast-enter-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.toast-leave-active { transition: transform 0.2s ease,  opacity 0.2s ease; }
.toast-enter-from, .toast-leave-to { transform: translateX(110%); opacity: 0; }

/* Type accents */
.toast.success { border-left: 4px solid var(--success, #34c759); }
.toast.error   { border-left: 4px solid var(--danger); }
.toast.info    { border-left: 4px solid var(--accent); }

.toast-icon {
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}
.toast.success .toast-icon { color: var(--success); }
.toast.error   .toast-icon { color: var(--danger); }
.toast.info    .toast-icon { color: var(--accent); }

.toast-body { flex: 1; min-width: 0; }

.toast-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

.toast-message {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 3px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-2);
  font-size: 18px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: -2px;
}
.toast-close:hover { color: var(--text); background: none; }

/* Stacked mode: parent container handles positioning */
.toast--stacked {
  position: relative;
  bottom: auto;
  right: auto;
  z-index: auto;
}
</style>
