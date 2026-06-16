<template>
  <div class="overlay" @click.self="cancel">
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Update Scheduled Texts?</h2>
        <button class="btn-close" @click="cancel">×</button>
      </div>

      <p class="body-text">
        <strong>{{ contactName }}</strong> was {{ action === 'add' ? 'added to' : 'removed from' }} this group.
        Do you also want to {{ action === 'add' ? 'add them to' : 'remove them from' }} the
        {{ sendsLabel }}
        for this group?
      </p>

      <div v-if="sends.length > 1" class="sends-list">
        <div v-for="s in sends" :key="s.id" class="send-row">
          {{ scheduleLabel(s) }}
        </div>
      </div>
      <div v-else class="send-single">{{ scheduleLabel(sends[0]) }}</div>

      <p class="hint">
        You can always adjust recipients for individual scheduled texts in the
        <strong>Scheduled Texts</strong> area.
      </p>

      <label class="save-choice-label">
        <input type="checkbox" v-model="saveChoice" />
        <span>Remember my choice and don't ask again</span>
      </label>

      <div class="actions">
        <button @click="cancel">No</button>
        <button class="btn-primary" @click="confirm">Yes</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  contactName: { type: String, required: true },
  action:      { type: String, required: true }, // 'add' | 'remove'
  sends:       { type: Array,  required: true },
})
const emit = defineEmits(['confirm', 'cancel'])

const saveChoice = ref(false)

const sendsLabel = computed(() => {
  if (props.sends.length > 1) {
    const hasRecurring = props.sends.some(s => s.schedule_type === 'recurring')
    const hasOnce      = props.sends.some(s => s.schedule_type === 'once')
    if (hasRecurring && hasOnce) return `${props.sends.length} scheduled texts`
    if (hasRecurring)            return `${props.sends.length} recurring scheduled texts`
    return `${props.sends.length} scheduled texts`
  }
  const s = props.sends[0]
  return s.schedule_type === 'recurring' ? 'recurring scheduled text' : 'scheduled text'
})

function scheduleLabel(s) {
  if (s.schedule_type === 'once') {
    const d = s.next_run ? new Date(s.next_run).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
    return d ? `One-time send on ${d}` : 'One-time send'
  }
  const interval = s.schedule_interval
  if (!interval) return 'Recurring'
  try {
    const d = JSON.parse(interval)
    if (d.interval === 'daily')   return `Daily at ${d.time}`
    if (d.interval === 'weekly')  return `Weekly on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.weekday]} at ${d.time}`
    if (d.interval === 'monthly') return `Monthly on the ${d.monthDay} at ${d.time}`
  } catch {}
  return 'Recurring'
}

function confirm() { emit('confirm', saveChoice.value) }
function cancel()  { emit('cancel',  saveChoice.value) }
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}

.modal {
  background: var(--surface);
  border-radius: 12px;
  width: min(400px, calc(100vw - 48px));
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-header h2 { font-size: 16px; font-weight: 700; }

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

.body-text { font-size: 14px; line-height: 1.5; color: var(--text); }

.sends-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 12px;
}
.send-row { font-size: 13px; color: var(--text-2); }

.send-single {
  font-size: 13px;
  color: var(--text-2);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 12px;
}

.hint {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}

.save-choice-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.save-choice-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.actions button { padding: 8px 20px; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover { background: var(--accent-hover); }
</style>
