/** Existing image URLs open in a dedicated right-Sidebar resource tab, never an external browser. */
import type { DesktopImageTarget } from '../../image-actions-protocol.ts'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
export const IMAGE_TAB_ID = 'studybuddy-conversation-image'
export interface ImageAddress { readonly sessionId: string; readonly src: string; readonly name: string }
export function imageAddress(target: Pick<DesktopImageTarget, 'sessionId' | 'src' | 'name'>): string {
  return `dsh-resource://conversation-image/${encodeURIComponent(target.sessionId)}?${new URLSearchParams({ src: target.src, name: target.name })}`
}
export function parseImageAddress(address: string): ImageAddress | undefined {
  if (address.length > 24000) return undefined
  try {
    const url = new URL(address)
    if (url.protocol !== 'dsh-resource:' || url.hostname !== 'conversation-image') return undefined
    const sessionId = decodeURIComponent(url.pathname.slice(1))
    const src = url.searchParams.get('src') ?? ''
    const name = url.searchParams.get('name') ?? ''
    const source = new URL(src)
    if (sessionId === '' || sessionId.length > 200 || name.length > 160 || src.length > 8192
      || !((source.protocol === 'dsh-app:' && source.hostname === 'app' && source.pathname.startsWith('/api/'))
        || ((source.protocol === 'http:' || source.protocol === 'https:') && source.username === '' && source.password === '')
        || (source.protocol === 'blob:' && src.startsWith('blob:dsh-app://app/')))) return undefined
    return { sessionId, src, name }
  } catch { return undefined }
}
export function imageDefinition(title: () => string): SidebarRightTabDefinition {
  return { id: IMAGE_TAB_ID, kind: IMAGE_TAB_ID, patterns: ['dsh-resource://conversation-image/**'], priority: 'builtin',
    canOpen: address => parseImageAddress(address) !== undefined, title: address => parseImageAddress(address)?.name || title() }
}
