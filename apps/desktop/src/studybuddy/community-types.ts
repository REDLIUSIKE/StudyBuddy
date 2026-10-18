/** Original business pages admitted by the desktop, independently of model consumers. */
import type { EmbeddedLease, EmbeddedTheme, OwnedScope } from '@studybuddy/contracts'

export type CommunityTarget = 'zhilian' | 'skills'
/** The local shell receives leases and theme operations, never login credentials. */
export interface CommunitySurfaceHost {
  acquire(target: CommunityTarget): Promise<EmbeddedLease>
  release(lease: string): Promise<void>
  setTheme(lease: string, theme: EmbeddedTheme): Promise<void>
  setVisible(lease: string, visible: boolean): Promise<void>
  subscribeInvalid(listener: (lease: string) => void): () => void
  subscribeNavigation(listener: (notice: { scope: OwnedScope; target: 'tools' | CommunityTarget }) => void): () => void
}
/** Dedicated channels keep remote Skill operations outside the model and tool-center bridge. */
export const COMMUNITY_IPC = {
  acquire: 'studybuddy:community-acquire', release: 'studybuddy:community-release',
  theme: 'studybuddy:community-theme', visible: 'studybuddy:community-visible',
  invalid: 'studybuddy:community-invalid', navigation: 'studybuddy:community-navigation',
  startup: 'studybuddy:skill-startup', invoke: 'studybuddy:skill-invoke', event: 'studybuddy:skill-event',
} as const
