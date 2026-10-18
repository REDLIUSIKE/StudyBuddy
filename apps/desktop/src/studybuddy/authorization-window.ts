/** A sandboxed, origin-confined website window owned by one product authorization. */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { StudyBuddyAuthState } from './types.ts'

export class StudyBuddyAuthorizationWindow {
  #window: BrowserWindow | undefined
  constructor(private readonly parent: () => BrowserWindow | undefined, private readonly dismissed: () => void) {}
  async open(value: string): Promise<void> {
    const destination = new URL(value)
    if (destination.origin !== 'https://guijitongzhuo.com' || destination.username || destination.password) throw new Error('Invalid authorization origin')
    if (this.#window !== undefined) { this.focus(); return }
    const parent = this.parent()
    const window = new BrowserWindow({
      width: 500, height: 720, minWidth: 440, minHeight: 600, show: false,
      title: '登录 StudyBuddy', autoHideMenuBar: true,
      icon: join(app.getAppPath(), 'resources/icon-windows.png'),
      ...(parent === undefined ? {} : { parent }),
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
        partition: `studybuddy-authorization-${randomUUID()}` },
    })
    this.#window = window
    window.removeMenu()
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const constrain = (event: Electron.Event, url: string): void => {
      try { if (new URL(url).origin === destination.origin) return } catch { /* Refuse malformed destinations. */ }
      event.preventDefault()
    }
    window.webContents.on('will-navigate', constrain)
    window.webContents.on('will-redirect', constrain)
    window.webContents.on('will-attach-webview', (event) => { event.preventDefault() })
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, done) => { done(false) })
    window.webContents.session.setPermissionCheckHandler(() => false)
    window.on('closed', () => {
      if (this.#window !== window) return
      this.#window = undefined
      this.dismissed()
    })
    try {
      await window.loadURL(destination.href)
      if (this.#window === window && !window.isDestroyed()) window.show()
    } catch (error) { this.close(); throw error }
  }
  focus(): void {
    if (this.#window === undefined || this.#window.isDestroyed()) return
    if (this.#window.isMinimized()) this.#window.restore()
    this.#window.show(); this.#window.focus()
  }
  synchronize(state: StudyBuddyAuthState): void {
    if (state.phase !== 'starting' && state.phase !== 'waiting') this.close()
  }
  close(): void {
    const window = this.#window
    this.#window = undefined
    if (window !== undefined && !window.isDestroyed()) window.destroy()
  }
}
