<template>
  <div class="contacts-list">
    <div class="list-header">
      <input
        v-model="search"
        class="search-input"
        placeholder="Search by name, phone, or email…"
      />
      <span class="contact-count">Total: {{ filtered.length }} contact{{ filtered.length !== 1 ? 's' : '' }}</span>
    </div>

    <div v-if="filtered.length === 0" class="empty-state">
      {{ contacts.length === 0 ? 'No contacts yet. Sync from macOS or import a CSV.' : 'No contacts match your search.' }}
    </div>

    <table v-else class="contacts-table">
      <thead>
        <tr>
          <th @click="sortBy('name')" class="sortable">
            Name {{ sortKey === 'name' ? (sortAsc ? '▲' : '▼') : '' }}
          </th>
          <th>Phone</th>
          <th @click="sortBy('source')" class="sortable">
            Source {{ sortKey === 'source' ? (sortAsc ? '▲' : '▼') : '' }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="contact in paginated" :key="contact.id">
          <td>{{ contact.name }}</td>
          <td>{{ contact.phone }}</td>
          <td>
            <span class="badge" :class="contact.source">{{ contact.source || 'manual' }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button @click="page--" :disabled="page === 1">‹ Prev</button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button @click="page++" :disabled="page === totalPages">Next ›</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  contacts: { type: Array, default: () => [] },
})

const PAGE_SIZE = 100
const search = ref('')
const page = ref(1)
const sortKey = ref('name')
const sortAsc = ref(true)

function sortBy(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
  page.value = 1
}

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  const list = q
    ? props.contacts.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.email?.toLowerCase().includes(q)
      )
    : [...props.contacts]

  list.sort((a, b) => {
    const av = (a[sortKey.value] || '').toLowerCase()
    const bv = (b[sortKey.value] || '').toLowerCase()
    return sortAsc.value ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))

const paginated = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filtered.value.slice(start, start + PAGE_SIZE)
})
</script>
