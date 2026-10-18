/** The remote Skill page receives only its original command transport and opaque event channels. */
import { contextBridge, ipcRenderer } from 'electron'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { COMMUNITY_IPC } from './studybuddy/community-types.ts'
if (process.isMainFrame && location.origin === 'https://guijitongzhuo.com' && location.pathname === '/skills' && new URLSearchParams(location.search).get('host_ui') === 'harness') {
  const startup: unknown = ipcRenderer.sendSync(COMMUNITY_IPC.startup)
  if (startup && typeof startup === 'object' && 'bindingId' in startup && typeof startup.bindingId === 'string' && /^[a-f0-9]{64}$/.test(startup.bindingId) && 'operationId' in startup && typeof startup.operationId === 'string') {
    const channels = new Map<string, (value: unknown) => void>(), watches = new Map<string, string>()
    ipcRenderer.on(COMMUNITY_IPC.event, (_event, notice: unknown) => {
      if (!notice || typeof notice !== 'object' || !('channelId' in notice) || typeof notice.channelId !== 'string' || !('payload' in notice)) return
      const callback = channels.get(notice.channelId)
      try { callback?.(notice.payload) } catch { /* a page callback cannot broaden the bridge */ }
    })
    const transport = {
      channel(callback: (value: unknown) => void): string {
        if (typeof callback !== 'function' || channels.size >= 1024) throw Error('SKILL_CHANNEL_UNAVAILABLE')
        const id = randomUUID(); channels.set(id, callback); return id
      },
      async invoke(command: string, input: Record<string, unknown>): Promise<unknown> {
        try {
          const response: unknown = await ipcRenderer.invoke(COMMUNITY_IPC.invoke, command, input)
          if (!response || typeof response !== 'object' || !('ok' in response) || typeof response.ok !== 'boolean') throw Error('SKILL_NATIVE_RESPONSE_INVALID')
          if (!response.ok) { if (typeof input.onChange === 'string') channels.delete(input.onChange); return response }
          const data = 'data' in response ? response.data : null
          if (command === 'skill_center_watch_start' && typeof input.onChange === 'string' && data && typeof data === 'object' && 'watchId' in data && typeof data.watchId === 'string') watches.set(data.watchId, input.onChange)
          if (command === 'skill_center_watch_stop' && typeof input.watchId === 'string') { const channel = watches.get(input.watchId); if (channel) channels.delete(channel); watches.delete(input.watchId) }
          // contextBridge does not preserve Error.code; return the exact structured result instead.
          return response
        } catch (error) { if (typeof input.onChange === 'string') channels.delete(input.onChange); throw error }
        finally { if (typeof input.onProgress === 'string') channels.delete(input.onProgress) }
      },
    }
    contextBridge.exposeInMainWorld('__STUDYBUDDY_SKILL_STARTUP__', startup)
    contextBridge.exposeInMainWorld('__STUDYBUDDY_SKILL_NATIVE__', transport)
    window.addEventListener('pagehide', () => { channels.clear(); watches.clear() }, { once: true })
  }
}
