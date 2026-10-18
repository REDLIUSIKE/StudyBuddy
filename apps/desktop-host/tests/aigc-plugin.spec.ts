import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { expect, it } from 'vitest'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../src/aigc-plugin.ts'

it('loads the real AIGC service through Loader, correlates operations and disposes its private channel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-profile-'))
  const input = new PassThrough(), output = new PassThrough(), messages: unknown[] = [], exits: number[] = []
  let buffer = '', owner: Context | undefined, commit = () => {}
  output.on('data', bytes => { buffer += String(bytes); const lines = buffer.split('\n'); buffer = lines.pop()!; for (const line of lines) messages.push(JSON.parse(line)) })
  const module = join(root, 'domain.mjs'), path = join(root, 'cordis.yml')
  await writeFile(module, 'export async function createEmbeddedAigcDomain(o){return {start:async()=>({origin:"http://127.0.0.1:40123"}),invoke:async(input,signal)=>{signal.throwIfAborted();return {received:input}},close:async()=>{}}}')
  await writeFile(path, JSON.stringify([{ id: 'aigc', name: 'cordis:aigc-test', config: { domainEntry: module, resourceDirectory: root, staticDirectory: root } }]))
  try {
    const pending = boot('aigc-fixture', path, [], host => {
      owner = host
      const listeners = new Set<() => void>()
      commit = () => { for (const listener of listeners) listener() }
      provideCmdline(host, { args: [], ready: { onReady: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }, exit: code => { exits.push(code) } })
      host.loader.builtins['aigc-test'] = { ...plugin, apply: (ctx: Context, config: plugin.Config) => plugin.mountAigcPlugin(ctx, config, input, output) }
    })
    const bootstrap = JSON.stringify({ dataDirectory: root, workspaceRoots: [root], guestAuthorization: 'a'.repeat(64) })
    input.write(bootstrap.slice(0, 15)); input.write(bootstrap.slice(15) + '\n')
    await pending
    expect(owner?.get('aigcDomain')).toBeDefined()
    expect(messages).toEqual([])
    commit()
    await expect.poll(() => messages).toContainEqual({ type: 'ready', origin: 'http://127.0.0.1:40123' })
    input.write(JSON.stringify({ type: 'command', rpcId: '00000000-0000-4000-8000-000000000001', input: { operation: 'state' } }) + '\n')
    await expect.poll(() => messages).toContainEqual({ type: 'result', rpcId: '00000000-0000-4000-8000-000000000001', data: { received: { operation: 'state' } } })
    await Promise.all([owner!.fiber.dispose(), owner!.fiber.dispose()])
    expect(owner?.get('aigcDomain')).toBeUndefined()
    expect(input.listenerCount('data')).toBe(0)
    expect(input.listenerCount('end')).toBe(0)
    expect(exits).toEqual([])
  } finally { await owner?.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

it('revokes a loading fiber before the private bootstrap arrives', async () => {
  const ctx = new Context(), input = new PassThrough(), output = new PassThrough()
  provideCmdline(ctx, { args: [], ready: { onReady: () => () => {} }, exit: () => {} })
  const root = join(tmpdir(), 'aigc-never-started')
  const mounted = ctx.plugin({ ...plugin, apply: (owner: Context, config: plugin.Config) => plugin.mountAigcPlugin(owner, config, input, output) },
    { domainEntry: join(root, 'missing.mjs'), resourceDirectory: root, staticDirectory: root })
  try {
    await expect.poll(() => input.listenerCount('data')).toBe(1)
    const disposed = ctx.fiber.dispose()
    expect(await Promise.race([disposed.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 100))])).toBe(true)
    expect(input.listenerCount('data')).toBe(0)
  } finally {
    input.write(JSON.stringify({ dataDirectory: root, workspaceRoots: [root], guestAuthorization: 'a'.repeat(64) }) + '\n')
    await mounted; await ctx.fiber.dispose()
  }
})
