<template>
  <div class="preview-container">
    <div class="preview-label">
      Preview with
      <div class="chip-wrap" ref="chipWrap">
        <button class="contact-chip" @click="toggleOpen">
          {{ current.name }}
          <span class="chip-arrow">▾</span>
        </button>
        <div v-if="open" class="dropdown" :style="{ maxHeight: dropdownMaxH + 'px' }">
          <template v-if="contactGroups">
            <template v-for="g in contactGroups" :key="g.groupName">
              <div class="dropdown-heading">{{ g.groupName }}</div>
              <button
                v-for="c in g.contacts"
                :key="c.id"
                class="dropdown-item"
                :class="{ active: c.id === current.id }"
                @click="select(c)"
              >{{ c.name }}</button>
            </template>
          </template>
          <template v-else>
            <button
              v-for="c in flatContacts"
              :key="c.id"
              class="dropdown-item"
              :class="{ active: c.id === current.id }"
              @click="select(c)"
            >{{ c.name }}</button>
          </template>
        </div>
      </div>
    </div>
    <div class="preview-bubble">{{ renderedMessage }}</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  template:      { type: String, required: true },
  contacts:      { type: Array, required: true },
  contactGroups: { type: Array, default: null },
  // Array of { groupName: string, contacts: Contact[] }
  memberOverrides: { type: Map, default: () => new Map() },
  // Map of memberId → { firstName: "...", ... } (persistent contact-level overrides)
  messageOverrides: { type: Object, default: () => ({}) },
  // One-time message-level token overrides
  emptyDefaults: { type: Object, default: () => ({}) },
  // Default overrides for contacts with empty fields
})

const flatContacts = computed(() =>
  props.contactGroups
    ? props.contactGroups.flatMap(g => g.contacts)
    : props.contacts
)

const open        = ref(false)
const current     = ref(props.contacts[0])
const chipWrap    = ref(null)
const dropdownMaxH = ref(220)

watch(flatContacts, (contacts) => {
  if (!contacts.find(c => c.id === current.value?.id)) {
    current.value = contacts[0]
  }
})

function toggleOpen() {
  if (!open.value && chipWrap.value) {
    const rect = chipWrap.value.getBoundingClientRect()
    // Find the nearest scrollable ancestor to use as the clipping boundary
    let clipBottom = window.innerHeight
    let el = chipWrap.value.parentElement
    while (el) {
      const style = getComputedStyle(el)
      if (style.overflow === 'auto' || style.overflowY === 'auto' ||
          style.overflow === 'scroll' || style.overflowY === 'scroll') {
        clipBottom = el.getBoundingClientRect().bottom
        break
      }
      el = el.parentElement
    }
    dropdownMaxH.value = Math.max(80, clipBottom - rect.bottom - 32)
  }
  open.value = !open.value
}

function select(c) {
  current.value = c
  open.value = false
}

function onClickOutside(e) {
  if (chipWrap.value && !chipWrap.value.contains(e.target)) open.value = false
}
onMounted(()  => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))

function formatMemberList(names) {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1]
}

const renderedMessage = computed(() => {
  const c = current.value
  if (!c) return ''

  let firstName, lastName, fullName

  if (c.type === 'group_chat' && c.participants) {
    firstName = formatMemberList(c.participants.firstNames)
    lastName = formatMemberList(c.participants.lastNames)
    fullName = formatMemberList(c.participants.fullNames)
  } else {
    firstName = c.name?.split(' ')[0] ?? ''
    lastName = c.name?.split(' ').slice(1).join(' ') ?? ''
    fullName = c.name ?? ''
  }

  // Get persistent contact-level overrides from Map, then merge with one-time message overrides
  const persistentOverrides = props.memberOverrides.get(c.id) || {}
  const overrides = { ...persistentOverrides, ...props.messageOverrides }

  function resolveToken(tokenKey, contactValue, isFieldEmpty) {
    if (overrides[tokenKey] !== undefined) {
      return overrides[tokenKey]
    }
    if (isFieldEmpty && props.emptyDefaults[tokenKey] !== undefined) {
      return props.emptyDefaults[tokenKey]
    }
    return contactValue
  }

  const nicknameDefault = c.type === 'group_chat' ? (c.nickname || c.name || '') : (c.nickname || firstName)

  const tokens = {
    firstName: resolveToken('firstName', firstName, !firstName),
    lastName:  resolveToken('lastName', lastName, !lastName),
    fullName:  resolveToken('fullName', fullName, !fullName),
    email:     resolveToken('email', c.email || '(no email)', !c.email),
    phone:     resolveToken('phone', c.type === 'group_chat' ? '(group chat)' : (c.phone || '(no phone)'), !c.phone || c.type === 'group_chat'),
    company:   resolveToken('company', c.company || '(no company)', !c.company),
    nickname:  resolveToken('nickname', nicknameDefault, !nicknameDefault),
  }

  return props.template
    .replace(/⟦firstName⟧/g,  tokens.firstName)
    .replace(/⟦lastName⟧/g,   tokens.lastName)
    .replace(/⟦fullName⟧/g,   tokens.fullName)
    .replace(/⟦email⟧/g,      tokens.email)
    .replace(/⟦phone⟧/g,      tokens.phone)
    .replace(/⟦company⟧/g,    tokens.company)
    .replace(/⟦nickname⟧/g,   tokens.nickname)
})
</script>

<style scoped>
.preview-container {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  margin-top: 12px;
}

.preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.chip-wrap {
  position: relative;
  display: inline-block;
}

.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px 2px 10px;
  background: var(--accent-tint);
  color: var(--accent-tint-text);
  border: 1px solid var(--accent-tint-border);
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font);
  letter-spacing: 0.03em;
  text-transform: none;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.contact-chip:hover {
  background: #cce2ff;
  border-color: var(--accent-tint-text);
}

.chip-arrow {
  font-size: 16px;
  opacity: 0.7;
  position: relative;
  top: -1px;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  z-index: 100;
}

.dropdown-heading {
  padding: 6px 12px 2px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  pointer-events: none;
  border-top: 1px solid var(--border);
}
.dropdown-heading:first-child { border-top: none; }

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--font);
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.dropdown-item:hover  { background: var(--bg); }
.dropdown-item.active { background: var(--accent-tint); color: var(--accent-tint-text); font-weight: 600; }

.preview-bubble {
  background: var(--surface);
  border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
