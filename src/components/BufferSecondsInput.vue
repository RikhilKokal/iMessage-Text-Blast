<template>
  <input
    type="text"
    inputmode="numeric"
    class="buffer-input"
    :disabled="disabled"
    :value="focused ? draft : modelValue"
    @focus="onFocus"
    @keydown="onKeydown"
    @blur="onBlur"
    @click.stop
  />
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 5 },
  disabled:   { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const focused = ref(false)
const draft   = ref('')

const MIN = 1
const MAX = 60

function onFocus(e) {
  focused.value = true
  draft.value = String(props.modelValue)
  e.target.select()
}

function onKeydown(e) {
  if (e.key === 'Backspace') {
    e.preventDefault()
    draft.value = draft.value.slice(0, -1)
    e.target.value = draft.value
    return
  }
  if (['Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) return
  if (!/^\d$/.test(e.key)) { e.preventDefault(); return }
  e.preventDefault()

  const next = draft.value + e.key

  if (next.length === 1) {
    if (e.key === '0') { e.target.value = draft.value; return }
    draft.value = next
  } else {
    const n = parseInt(next)
    if (n > MAX) { e.target.value = draft.value; return }
    draft.value = next
    emit('update:modelValue', n)
  }

  e.target.value = draft.value
}

function onBlur() {
  focused.value = false
  const n = parseInt(draft.value)
  if (!isNaN(n) && n >= MIN && n <= MAX) {
    emit('update:modelValue', n)
  }
  // If draft is empty or invalid, revert to the current modelValue (no change)
  draft.value = ''
}
</script>
