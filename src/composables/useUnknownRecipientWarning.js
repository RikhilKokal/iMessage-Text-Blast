import { ref } from 'vue'
import { STORAGE_KEYS } from '../constants/storage'

export function getUnconfirmedNames(members) {
  return members.filter(m => !m.service_confirmed).map(m => m.name)
}

export function useUnknownRecipientWarning() {
  const unknownWarning = ref(null)
  const neverShowUnknownWarning = ref(localStorage.getItem(STORAGE_KEYS.NEVER_SHOW_UNKNOWN_WARNING) === 'true')
  const unknownWarningNeverCheck = ref(false)

  function checkUnknownThenProceed(names, proceedFn) {
    if (!names.length || neverShowUnknownWarning.value) { proceedFn(); return }
    unknownWarningNeverCheck.value = false
    unknownWarning.value = {
      names,
      proceed: () => {
        if (unknownWarningNeverCheck.value) {
          neverShowUnknownWarning.value = true
          localStorage.setItem(STORAGE_KEYS.NEVER_SHOW_UNKNOWN_WARNING, 'true')
        }
        unknownWarning.value = null
        proceedFn()
      }
    }
  }

  return { unknownWarning, unknownWarningNeverCheck, checkUnknownThenProceed }
}
