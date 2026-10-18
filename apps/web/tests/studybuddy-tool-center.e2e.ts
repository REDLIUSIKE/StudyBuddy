/** Real Chromium loads the built local module without a desktop bridge; not a full authenticated Web composition. */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
const root = fileURLToPath(new URL('../../../.dsh-build/studybuddy-business/module/', import.meta.url))
it('web host cannot fall back to Tauri or local tool operations', async () => {
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const path = resolve(
          root,
          '.' +
            decodeURIComponent(
              new URL(request.url ?? '/', 'http://127.0.0.1').pathname === '/'
                ? '/index.html'
                : new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
            ),
        )
        if (relative(root, path).startsWith('..')) throw Error('TEST_PATH_DENIED')
        const types: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
        }
        response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream')
        response.end(await readFile(path))
      } catch {
        response.statusCode = 404
        response.end('not found')
      }
    })()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch()
    const page = await browser.newPage(),
      operations: string[] = []
    page.on('request', (request) => {
      if (/\/api\/|studybuddy:|tauri:/u.test(request.url())) operations.push(request.url())
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('TEST_SERVER_INVALID')
    await page.goto('http://127.0.0.1:' + address.port + '/')
    await page.getByRole('alert').waitFor()
    expect(
      await page.evaluate(() => ({
        tools: Reflect.has(window, 'studybuddyTools'),
        tauri: Reflect.has(window, '__TAURI_INTERNALS__'),
      })),
    ).toEqual({ tools: false, tauri: false })
    expect(operations).toEqual([])
    expect(await page.locator('.native-tool-tile').count()).toBe(0)
  } finally {
    await browser?.close()
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
  }
})
