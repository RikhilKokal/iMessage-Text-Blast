<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="panel" :style="{ width: `min(${width}, calc(100vw - 48px))` }">
      <div class="panel-header">
        <h2>{{ title }}</h2>
        <div class="header-right">
          <slot name="header-actions" />
          <button class="btn-close" @click="$emit('close')" title="Close">×</button>
        </div>
      </div>
      <slot name="notices" />
      <div class="panel-body">
        <slot />
      </div>
    </div>
    <slot name="popups" />
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  width: { type: String, default: '620px' },
})
defineEmits(['close'])
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

.panel {
  background: var(--surface);
  border-radius: 12px;
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}
.panel-header h2 { font-size: 17px; font-weight: 700; }

.header-right { display: flex; align-items: center; gap: 10px; }

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

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
</style>
