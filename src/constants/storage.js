// Central source of truth for localStorage key names used across the renderer.
// 'neverShowUnknownWarning' was previously hand-typed separately in both
// GroupDetail.vue and TemplateDetail.vue — a real drift risk if one ever got renamed.
export const STORAGE_KEYS = {
  ONBOARDING_COMPLETE:        'onboardingComplete',
  THEME:                      'theme',
  MAC_NOTIFS:                 'macNotifs',
  SCHEDULED_SYNC_PREFERENCE:  'scheduledSyncPreference',
  NEVER_SHOW_UNKNOWN_WARNING: 'neverShowUnknownWarning',
}
