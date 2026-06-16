<template>
  <div class="groups-list">
    <div
      v-for="group in groups"
      :key="group.id"
      class="group-item"
      :class="{ active: group.id === selectedGroupId }"
      @click="$emit('select', group.id)"
    >
      <div class="group-name">{{ group.name }}</div>
      <div class="group-count">{{ group.memberCount }} {{ group.memberCount === 1 ? 'member' : 'members' }}</div>
    </div>
    <div v-if="groups.length === 0" class="empty">
      No groups yet. Click + to create one.
    </div>
  </div>
</template>

<script setup>
defineProps({
  groups: { type: Array, default: () => [] },
  selectedGroupId: { type: Number, default: null },
})
defineEmits(['select'])
</script>

<style scoped>
.groups-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-item {
  padding: 10px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.group-item:hover { background: var(--bg); }
.group-item.active {
  background: var(--accent-tint);
  color: var(--accent);
}

.group-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group-count {
  font-size: 11px;
  color: var(--text-2);
  margin-top: 2px;
}
.group-item.active .group-count { color: var(--accent); opacity: 0.7; }

.empty {
  padding: 20px 10px;
  font-size: 12px;
  color: var(--text-2);
  text-align: center;
}
</style>
