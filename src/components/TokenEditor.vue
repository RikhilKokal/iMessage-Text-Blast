<template>
  <div
    ref="editorEl"
    class="token-editor"
    :data-placeholder="placeholder"
    contenteditable="true"
    @input="onInput"
    @keydown="onKeydown"
    @paste="onPaste"
    @blur="onEditorBlur"
    @beforeinput="onBeforeInput"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
  ></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  tokens: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue'])

const editorEl = ref(null)
let _isSelecting = false
let _selectionStart = null
let _selectionStartRange = null
let _hasMoved = false

function label(key) {
  return props.tokens[key] ?? key
}

function makeChip(key) {
  const span = document.createElement('span')
  span.className = 'token-chip'
  span.dataset.key = key
  span.contentEditable = 'false'
  span.textContent = label(key)
  return span
}

function serialize() {
  const el = editorEl.value
  if (!el) return ''
  return serializeChildren(el)
}

function serializeChildren(el) {
  let result = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('token-chip') && node.dataset.key) {
        result += `{{${node.dataset.key}}}`
      } else if (node.tagName === 'BR') {
        result += '\n'
      } else if (node.tagName === 'DIV') {
        result += '\n' + serializeChildren(node)
      } else {
        result += serializeChildren(node)
      }
    }
  }
  return result
}

function render(text) {
  const el = editorEl.value
  if (!el) return
  if (serialize() === text) return

  el.innerHTML = ''
  const parts = text.split(/({{[^}]+}})/)
  for (const part of parts) {
    const m = part.match(/^{{([^}]+)}}$/)
    if (m) {
      el.appendChild(makeChip(m[1]))
    } else if (part) {
      const lines = part.split('\n')
      lines.forEach((line, i) => {
        if (i > 0) el.appendChild(document.createElement('br'))
        if (line) el.appendChild(document.createTextNode(line))
      })
    }
  }
}

function onInput() {
  // Prevent editing inside tokens
  preventTokenEdits()
  emit('update:modelValue', serialize())
}

function preventTokenEdits() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return

  const range = sel.getRangeAt(0)
  let node = range.startContainer

  // Check if cursor is inside a token
  while (node && node !== editorEl.value) {
    if (node.classList?.contains('token-chip')) {
      // Move cursor after the token
      const afterToken = document.createRange()
      afterToken.setStartAfter(node)
      afterToken.collapse(true)
      sel.removeAllRanges()
      sel.addRange(afterToken)
      return
    }
    node = node.parentNode
  }
}

function onBeforeInput(e) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return

  let node = sel.getRangeAt(0).startContainer

  // Check if cursor is inside a token
  while (node && node !== editorEl.value) {
    if (node.classList?.contains('token-chip')) {
      // Block the input and move cursor after the token
      e.preventDefault()
      const afterToken = document.createRange()
      afterToken.setStartAfter(node)
      afterToken.collapse(true)
      sel.removeAllRanges()
      sel.addRange(afterToken)
      return
    }
    node = node.parentNode
  }
}

function onMouseDown(e) {
  e.preventDefault()
  _isSelecting = true
  _selectionStart = e
  _selectionStartRange = document.caretRangeFromPoint(e.clientX, e.clientY)
  _hasMoved = false
}

function onMouseMove(e) {
  // Only mark as moved if mouse traveled more than 5 pixels
  const dx = e.clientX - _selectionStart.clientX
  const dy = e.clientY - _selectionStart.clientY
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  if (distance > 5) {
    _hasMoved = true
  }
  
  if (!_isSelecting || !_selectionStart || !_hasMoved) return

  const el = editorEl.value
  const range = document.caretRangeFromPoint(e.clientX, e.clientY)
  const startRange = _selectionStartRange

  if (!range || !el.contains(range.startContainer)) return
  if (!startRange || !el.contains(startRange.startContainer)) return

  const sel = window.getSelection()

  // Create a range from start to current position
  const newRange = document.createRange()

  // Determine which position comes first
  const comparison = startRange.compareBoundaryPoints(Range.START_TO_START, range)

  if (comparison <= 0) {
    newRange.setStart(startRange.startContainer, startRange.startOffset)
    newRange.setEnd(range.startContainer, range.startOffset)
  } else {
    newRange.setStart(range.startContainer, range.startOffset)
    newRange.setEnd(startRange.startContainer, startRange.startOffset)
  }

  sel.removeAllRanges()
  sel.addRange(newRange)
}

