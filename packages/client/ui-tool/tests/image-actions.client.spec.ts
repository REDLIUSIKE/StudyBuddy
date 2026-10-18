// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { runImageAction } from '../src/client/image-actions/actions.ts'
import { imageAddress, parseImageAddress } from '../src/client/image-actions/definition.ts'
const target = { sessionId: 'session-car', src: 'dsh-app://app/api/studybuddy-media?requestId=car', name: 'Car', x: 20, y: 30 }
it('opens an existing image tab without fetching or submitting a prompt', async () => {
  const open = vi.fn(), fetch = vi.fn(), add = vi.fn()
  expect(await runImageAction({ action: 'open', target }, { current: () => true, open, fetch, add })).toBe('opened')
  expect(parseImageAddress(open.mock.calls[0]?.[0])).toEqual({ sessionId: target.sessionId, src: target.src, name: target.name })
  expect(fetch).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled()
})
it('adds original image bytes as one draft attachment, with no send operation', async () => {
  const add = vi.fn((_file: File) => true)
  const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }))
  expect(await runImageAction({ action: 'attach', target }, { current: () => true, open: vi.fn(), fetch, add })).toBe('added')
  const file = add.mock.calls[0]?.[0] as File
  expect(file).toBeInstanceOf(File); expect(file.type).toBe('image/jpeg'); expect(file.name).toBe('Car.jpg')
  expect(file.size).toBe(3)
})
it('does not add a fetched image to a newly selected account or Session', async () => {
  let current = true
  const add = vi.fn((_file: File) => true)
  const fetch = vi.fn(async () => { current = false; return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }) })
  expect(await runImageAction({ action: 'attach', target }, { current: () => current, open: vi.fn(), fetch, add })).toBe('stale')
  expect(add).not.toHaveBeenCalled()
})
it('refuses non-image responses, blocked admission, and filesystem/foreign-resource tab addresses', async () => {
  const add = vi.fn((_file: File) => false)
  const ports = { current: () => true, open: vi.fn(), fetch: async () => new Response('not image'), add }
  expect(await runImageAction({ action: 'attach', target }, ports)).toBe('failed')
  expect(add).not.toHaveBeenCalled()
  expect(await runImageAction({ action: 'attach', target }, { ...ports, fetch: async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }) })).toBe('failed')
  expect(parseImageAddress(imageAddress({ ...target, src: 'file:///C:/private.png' }))).toBeUndefined()
  expect(parseImageAddress('dsh-resource://file/private.png')).toBeUndefined()
  expect(parseImageAddress(imageAddress(target))?.src).toBe(target.src)
})
