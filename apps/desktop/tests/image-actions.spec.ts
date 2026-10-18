import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { DesktopImageActions, type ImageActionHost } from '../src/image-actions.ts'
import { zh } from '../src/locale.ts'
const target = { src: 'dsh-app://app/api/studybuddy-media?requestId=car', sessionId: 'session-car', name: 'Car', x: 30, y: 40 }
function fixture() {
  let epoch = 'account-a:1'
  const downloads = new EventEmitter()
  const templates: any[] = []
  const copy = vi.fn(), download = vi.fn(), send = vi.fn(), reveal = vi.fn()
  const owner = { isDestroyed: () => false, webContents: { isDestroyed: () => false, session: downloads, copyImageAt: copy, downloadURL: download, send } }
  const host: ImageActionHost = { window: () => owner as any, scope: () => epoch, messages: () => zh,
    verify: async () => true, popup: (_owner, template) => { templates.push(template) }, reveal, fileExists: () => true, downloadsDirectory: () => 'C:/Downloads' }
  const actions = new DesktopImageActions(host)
  return { actions, owner, downloads, templates, copy, download, send, reveal, switchAccount: () => { epoch = 'account-b:2' } }
}
it('offers exactly the five requested image actions, with reveal disabled before export', async () => {
  const f = fixture()
  await f.actions.open(target)
  expect(f.templates[0].map((item: any) => item.label)).toEqual(['在新标签页中打开图像', '添加到聊天', '复制图像', '在文件管理器中打开', '下载副本'])
  expect(f.templates[0][3].enabled).toBe(false)
  await f.templates[0][2].click()
  expect(f.copy).toHaveBeenCalledWith(30, 40)
  await f.templates[0][1].click()
  expect(f.send).toHaveBeenCalledWith(expect.any(String), { action: 'attach', target })
  f.actions.dispose()
})
it('reveals only a completed export initiated by this window and image action', async () => {
  const f = fixture()
  await f.actions.open(target)
  await f.templates[0][4].click()
  expect(f.download).toHaveBeenCalledWith(target.src)
  const item = new EventEmitter() as any
  item.getURL = () => target.src
  item.getURLChain = () => [target.src]
  item.getMimeType = () => 'image/jpeg'
  item.getSavePath = () => 'C:/Downloads/Car.jpg'
  item.setSaveDialogOptions = vi.fn()
  f.downloads.emit('will-download', {}, item, f.owner.webContents)
  item.emit('done', {}, 'completed')
  await f.actions.open(target)
  expect(f.templates[1][3].enabled).toBe(true)
  await f.templates[1][3].click()
  expect(f.reveal).toHaveBeenCalledWith('C:/Downloads/Car.jpg')
  f.actions.dispose()
  expect(f.downloads.listenerCount('will-download')).toBe(0)
})
it('drops stale menu clicks after account change, and refuses unowned URL schemes', async () => {
  const f = fixture()
  await f.actions.open(target)
  f.switchAccount()
  await f.templates[0][2].click()
  expect(f.copy).not.toHaveBeenCalled()
  await f.actions.open({ ...target, src: 'file:///C:/private.png' })
  expect(f.templates).toHaveLength(1)
  f.actions.dispose()
})
