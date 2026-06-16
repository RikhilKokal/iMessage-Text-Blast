<template>
  <div class="dtp">

    <!-- ── Month / Year nav ───────────────────────────────────────── -->
    <div class="dtp-nav">
      <button type="button" class="nav-btn" @click="prevMonth">‹</button>
      <div class="nav-label">
        <select class="nav-select" v-model="viewMonth">
          <option v-for="(m, i) in MONTHS" :key="i" :value="i">{{ m }}</option>
        </select>
        <input
          class="nav-year"
          type="number"
          v-model.number="viewYear"
          min="2020" max="2099"
          @blur="clampViewYear"
        />
      </div>
      <button type="button" class="nav-btn" @click="nextMonth">›</button>
    </div>

    <!-- ── Day-of-week headers ────────────────────────────────────── -->
    <div class="dtp-grid">
      <div class="dow" v-for="d in DAYS" :key="d">{{ d }}</div>

      <!-- leading blanks -->
      <div class="blank" v-for="n in leadingBlanks" :key="'b'+n"></div>

      <!-- current-month days -->
      <button
        v-for="day in daysInMonth"
        :key="'c'+day"
        type="button"
        class="day-btn"
        :class="{
          selected: isSelected(day, viewYear, viewMonth),
          today:    isToday(day),
          past:     isPastDay(day, viewYear, viewMonth),
        }"
        :disabled="isPastDay(day, viewYear, viewMonth)"
        @click="selectDay(day, viewYear, viewMonth)"
      >{{ day }}</button>

      <!-- trailing next-month days -->
      <button
        v-for="day in trailingDays"
        :key="'t'+day"
        type="button"
        class="day-btn trailing"
        :disabled="true"
      >{{ day }}</button>
    </div>

    <!-- ── Time picker ────────────────────────────────────────────── -->
    <div class="dtp-time">
      <div class="time-col">
        <span class="time-label">Hours</span>
        <input
          class="time-input"
          type="text"
          :value="displayHour"
          @input="e => setHour(e.target.value)"
          @focus="e => e.target.select()"
          maxlength="2"
        />
      </div>
      <span class="time-sep">:</span>
      <div class="time-col">
        <span class="time-label">Minutes</span>
        <input
          class="time-input"
          type="text"
          :value="pad(minute)"
          @input="e => setMinute(e.target.value)"
          @focus="e => e.target.select()"
          maxlength="2"
        />
      </div>
      <div class="time-col">
        <span class="time-label">Period</span>
        <button type="button" class="period-btn" @click="toggleAmPm">{{ ampm }}</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

const now = new Date()

const viewYear  = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())
const selYear   = ref(null)
const selMonth  = ref(null)
const selDay    = ref(null)
const hour12    = ref(12)
const minute    = ref(0)
const second    = ref(0)
const ampm      = ref('PM')

if (props.modelValue) parseModel(props.modelValue)

function parseModel(val) {
  const d = new Date(val)
  if (isNaN(d)) return
  viewYear.value  = d.getFullYear()
  viewMonth.value = d.getMonth()
  selYear.value   = d.getFullYear()
  selMonth.value  = d.getMonth()
  selDay.value    = d.getDate()
  const h = d.getHours()
  ampm.value   = h >= 12 ? 'PM' : 'AM'
  hour12.value = h % 12 || 12
  minute.value = d.getMinutes()
  second.value = d.getSeconds()
}

watch(() => props.modelValue, v => { if (v) parseModel(v) })

// ── Calendar ────────────────────────────────────────────────────────────
const leadingBlanks = computed(() =>
  new Date(viewYear.value, viewMonth.value, 1).getDay()
)
const daysInMonth = computed(() =>
  new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
)
const trailingDays = computed(() => {
  const total = leadingBlanks.value + daysInMonth.value
  const remainder = total % 7
  const needed = remainder === 0 ? 0 : 7 - remainder
  return Array.from({ length: needed }, (_, i) => i + 1)
})

function isSelected(day, year, month) {
  return selDay.value === day && selMonth.value === month && selYear.value === year
}
function isToday(day) {
  return day === now.getDate() &&
         viewMonth.value === now.getMonth() &&
         viewYear.value  === now.getFullYear()
}
function isPastDay(day, year, month) {
  const d = new Date(year, month, day, 23, 59, 59)
  return d < now
}

