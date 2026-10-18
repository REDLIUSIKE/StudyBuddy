/** Keep the desktop workspace attached to the account that owns its profile. */
import type { StudyBuddyAuthState } from './types.ts';
export declare function studyBuddyWorkspaceTransition(state: StudyBuddyAuthState, initialAccount: string | undefined, entered: boolean): 'relaunch' | 'lock' | 'resume' | 'none';
//# sourceMappingURL=workspace-transition.d.ts.map