import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
interface SourceFile extends Blob { exists(): Promise<boolean>; json(): Promise<unknown> }
const { file, write }: { file(path: string): SourceFile; write(path: string | SourceFile, data: string | Uint8Array | Blob, options?: { createPath?: boolean }): Promise<number> } = await import(new URL('../../integrations/toonflow/packages/file/src/node.ts', import.meta.url).href)
const { acquireFileAccess }: { acquireFileAccess(paths: string[], mode: 'read' | 'write'): Promise<() => void> } = await import(new URL('../../integrations/toonflow/packages/file/src/access.ts', import.meta.url).href)

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function temporary() { const path = await mkdtemp(join(tmpdir(), 'aigc-node-file-')); directories.push(path); return path }

describe('AIGC Node file adapter', () => {
  it('serves a native Blob and bounded slices without eagerly loading a media file', async () => {
    const path = join(await temporary(), '原图.png')
    await writeFile(path, '0123456789')
    const value = file(path)
    expect(value).toBeInstanceOf(Blob)
    expect(value.size).toBe(10)
    expect(value.type).toBe('image/png')
    expect(await new Response(value.slice(2, -2)).text()).toBe('234567')
    expect(await value.text()).toBe('0123456789')
    expect(await file(path + '.missing').exists()).toBe(false)
  })

  it('uses the existing access queue for reads, streams and writes', async () => {
    const path = join(await temporary(), 'file.txt')
    await writeFile(path, 'before')
    const release = await acquireFileAccess([path], 'write')
    let completed = false
    const pending = file(path).text().then(value => { completed = true; return value })
    await Promise.resolve()
    expect(completed).toBe(false)
    release()
    expect(await pending).toBe('before')
    expect(await write(file(path), new Blob(['after']))).toBe(5)
    expect(await readFile(path, 'utf8')).toBe('after')
    expect(await new Response(file(path).stream()).text()).toBe('after')
  })

  it('preserves exclusive creation and rejects unsupported destinations', async () => {
    const path = join(await temporary(), 'folder/file.json')
    expect(await write(path, '{"ok":true}', { createPath: true })).toBe(11)
    expect(await file(path).json()).toEqual({ ok: true })
    // @ts-expect-error The runtime must reject accidentally passed HTTP bodies.
    await expect(write(path, new Response('not a file'))).rejects.toThrow('stream')
    expect(await readFile(path, 'utf8')).toBe('{"ok":true}')
  })
})
