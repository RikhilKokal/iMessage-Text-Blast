<template>
  <div class="token-override-editor">
    <div v-if="!hasAnyTokens" class="state-msg">No tokens to override</div>

    <div v-else class="override-list">
      <div
        v-for="token in availableTokens"
        :key="token.key"
        class="override-row"
      >
        <div class="token-info">
          <div class="token-label">⟦{{ token.label }}⟧</div>
          <div class="token-value">{{ currentValue(token.key) }}</div>
        </div>
        <input
          v-model="localOverrides[token.key]"
          type="text"
          :placeholder="`Override ${token.label}`"
          class="override-input"
        />
        <button
          v-if="localOverrides[token.key]"
          @click="clearOverride(token.key)"
          class="btn-clear"
          title="Clear override"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    contact: {
      type: Object,
      required: true,
    },
    isEmptyDefaults: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      localOverrides: {
        firstName: '',
        lastName: '',
        fullName: '',
        email: '',
        phone: '',
        company: '',
        nickname: '',
      },
      availableTokens: [
        { key: 'firstName', label: 'First Name' },
        { key: 'lastName', label: 'Last Name' },
        { key: 'fullName', label: 'Full Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'company', label: 'Company' },
        { key: 'nickname', label: 'Nickname' },
      ],
    }
  },
  computed: {
    hasAnyTokens() {
      return this.availableTokens.length > 0
    },
  },
  methods: {
    formatMemberList(names) {
      if (names.length === 0) return ''
      if (names.length === 1) return names[0]
      if (names.length === 2) return `${names[0]} and ${names[1]}`
      return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1]
    },
    currentValue(tokenKey) {
      const overridden = this.localOverrides[tokenKey]
      if (overridden !== undefined && overridden !== '') return overridden
      return this.getDefaultValue(tokenKey)
    },
    formatMemberList(names) {
      if (names.length === 0) return ''
      if (names.length === 1) return names[0]
      if (names.length === 2) return `${names[0]} and ${names[1]}`
      return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1]
    },
    getDefaultValue(tokenKey) {
      // When editing empty value defaults, show what the empty state looks like
      if (this.isEmptyDefaults) {
        switch (tokenKey) {
          case 'firstName':
            return '(no first name)'
          case 'lastName':
            return '(no last name)'
          case 'fullName':
            return '(no full name)'
          case 'email':
            return '(no email)'
          case 'phone':
            return '(no phone)'
          case 'company':
            return '(no company)'
          case 'nickname':
            return '(no nickname)'
          default:
            return ''
        }
      }

      const contact = this.contact
      if (contact.type === 'group_chat' && contact.participants) {
        switch (tokenKey) {
          case 'firstName':
            return this.formatMemberList(contact.participants.firstNames)
          case 'lastName':
            return this.formatMemberList(contact.participants.lastNames)
          case 'fullName':
            return this.formatMemberList(contact.participants.fullNames)
          case 'email':
            return '(no email)'
          case 'phone':
            return '(group chat)'
          case 'company':
            return '(no company)'
          case 'nickname':
            return contact.nickname || contact.name || ''
          default:
            return ''
        }
      }

      switch (tokenKey) {
        case 'firstName':
          return (contact.name || '').split(' ')[0]
        case 'lastName':
          return (contact.name || '').split(' ').slice(1).join(' ')
        case 'fullName':
          return contact.name || ''
        case 'email':
          return contact.email || '(no email)'
        case 'phone':
          return contact.phone || '(no phone)'
        case 'company':
          return contact.company || '(no company)'
        case 'nickname':
          return contact.nickname || (contact.name || '').split(' ')[0]
        default:
          return ''
      }
    },
    clearOverride(tokenKey) {
      this.localOverrides[tokenKey] = ''
    },
    getOverrides() {
      // Return only non-empty overrides
      const result = {}
      for (const token of this.availableTokens) {
        if (this.localOverrides[token.key]) {
          result[token.key] = this.localOverrides[token.key]
        }
      }
      return result
    },
    setOverrides(overrides = {}) {
      // Initialize all token keys, preserving saved values
      for (const token of this.availableTokens) {
        this.localOverrides[token.key] = overrides[token.key] || ''
      }
    },
  },
}
</script>

<style scoped>
.token-override-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state-msg {
  color: var(--text-muted);
  font-size: 13px;
  padding: 12px;
  text-align: center;
}

.override-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.override-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.token-info {
  display: flex;
  flex-direction: column;
  min-width: 120px;
  gap: 2px;
}

.token-label {
  font-weight: 500;
  font-family: 'Monaco', monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.token-value {
  font-size: 13px;
  color: var(--text-primary);
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: normal;
}

.override-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  background: var(--input-bg);
  color: var(--text-primary);
}

.override-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.1);
}

.btn-clear {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms ease;
}

.btn-clear:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
</style>
