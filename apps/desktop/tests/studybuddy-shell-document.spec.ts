import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { serveStudyBuddyShellDocument } from '../src/studybuddy/shell-document.ts'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const welcome = 'dsh-app://shell/welcome.html'
it('serves every script and stylesheet referenced by the real welcome document', async () => {
  const response = await serveStudyBuddyShellDocument(new Request(welcome), appRoot)
  expect(response.status).toBe(200)
  const html = await response.text()
  const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map(match => match[1])
  expect(paths).toContain('../lib/welcome/welcome.js')
  for (const path of paths) {
    const asset = await serveStudyBuddyShellDocument(new Request(new URL(path ?? '', welcome)), appRoot)
    expect(asset.status, path).toBe(200)
    expect((await asset.arrayBuffer()).byteLength, path).toBeGreaterThan(0)
  }
  const logo = await serveStudyBuddyShellDocument(new Request(new URL('assets/studybuddy-wordmark.png', welcome)), appRoot)
  expect(logo.status).toBe(200)
  expect(logo.headers.get('content-type')).toBe('image/png')
})
it('does not turn the welcome bundle route into access to the application directory', async () => {
  const response = await serveStudyBuddyShellDocument(new Request('dsh-app://shell/lib/welcome/%2e%2e%2f%2e%2e%2fpackage.json'), appRoot)
  expect(response.status).toBe(403)
})
