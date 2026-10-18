/** Resolve only decoded images displayed by the application Chat, its image tab, or its shared lightbox. */
import type { DesktopImageTarget } from '@deepseek-ai/dsh-client-ui-tool'

/** Accepted displayed-image URL families. Filesystem paths are never IPC inputs. */
export function validImageSource(src: unknown): src is string {
  if (typeof src !== 'string' || src.length === 0 || src.length > 8192) return false
  try {
    const url = new URL(src)
    return (url.protocol === 'dsh-app:' && url.hostname === 'app' && url.pathname.startsWith('/api/'))
      || ((url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === '')
      || (url.protocol === 'blob:' && src.startsWith('blob:dsh-app://app/'))
  } catch { return false }
}

/** @returns the originating Chat even when its enlarged image is portalled to document.body. */
export function imageContextTarget(target: EventTarget | null, document: Document): Omit<DesktopImageTarget, 'x' | 'y'> | undefined {
  if (!(target instanceof HTMLImageElement) || !target.complete || target.naturalWidth === 0) return undefined
  const src = target.currentSrc || target.src
  if (!validImageSource(src)) return undefined
  let owner = target.closest<HTMLElement>('[data-chat-session]')
  if (owner === null && target.closest('[data-image-lightbox]') !== null) {
    // A pointer action only: no image scan in a render or streaming event path.
    for (const image of document.querySelectorAll<HTMLImageElement>('[data-chat-session] img')) {
      if ((image.currentSrc || image.src) === src) { owner = image.closest<HTMLElement>('[data-chat-session]'); break }
    }
  }
  const sessionId = owner?.dataset.chatSession
  if (sessionId === undefined || sessionId.length === 0 || sessionId.length > 200) return undefined
  return { src, sessionId, name: (target.alt || 'image').slice(0, 160) }
}
