<template>
  <div class="overlay" @click.self="close">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sched-title">
      <div class="modal-header">
        <h2 id="sched-title">Schedule Message</h2>
        <button class="btn-close" @click="close" title="Close">×</button>
      </div>

      <!-- Send Once / Recurring toggle -->
      <div class="type-toggle">
        <label class="type-option" :class="{ active: scheduleType === 'once' }">
          <input v-model="scheduleType" type="radio" value="once" />
          <span>Send Once</span>
        </label>
        <label class="type-option" :class="{ active: scheduleType === 'recurring' }">
          <input v-model="scheduleType" type="radio" value="recurring" />
          <span>Recurring</span>
        </label>
      </div>

      <!-- One-time: date + time -->
      <div v-if="scheduleType === 'once'" class="field">
        <DateTimePicker v-model="scheduledDateTime" @update:timeValid="v => timeValid = v" />
      </div>

      <!-- Recurring: interval + optional day + time of day -->
      <div v-if="scheduleType === 'recurring'" class="field-group">
        <div class="field">
          <label class="field-label">Repeat</label>
          <select v-model="recurringInterval" class="field-input">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div v-if="recurringInterval === 'weekly'" class="field">
          <label class="field-label">Day</label>
          <select v-model="weekday" class="field-input">
            <option :value="0">Sunday</option>
            <option :value="1">Monday</option>
            <option :value="2">Tuesday</option>
            <option :value="3">Wednesday</option>
            <option :value="4">Thursday</option>
            <option :value="5">Friday</option>
            <option :value="6">Saturday</option>
          </select>
        </div>
        <div v-if="recurringInterval === 'monthly'" class="field">
          <label class="field-label">Date</label>
          <select v-model="monthDay" class="field-input">
            <option v-for="d in 31" :key="d" :value="d">{{ ordinal(d) }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Time of Day</label>
          <input v-model="scheduledTime" type="time" class="field-input" />
        </div>
      </div>

      <p v-if="isPast" class="error-msg">Please choose a time in the future.</p>

      <!-- Buffer option -->
      <div class="field">
        <label class="field-label">Send Buffer</label>
        <div class="buffer-row" @click="useBuffer = !useBuffer">
          <span class="round-check" :class="{ checked: useBuffer }"></span>
          <span>Delay between messages</span>
          <BufferSecondsInput v-model="bufferSeconds" :disabled="!useBuffer" />
          <span>sec</span>
        </div>
      </div>

      <div class="actions">
        <button @click="close">Cancel</button>
        <button class="btn-primary" :disabled="!isValid" @click="submit">Schedule</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import DateTimePicker     from './DateTimePicker.vue'
import BufferSecondsInput from './BufferSecondsInput.vue'

const props = defineProps({
  initialUseBuffer:    { type: Boolean, default: false },
  initialBufferSeconds: { type: Number,  default: 5 },
})
const emit = defineEmits(['schedule', 'close', 'update-buffer'])

function close() {
  emit('update-buffer', { useBuffer: useBuffer.value, bufferSeconds: bufferSeconds.value })
  emit('close')
}

function onKeydown(e) { if (e.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const scheduleType      = ref('once')
const timeValid         = ref(true)
const scheduledDateTime = ref('')
const recurringInterval = ref('daily')
const scheduledTime     = ref('09:00')
const weekday           = ref(new Date().getDay())
const monthDay          = ref(new Date().getDate())
const useBuffer         = ref(props.initialUseBuffer)
const bufferSeconds     = ref(props.initialBufferSeconds)

function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const isPast = computed(() =>
  scheduleType.value === 'once' &&
  !!scheduledDateTime.value &&
  new Date(scheduledDateTime.value) <= new Date()
)

const isValid = computed(() => {
  if (scheduleType.value === 'recurring') return true
  return !!scheduledDateTime.value && !isPast.value && timeValid.value
})

function submit() {
  if (!isValid.value) return
  emit('update-buffer', { useBuffer: useBuffer.value, bufferSeconds: bufferSeconds.value })
  emit('schedule', {
    type:         scheduleType.value,
    dateTime:     scheduledDateTime.value,
    interval:     recurringInterval.value,
    time:         scheduledTime.value,
    weekday:      weekday.value,
    monthDay:     monthDay.value,
    delaySeconds: useBuffer.value ? Math.max(1, Math.min(60, bufferSeconds.value)) : 0,
  })
}
</script>

<style src="../styles/message-panel.css"></style>

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

.modal {
  background: var(--surface);
  border-radius: 12px;
  width: min(460px, calc(100vw - 48px));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-header h2 { font-size: 17px; font-weight: 700; }

.btn-close {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: var(--bg);
  color: var(--text-2);
  font-size: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-close:hover { background: var(--border); }

/* Toggle */
.type-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.type-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  transition: background 0.12s, color 0.12s;
  user-select: none;
}
.type-option input[type="radio"] { display: none; }
.type-option.active {
  background: var(--accent);
  color: #fff;
}
.type-option:not(.active):hover { background: var(--bg); }

/* Fields */
.field { display: flex; flex-direction: column; gap: 6px; }
.field-group { display: flex; gap: 16px; }
.field-group .field { flex: 1; }

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--font);
  font-size: 14px;
  outline: none;
  background: var(--surface);
  color: var(--text);
}
.field-input:focus { border-color: var(--accent); }

/* Hide native clock icon and block scroll picker on time inputs */
.field-input[type="time"]::-webkit-calendar-picker-indicator { display: none; }
.field-input[type="time"] { -webkit-appearance: none; }

.error-msg {
  font-size: 12px;
  color: var(--error-fg, #c0392b);
  margin: -8px 0 0;
}

.buffer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.actions button { padding: 8px 20px; }

</style>
