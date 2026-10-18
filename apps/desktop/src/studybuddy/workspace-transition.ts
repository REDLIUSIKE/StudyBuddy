/** Keep the desktop workspace attached to the account that owns its profile. */
import type { StudyBuddyAuthState } from './types.ts'

export function studyBuddyWorkspaceTransition(state: StudyBuddyAuthState, initialAccount: string | undefined, entered: boolean): 'relaunch' | 'lock' | 'resume' | 'none' {
  if (state.phase === 'authenticated' && state.account?.id !== initialAccount
    || state.phase === 'signed-out' && initialAccount !== undefined) return 'relaunch'
  if (initialAccount !== undefined && state.phase === 'error') return 'lock'
  if (initialAccount !== undefined && state.phase === 'authenticated' && !entered) return 'resume'
  return 'none'
}
