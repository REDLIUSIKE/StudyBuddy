/** Dedicated product login window. It never exposes provider credential controls. */
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { DesktopLocale } from '../locale.ts'
import { welcomeWindowOptions } from '../welcome-window.ts'
export async function openStudyBuddyLogin(locale: DesktopLocale, created: (window: BrowserWindow) => void): Promise<BrowserWindow> {
  const window = new BrowserWindow({ ...welcomeWindowOptions(process.platform, locale), icon: join(app.getAppPath(), 'resources/icon-windows.png') })
  created(window)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  try { await window.loadURL('dsh-app://shell/welcome.html'); window.show(); return window }
  catch (error) { window.destroy(); throw error }
}
