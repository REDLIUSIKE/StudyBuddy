import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Context } from '@deepseek-ai/cordis'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline, type AppReady } from '@deepseek-ai/dsh-cmdline'
import * as ResearchPlugin from '../src/research-plugin.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function readiness(): AppReady & { commit(): void } {
  const listeners = new Set<() => void>()
  let committed = false
  return {
    onReady(listener) {
      if (committed) listener()
      else listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    commit() {
      committed = true
      for (const listener of [...listeners]) listener()
      listeners.clear()
    },
  }
}

function json(text: string): unknown {
  const value: unknown = JSON.parse(text)
  return value
}

async function trace(root: string): Promise<string[]> {
  return z.array(z.string()).parse(json(await readFile(join(root, 'trace.json'), 'utf8')))
}

async function fixture(scenario: object = {}) {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-research-plugin-'))
  roots.push(root)
  await writeFile(join(root, 'scenario.json'), JSON.stringify(scenario))
  const input = new PassThrough(), output = new PassThrough()
  const chunks: Buffer[] = []
  output.on('data', (chunk: Buffer) => { chunks.push(chunk) })
  const ready = readiness(), exits: number[] = []
  const config = {
    domainEntry: fileURLToPath(new URL('./fixtures/research-domain.mjs', import.meta.url)),
    staticDirectory: root,
    pythonExecutable: join(root, 'python.exe'),
  }
  const bootstrap = { projectsRoot: join(root, 'projects'), guestAuthorization: 'a'.repeat(64), toolAuthorization: 'b'.repeat(64) }
  const ctx = new Context()
  contexts.push(ctx)
  provideCmdline(ctx, { args: [], ready, exit: (code) => { exits.push(code) } })
  const mount = () => ctx.plugin({
    ...ResearchPlugin,
    apply: (owner: Context, value: ResearchPlugin.Config) => ResearchPlugin.mountResearchPlugin(owner, value, input, output),
  }, config)
  return { root, ctx, config, bootstrap, input, output, ready, exits, mount, text: () => Buffer.concat(chunks).toString('utf8') }
}

describe('research plugin private bootstrap', () => {
  it('reads one split JSON line and preserves every following byte for the channel', async () => {
    const f = await fixture()
    const mounted = f.mount()
    const line = JSON.stringify(f.bootstrap)
    f.input.write(line.slice(0, 19))
    f.input.write(line.slice(19) + '\n{"type":"host-event","text":"原始字节"}\n')
    await mounted
    expect(f.text()).toBe('')
    expect(f.ctx.get('researchDomain')).toBeDefined()
    f.ready.commit()
    await expect.poll(f.text).toContain('"type":"ready"')
    const message = z.strictObject({ type: z.literal('ready'), origin: z.string() }).parse(json(f.text()))
    expect(Object.keys(message).sort()).toEqual(['origin', 'type'])
    const state: unknown = await fetch(message.origin).then(response => response.json())
    expect(state).toEqual({ ...f.bootstrap, staticDirectory: f.root, pythonExecutable: f.config.pythonExecutable, received: '{"type":"host-event","text":"原始字节"}\n' })
    await f.ctx.fiber.dispose()
    expect(f.ctx.get('researchDomain')).toBeUndefined()
    await expect.poll(() => trace(f.root)).toEqual(['creating', 'starting', 'started', 'closing', 'closed', 'channel-closed'])
  })

  it.each([
    '{',
    JSON.stringify({ projectsRoot: 'relative', guestAuthorization: 'a'.repeat(64), toolAuthorization: 'b'.repeat(64) }),
    JSON.stringify({ projectsRoot: 'C:/owned', guestAuthorization: 'short', toolAuthorization: 'b'.repeat(64) }),
    JSON.stringify({ projectsRoot: 'C:/owned', guestAuthorization: 'a'.repeat(64), toolAuthorization: 'b'.repeat(64), extra: 'forbidden' }),
    ' '.repeat(65537),
  ])('rejects malformed bootstrap without starting or revealing credentials: %s', async (invalid) => {
    const f = await fixture()
    const mounted = f.mount()
    f.input.write(invalid + '\n')
    await expect(mounted).rejects.toMatchObject({ code: 'RESEARCH_BOOTSTRAP_INVALID' })
    f.ready.commit()
    expect(f.text()).toBe('')
    await expect.poll(() => f.exits).toContain(1)
  })

  it.each([
    { domainEntry: 'relative.mjs' },
    { staticDirectory: 'relative' },
    { pythonExecutable: 'python' },
    { fallback: 'old-app' },
  ])('rejects invalid profile configuration before reading stdin: %j', async (override) => {
    const f = await fixture()
    await expect(ResearchPlugin.mountResearchPlugin(f.ctx, { ...f.config, ...override }, f.input, f.output)).rejects.toThrow()
    expect(f.input.listenerCount('readable')).toBe(0)
    expect(f.text()).toBe('')
  })
})

