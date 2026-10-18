/** Keyless UI intents; adding an image prepares an ordinary composer draft and never submits it. */
import type { DesktopImageAction } from '../../image-actions-protocol.ts'
import { imageAddress, parseImageAddress } from './definition.ts'
export interface ImageActionPorts {
  current(): boolean
  open(address: string): void
  fetch(url: string): Promise<Response>
  add(file: File): boolean
}
export async function runImageAction(action: DesktopImageAction, ports: ImageActionPorts): Promise<'opened' | 'added' | 'failed' | 'stale'> {
  if (!ports.current()) return 'stale'
  const address = imageAddress(action.target)
  if (parseImageAddress(address) === undefined) return 'failed'
  if (action.action === 'open') { ports.open(address); return 'opened' }
  if (action.action !== 'attach') return 'failed'
  try {
    const response = await ports.fetch(action.target.src)
    if (!response.ok) return 'failed'
    const blob = await response.blob()
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
    const extension = extensions[blob.type.split(';')[0] ?? '']
    if (extension === undefined || blob.size === 0 || blob.size > 16 * 1024 * 1024) return 'failed'
    if (!ports.current()) return 'stale'
    const name = action.target.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 96) || 'image'
    return ports.add(new File([blob], `${name}.${extension}`, { type: blob.type })) ? 'added' : 'failed'
  } catch { return 'failed' }
}
