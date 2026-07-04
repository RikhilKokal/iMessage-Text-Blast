<template>
  <div class="panel-overlay" @click.self="$emit('close')">
    <div class="panel">
      <div class="panel-header">
        <h2>Permissions</h2>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <p class="panel-subtitle">Manage optional permissions. Required permissions (AppleScript, Contacts) cannot be revoked here.</p>

      <div class="perm-list">

        <!-- Full Disk Access -->
        <div class="perm-row">
          <div class="perm-info">
            <div class="perm-name-row">
              <span class="perm-name">Full Disk Access</span>
              <span class="perm-status" :class="fda ? 'status-on' : 'status-off'">
                {{ fda ? 'Granted' : 'Not granted' }}
              </span>
            </div>
            <p class="perm-desc">Reads your Messages database to detect whether each contact uses iMessage or SMS, enabling automatic fallback.</p>
            <p class="perm-note">Managed in System Settings — macOS does not allow apps to change this directly.</p>
          </div>
          <button
            class="toggle-switch"
            :class="{ on: fda }"
            @click="handleFda"
          ><span class="toggle-knob"></span></button>
        </div>

        <!-- Mac Notifications -->
        <div class="perm-row">
          <div class="perm-info">
            <div class="perm-name-row">
              <span class="perm-name">Mac Notifications</span>
              <span class="perm-status" :class="macNotifs ? 'status-on' : 'status-off'">
                {{ macNotifs ? 'Enabled' : 'Disabled' }}
              </span>
            </div>
            <p class="perm-desc">Alerts you when a scheduled or buffered send finishes delivering.</p>
          </div>
          <button
            class="toggle-switch"
            :class="{ on: macNotifs }"
            @click="handleNotifs"
          ><span class="toggle-knob"></span></button>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({ macNotifs: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'fda-changed', 'notifs-changed'])

async function handleNotifs() {
  if (!props.macNotifs) {
    emit('notifs-changed', true)
    await window.api.sendTestNotification()
  } else {
    emit('notifs-changed', false)
  }
}

const fda = ref(false)

async function handleFda() {
  await window.api.openFdaSettings()
}

async function recheckFda() {
  const result = await window.api.checkFda()
  const prev = fda.value
  fda.value = result.granted
  if (fda.value !== prev) emit('fda-changed', fda.value)
}

onMounted(async () => {
  const result = await window.api.checkFda()
  fda.value = result.granted
})
</script>

<style src="../styles/toggle-switch.css"></style>

<style scoped>
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
  backdrop-filter: blur(2px);
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 480px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}

.panel-header h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

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

.panel-subtitle {
  font-size: 12px;
  color: var(--text-2);
  padding: 12px 22px 4px;
  margin: 0;
  line-height: 1.5;
}

.perm-list {
  display: flex;
  flex-direction: column;
  padding: 8px 0 8px;
}

.perm-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border);
}
.perm-row:last-child { border-bottom: none; }

.perm-info { flex: 1; min-width: 0; }

.perm-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.perm-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.perm-status {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 20px;
}
.status-on  { background: rgba(52,199,89,0.15); color: #1a7a38; }
.status-off { background: var(--bg); color: var(--text-2); border: 1px solid var(--border); }

.perm-desc {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
  margin: 0 0 4px;
}

.perm-note {
  font-size: 11px;
  color: var(--text-2);
  opacity: 0.65;
  margin: 0;
  line-height: 1.4;
}

</style>
