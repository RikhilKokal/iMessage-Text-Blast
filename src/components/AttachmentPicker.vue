<template>
  <div class="attachment-row">
    <button
      v-if="modelValue.length < maxAttachments"
      class="btn-attach"
      @click="pick"
      title="Attach files (max 8)"
    >📎 Attach File</button>
    <div class="attachment-chips">
      <div v-for="(p, i) in modelValue" :key="p" class="attachment-chip">
        <span class="attachment-name">{{ p.split('/').pop() }}</span>
        <button class="attachment-remove" @click="remove(i)" title="Remove">×</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'

const props = defineProps({
  modelValue:     { type: Array,  required: true },
  maxAttachments: { type: Number, default: 8 },
})
const emit = defineEmits(['update:modelValue'])

const showToast = inject('addToast', () => {})

async function pick() {
  const remaining = props.maxAttachments - props.modelValue.length
  if (remaining <= 0) return
  const filePaths = await window.api.openAttachmentDialog(props.maxAttachments)
  if (!filePaths?.length) return
  const combined = [...props.modelValue, ...filePaths]
  if (combined.length > props.maxAttachments) {
    showToast(`Max ${props.maxAttachments} files`, `Only the first ${props.maxAttachments} selected files were added.`, 'error', 4000)
  }
  emit('update:modelValue', combined.slice(0, props.maxAttachments))
}

function remove(index) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<style src="../styles/message-panel.css"></style>
