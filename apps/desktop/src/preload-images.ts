/** Image-only DOM capture and a disposable notice bridge for the application top frame. */
import { ipcRenderer } from 'electron'
import type { DesktopImageBridge, DesktopImageAction } from '@deepseek-ai/dsh-client-ui-tool'
import { DESKTOP_IPC } from './ipc.ts'
import { imageContextTarget } from './image-context-target.ts'

export function createDesktopImageBridge(): DesktopImageBridge {
  return { subscribe(listener) {
    const handle = (_event: Electron.IpcRendererEvent, action: DesktopImageAction): void => { listener(action) }
    ipcRenderer.on(DESKTOP_IPC.imageAction, handle)
    return () => { ipcRenderer.off(DESKTOP_IPC.imageAction, handle) }
  } }
}
export function installImageContextMenu(): void {
  window.addEventListener('contextmenu', event => {
    const target = imageContextTarget(event.target, document)
    if (target === undefined) return
    event.preventDefault()
    event.stopPropagation()
    void ipcRenderer.invoke(DESKTOP_IPC.imageContext, { ...target, x: event.clientX, y: event.clientY }).catch(() => {})
  }, true)
}
