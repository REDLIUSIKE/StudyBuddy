// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { imageContextTarget } from '../src/image-context-target.ts'

afterEach(() => { document.body.replaceChildren() })
const src = 'dsh-app://app/api/studybuddy-media?requestId=148d467b-7660-4125-a238-f0911841c482&kind=image'
function image(parent: HTMLElement): HTMLImageElement {
  const img = document.createElement('img')
  img.src = src
  img.alt = 'Red car'
  Object.defineProperties(img, { complete: { value: true }, naturalWidth: { value: 2816 } })
  parent.append(img)
  return img
}
it('owns an actual chat image, preserving its original source and session', () => {
  const chat = document.createElement('div')
  chat.dataset.chatSession = 'session-car'
  document.body.append(chat)
  expect(imageContextTarget(image(chat), document)).toEqual({ src, sessionId: 'session-car', name: 'Red car' })
})
it('resolves the same image in the shared body-portal lightbox', () => {
  const chat = document.createElement('div')
  chat.dataset.chatSession = 'session-car'
  document.body.append(chat)
  image(chat)
  const box = document.createElement('div')
  box.dataset.imageLightbox = ''
  document.body.append(box)
  expect(imageContextTarget(image(box), document)?.sessionId).toBe('session-car')
})
it('does not replace logo, undecoded-image, or unrelated-page context menus', () => {
  expect(imageContextTarget(image(document.body), document)).toBeUndefined()
  const chat = document.createElement('div')
  chat.dataset.chatSession = 'session-car'
  document.body.append(chat)
  const img = image(chat)
  img.src = 'file:///C:/private.png'
  expect(imageContextTarget(img, document)).toBeUndefined()
  const pending = document.createElement('img')
  pending.src = src
  chat.append(pending)
  expect(imageContextTarget(pending, document)).toBeUndefined()
})
it('supports browser-owned pasted image bytes without giving the host a file path', () => {
  const chat = document.createElement('div')
  chat.dataset.chatSession = 'session-car'
  document.body.append(chat)
  const img = image(chat)
  img.src = 'blob:dsh-app://app/11111111-2222-4333-8444-555555555555'
  expect(imageContextTarget(img, document)?.src).toBe(img.src)
})