describe('research plugin lifecycle', () => {
  it('releases stream listeners even when channel close throws', async () => {
    const f = await fixture({ channelCloseError: true })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await mounted
    f.input.end()
    await expect.poll(() => f.exits).toEqual([1])
    expect(f.input.listenerCount('error')).toBe(0)
    expect(f.output.listenerCount('error')).toBe(0)
    f.ready.commit()
    expect(f.text()).toBe('')
  })

  it('keeps output errors contained until cleanup reaches quiescence', async () => {
    const f = await fixture({ closeDelayMs: 30 })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await mounted
    expect(() => {
      f.output.emit('error', Error('first output failure'))
      f.output.emit('error', Error('second output failure'))
    }).not.toThrow()
    await expect.poll(() => f.exits).toEqual([1])
    f.ready.commit()
    expect(f.text()).toBe('')
  })

  it('cancels a fiber waiting for bootstrap without waiting for more input', async () => {
    const f = await fixture()
    const mounted = f.mount()
    await expect.poll(() => f.input.listenerCount('readable')).toBe(1)
    await mounted.dispose()
    await mounted
    f.ready.commit()
    expect(f.text()).toBe('')
    expect(f.input.listenerCount('readable')).toBe(0)
    expect(f.exits).toEqual([])
  })

  it('treats an input already at EOF as a stopped profile', async () => {
    const f = await fixture()
    f.input.resume()
    const ended = once(f.input, 'end')
    f.input.end()
    await ended
    await f.mount()
    await expect.poll(() => f.exits).toEqual([0])
    f.ready.commit()
    expect(f.text()).toBe('')
  })

  it('honors shutdown buffered immediately after bootstrap before publishing ready', async () => {
    const f = await fixture({ createDelayMs: 25 })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n{"type":"shutdown"}\n')
    await mounted
    await expect.poll(() => f.exits).toEqual([0])
    f.ready.commit()
    expect(f.text()).toBe('')
    expect(await trace(f.root)).toEqual(['creating', 'closing', 'closed', 'channel-closed'])
  })

  it('rejects a compiled module without the required domain exports', async () => {
    const f = await fixture()
    const invalid = join(f.root, 'invalid.mjs')
    await writeFile(invalid, 'export const unsupported = true\n')
    const mounted = ResearchPlugin.mountResearchPlugin(f.ctx, { ...f.config, domainEntry: invalid }, f.input, f.output)
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await expect(mounted).rejects.toMatchObject({ code: 'RESEARCH_MODULE_INVALID' })
    await expect.poll(() => f.exits).toEqual([1])
    expect(f.text()).toBe('')
  })

  it('refuses a non-loopback ready origin and closes the started domain', async () => {
    const f = await fixture({ invalidOrigin: true })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await expect(mounted).rejects.toMatchObject({ code: 'RESEARCH_MODULE_INVALID' })
    await expect.poll(() => f.exits).toEqual([1])
    f.ready.commit()
    expect(f.text()).toBe('')
    expect((await trace(f.root)).slice(-3)).toEqual(['closing', 'closed', 'channel-closed'])
  })

  it('waits for domain and Worker cleanup before requesting EOF exit', async () => {
    const f = await fixture({ closeDelayMs: 35 })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await mounted
    f.input.end()
    expect(f.exits).toEqual([])
    await expect.poll(() => f.exits).toEqual([0])
    expect((await trace(f.root)).slice(-3)).toEqual(['closing', 'closed', 'channel-closed'])
    f.ready.commit()
    expect(f.text()).toBe('')
  })

  it('cancels an unfinished bootstrap on EOF without a late ready', async () => {
    const f = await fixture()
    const mounted = f.mount()
    f.input.end('{"projectsRoot":')
    await mounted
    await expect.poll(() => f.exits).toEqual([0])
    f.ready.commit()
    expect(f.text()).toBe('')
  })

  it('closes a domain that finishes creating after stdin has ended', async () => {
    const f = await fixture({ createAfterAbort: true, closeDelayMs: 20 })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await expect.poll(async () => { try { return await readFile(join(f.root, 'trace.json'), 'utf8') } catch { return '' } }).toBe('["creating"]')
    f.input.end()
    await mounted
    await expect.poll(() => f.exits).toEqual([0])
    f.ready.commit()
    expect(f.text()).toBe('')
    expect(await trace(f.root)).toEqual(['creating', 'closing', 'closed', 'channel-closed'])
  })

  it('closes a failed start and reports failure without ready', async () => {
    const f = await fixture({ failStart: true })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await expect(mounted).rejects.toThrow('FIXTURE_START_FAILED')
    await expect.poll(() => f.exits).toEqual([1])
    f.ready.commit()
    expect(f.text()).toBe('')
    expect(await trace(f.root)).toEqual(['creating', 'starting', 'closing', 'closed', 'channel-closed'])
  })

  it('joins repeated fiber disposal while start is still pending', async () => {
    const f = await fixture({ startDelayMs: 50, closeDelayMs: 20 })
    const mounted = f.mount()
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await expect.poll(() => f.ctx.get('researchDomain')).toBeDefined()
    const disposal = f.ctx.fiber.dispose()
    await Promise.all([mounted, disposal, f.ctx.fiber.dispose()])
    f.ready.commit()
    expect(f.text()).toBe('')
    expect((await trace(f.root)).filter(row => row === 'closed')).toHaveLength(1)
  })

  it('loads the actual plugin composition through dsh boot and Loader', async () => {
    const f = await fixture()
    const path = join(f.root, 'cordis.yml')
    await writeFile(path, JSON.stringify([{ id: 'research-plugin', name: 'cordis:research-test', config: f.config }]))
    let owner: Context | undefined
    const pending = boot('research-fixture', path, [], (host) => {
      owner = host
      contexts.push(host)
      provideCmdline(host, { args: [], ready: f.ready, exit: (code) => { f.exits.push(code) } })
      host.loader.builtins['research-test'] = {
        ...ResearchPlugin,
        apply: (ctx: Context, value: ResearchPlugin.Config) => ResearchPlugin.mountResearchPlugin(ctx, value, f.input, f.output),
      }
    })
    f.input.write(JSON.stringify(f.bootstrap) + '\n')
    await pending
    expect(owner?.get('researchDomain')).toBeDefined()
    expect(f.text()).toBe('')
    f.ready.commit()
    await expect.poll(f.text).toContain('"type":"ready"')
    await owner?.fiber.dispose()
    expect(f.input.listenerCount('readable')).toBe(0)
    expect(f.input.listenerCount('end')).toBe(0)
  })
})
