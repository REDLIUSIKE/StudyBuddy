import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChildProcess } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { expect, it } from 'vitest'
import { AigcDomainRuntime } from '../src/studybuddy/aigc-domain-runtime.ts'

it('launches the sealed Node profile, correlates Unicode results and revokes before owned exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-owned-node-')), scope = { accountId: 'account-a', generation: 1 }
  const child = Object.assign(new ChildProcess(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null }) as ChildProcessWithoutNullStreams & { stdout: PassThrough }
  const writes: string[] = [], launches: unknown[] = []
  child.stdin.on('data', bytes => { writes.push(String(bytes)) })
  const runtime = new AigcDomainRuntime({ userDataRoot: root, isCurrent: value => value.accountId === scope.accountId && value.generation === scope.generation,
    resources: async () => ({ directory: root, node: join(root, 'shared/node.exe'), entry: join(root, 'shared/dsh.js'), plugin: join(root, 'shared/aigc-plugin.js'),
      domainEntry: join(root, 'server/domain.js'), staticDirectory: join(root, 'web'), manifestSha256: 'a'.repeat(64) }),
    gateway: async () => undefined, native: async (_scope, operation, input) => ({ operation, input }), invalidated: () => {},
    launch: (exe, args, options) => { launches.push({ exe, args, options }); return child } })
  let exited = false
  try {
    const starting = runtime.ensure(scope)
    await expect.poll(() => writes.length).toBeGreaterThan(0)
    const bootstrap = JSON.parse(writes[0]!)
    expect(JSON.stringify(launches)).not.toContain(bootstrap.guestAuthorization)
    expect(launches[0]).toMatchObject({ exe: join(root, 'shared/node.exe'), args: [join(root, 'shared/dsh.js'), '--profile', 'studybuddy-aigc'] })
    child.stdout.write('{"type":"ready","origin":"http://127.0.0.1:41234"}\n')
    await starting
    const controller = new AbortController(), pending = runtime.invoke(scope, { operation: 'state' }, controller.signal)
    await expect.poll(() => writes.length).toBe(2)
    const command = JSON.parse(writes[1]!)
    const result = Buffer.from(JSON.stringify({ type: 'result', rpcId: command.rpcId, data: { text: '中文🙂' } }) + '\n')
    const split = result.indexOf(Buffer.from('中')) + 1
    child.stdout.write(result.subarray(0, split)); child.stdout.write(result.subarray(split))
    expect(await pending).toEqual({ text: '中文🙂' })
    await writeFile(join(bootstrap.dataDirectory, 'workspaces/original.json'), 'saved')
    const cleanup = runtime.revoke()
    expect(runtime.requestHeaders(scope, 'http://127.0.0.1:41234/', 'http://127.0.0.1:41234/')).toEqual({})
    await expect.poll(() => writes.some(line => line.includes('shutdown'))).toBe(true)
    Object.assign(child, { exitCode: 0 }); child.emit('exit', 0, null); exited = true
    await cleanup
    expect(await readFile(join(bootstrap.dataDirectory, 'workspaces/original.json'), 'utf8')).toBe('saved')
  } finally {
    if (!exited) { Object.assign(child, { exitCode: 0 }); child.emit('exit', 0, null) }
    await runtime.revoke(); await rm(root, { recursive: true, force: true })
  }
})