function onMouseUp(e) {
  if (!_hasMoved && _selectionStart) {
    // Single click - check if it's on a token
    const el = editorEl.value
    if (el) {
      el.focus()
      
      // Check if click was on a token
      let clickedToken = e.target.closest('.token-chip')
      if (clickedToken && el.contains(clickedToken)) {
        // Select the entire token element (not just contents)
        const sel = window.getSelection()
        const range = document.createRange()
        range.selectNode(clickedToken)
        sel.removeAllRanges()
        sel.addRange(range)
      } else {
        // Regular click - place cursor at position
        const range = document.caretRangeFromPoint(e.clientX, e.clientY)
        if (range && el.contains(range.startContainer)) {
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }
  }
  _isSelecting = false
  _selectionStart = null
  _selectionStartRange = null
  _hasMoved = false
}

function onKeydown(e) {
  // Prevent typing inside tokens
  const sel = window.getSelection()
  if (sel && sel.rangeCount) {
    let node = sel.getRangeAt(0).startContainer
    while (node && node !== editorEl.value) {
      if (node.classList?.contains('token-chip')) {
        // Move cursor after the token before processing the key
        const afterToken = document.createRange()
        afterToken.setStartAfter(node)
        afterToken.collapse(true)
        sel.removeAllRanges()
        sel.addRange(afterToken)
        break
      }
      node = node.parentNode
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    document.execCommand('insertLineBreak')
    return
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return

    const { startContainer: node, startOffset: offset } = sel.getRangeAt(0)
    let chip = null

    if (e.key === 'Backspace') {
      if (node.nodeType === Node.TEXT_NODE && offset === 0)
        chip = node.previousSibling?.classList?.contains('token-chip') ? node.previousSibling : null
      else if (node.nodeType === Node.ELEMENT_NODE)
        chip = node.childNodes[offset - 1]?.classList?.contains('token-chip') ? node.childNodes[offset - 1] : null
    } else {
      if (node.nodeType === Node.TEXT_NODE && offset === node.textContent.length)
        chip = node.nextSibling?.classList?.contains('token-chip') ? node.nextSibling : null
      else if (node.nodeType === Node.ELEMENT_NODE)
        chip = node.childNodes[offset]?.classList?.contains('token-chip') ? node.childNodes[offset] : null
    }

    if (chip) {
      e.preventDefault()
      chip.remove()
      emit('update:modelValue', serialize())
    }
  }
}

function onPaste(e) {
  e.preventDefault()
  const text = e.clipboardData.getData('text/plain')
  document.execCommand('insertText', false, text)
}

// ── Chip selection highlight ───────────────────────────────────────────────
function onSelectionChange() {
  const el = editorEl.value
  if (!el) return
  el.querySelectorAll('.token-chip.chip-selected').forEach(c => c.classList.remove('chip-selected'))
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  el.querySelectorAll('.token-chip').forEach(chip => {
    if (range.intersectsNode(chip)) chip.classList.add('chip-selected')
  })
}

onMounted(() => {
  if (props.modelValue) render(props.modelValue)
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  document.removeEventListener('mouseup', onMouseUp)
})

watch(() => props.modelValue, (val) => {
  if (serialize() !== val) render(val)
})

// Save selection when editor loses focus (e.g. user clicks an insert button)
// so insertChip can restore it and insert at the right position.
let _savedRange = null

function onEditorBlur() {
  const el = editorEl.value
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    _savedRange = sel.getRangeAt(0).cloneRange()
  } else {
    _savedRange = null
  }
}

function insertChip(key) {
  const el = editorEl.value
  if (!el) return

  const chip = makeChip(key)
  const sel = window.getSelection()

  // Restore the selection the editor had before losing focus
  const range = _savedRange ?? (sel?.rangeCount > 0 ? sel.getRangeAt(0) : null)

  el.focus()

  if (range && el.contains(range.commonAncestorContainer)) {
    range.deleteContents()
    range.insertNode(chip)
    const cur = document.createRange()
    cur.setStartAfter(chip)
    cur.collapse(true)
    sel.removeAllRanges()
    sel.addRange(cur)
  } else {
    el.appendChild(chip)
  }

  _savedRange = null
  emit('update:modelValue', serialize())
}

defineExpose({ insertChip })
</script>

<style scoped>
.token-editor {
  display: block;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid var(--border);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.8;
  min-height: 110px;
  outline: none;
  background: var(--surface);
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  box-sizing: border-box;
  caret-color: var(--text);
}
.token-editor:focus { background: var(--surface); }
.token-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--text-2);
  pointer-events: none;
  font-style: italic;
}
</style>

<style>
.token-chip {
  display: inline;
  background: var(--accent-tint);
  color: var(--accent-tint-text);
  border: 1px solid var(--accent-tint-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: default;
  user-select: text;
  white-space: nowrap;
}
.token-chip::selection {
  background: transparent;
  color: var(--accent-tint-text);
}
.token-chip *::selection {
  background: transparent;
  color: var(--accent-tint-text);
}
.token-chip.chip-selected {
  border-color: var(--accent-tint-text);
  background: #cce0ff;
}
</style>