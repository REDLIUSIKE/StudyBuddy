/** Shared channel names only; no main-only implementation enters sandboxed preload. */
export const SUPPORT_IPC = {
  preview: 'studybuddy:support-preview', upload: 'studybuddy:support-upload', screenshots: 'studybuddy:support-screenshots',
  report: 'studybuddy:support-report', operation: 'studybuddy:support-operation', exit: 'studybuddy:support-exit',
  subscribe: 'studybuddy:support-subscribe', unsubscribe: 'studybuddy:support-unsubscribe', progress: 'studybuddy:support-progress',
} as const