function prevMonth() {
  if (viewMonth.value === 0) { viewMonth.value = 11; viewYear.value-- }
  else viewMonth.value--
}
function nextMonth() {
  if (viewMonth.value === 11) { viewMonth.value = 0; viewYear.value++ }
  else viewMonth.value++
}
function clampViewYear() {
  viewYear.value = Math.min(2099, Math.max(2020, viewYear.value || 2024))
}

function selectDay(day, year, month) {
  selDay.value   = day
  selMonth.value = month
  selYear.value  = year
  emitValue()
}

// ── Time ────────────────────────────────────────────────────────────────
const displayHour = computed(() => pad(hour12.value))
function pad(n) { return String(n).padStart(2, '0') }

function setHour(val) {
  const n = parseInt(val)
  if (!isNaN(n) && n >= 1 && n <= 12) { hour12.value = n; emitValue() }
}
function setMinute(val) {
  const n = parseInt(val)
  if (!isNaN(n) && n >= 0 && n <= 59) { minute.value = n; emitValue() }
}
function setSecond(val) {
  const n = parseInt(val)
  if (!isNaN(n) && n >= 0 && n <= 59) { second.value = n; emitValue() }
}

function toggleAmPm() {
  ampm.value = ampm.value === 'AM' ? 'PM' : 'AM'
  emitValue()
}

function emitValue() {
  if (selDay.value === null) return
  const h24 = ampm.value === 'AM'
    ? (hour12.value === 12 ? 0 : hour12.value)
    : (hour12.value === 12 ? 12 : hour12.value + 12)
  const yyyy = String(selYear.value).padStart(4, '0')
  const mm   = String(selMonth.value + 1).padStart(2, '0')
  const dd   = String(selDay.value).padStart(2, '0')
  const hh   = String(h24).padStart(2, '0')
  const min  = String(minute.value).padStart(2, '0')
  emit('update:modelValue', `${yyyy}-${mm}-${dd}T${hh}:${min}`)
}
</script>

<style scoped>
.dtp {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}

/* ── Nav ─────────────────────────────────────────────────────────────── */
.dtp-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
}

.nav-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s;
  flex-shrink: 0;
}
.nav-btn:hover { background: var(--border); }

.nav-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  font-weight: 600;
}

.nav-select {
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font);
  color: var(--text);
  cursor: pointer;
  outline: none;
  padding: 2px 2px;
  border-radius: 4px;
  -webkit-appearance: none;
}
.nav-select:hover { background: var(--bg); }

.nav-year {
  width: 48px;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font);
  color: var(--text);
  outline: none;
  text-align: left;
  padding: 2px 2px;
  border-radius: 4px;
  -moz-appearance: textfield;
}
.nav-year::-webkit-inner-spin-button,
.nav-year::-webkit-outer-spin-button { -webkit-appearance: none; }
.nav-year:hover, .nav-year:focus { background: var(--bg); }

/* ── Grid ────────────────────────────────────────────────────────────── */
.dtp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  padding: 4px 12px 12px;
  gap: 0;
}

.dow {
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #6e6e73);
  padding: 6px 0 10px;
}

.blank { /* spacer */ }

.day-btn {
  aspect-ratio: 1;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 16px;
  font-weight: 400;
  color: var(--text);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s;
  width: 100%;
}
.day-btn:hover:not(:disabled):not(.selected) {
  background: var(--bg);
}
.day-btn.today:not(.selected) {
  font-weight: 700;
  color: var(--accent);
}
.day-btn.selected {
  background: var(--text);
  color: var(--surface);
  font-weight: 600;
}
.day-btn.past:not(.trailing) {
  color: var(--border);
  cursor: not-allowed;
}
.day-btn.trailing {
  color: var(--border);
  cursor: default;
}

/* ── Time ────────────────────────────────────────────────────────────── */
.dtp-time {
  border-top: 1px solid var(--border);
  padding: 14px 16px 16px;
  background: var(--bg);
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.time-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.time-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #6e6e73);
}

.time-input {
  width: 100%;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  font-weight: 500;
  padding: 8px 0;
  outline: none;
  transition: border-color 0.12s;
}
.time-input:focus { border-color: var(--accent); }

.time-sep {
  font-size: 15px;
  font-weight: 300;
  color: var(--text-secondary, #6e6e73);
  padding-bottom: 12px;
  flex: none;
}

.period-btn {
  width: 100%;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font);
  padding: 8px 0;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.period-btn:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
</style>
