import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the standalone mark only when the host is not showing the full wordmark.
 * @param props - Host-supplied mark presentation.
 * @returns the approved StudyBuddy mark.
 */
export function OfficialBrandMark({ size, wide }: SidebarBrandMarkOwnerProps) {
  if (wide) return null
  return <img src="/brand/guibao.png" width={size} height={size} style={{ objectFit: 'contain' }} alt="硅宝" />
}

/**
 * Render the complete wordmark with its single integrated mascot letter.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <img src="/brand/sidebar-v4-1x.png" srcSet="/brand/sidebar-v4-1x.png 1x, /brand/sidebar-v4-2x.png 2x, /brand/sidebar-v4-3x.png 3x"
    width={160} height={36} style={{ objectFit: 'contain' }} alt="StudyBuddy 硅基同桌" />
}

/** Approved compact mark for the conversation hero. */
export function StudyBuddyHeroMark({ size, className }: { size: number; className?: string | undefined }) {
  return <img src="/brand/guibao.png" width={size} height={size} className={className} style={{ objectFit: 'contain' }} alt="硅宝" />
}
