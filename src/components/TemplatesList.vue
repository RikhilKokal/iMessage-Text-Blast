<template>
  <div class="templates-list">
    <div
      v-for="tmpl in templates"
      :key="tmpl.id"
      class="template-item"
      :class="{ active: tmpl.id === selectedTemplateId }"
      @click="$emit('select', tmpl.id)"
    >
      <div class="template-name">{{ tmpl.name }}</div>
    </div>
    <div v-if="templates.length === 0" class="empty">
      No templates yet. Click + to create one.
    </div>
  </div>
</template>

<script setup>
defineProps({
  templates: { type: Array, default: () => [] },
  selectedTemplateId: { type: Number, default: null },
})
defineEmits(['select'])
</script>

<style scoped>
.templates-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.template-item {
  padding: 8px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.template-item:hover { background: var(--bg); }
.template-item.active {
  background: var(--accent-tint);
  color: var(--accent);
}

.template-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty {
  padding: 16px 10px;
  font-size: 12px;
  color: var(--text-2);
  text-align: center;
}
</style>
