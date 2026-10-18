import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadAigcNativeResources } from '../src/studybuddy/aigc-native-resources.ts'
import { AigcDomainRuntime } from '../src/studybuddy/aigc-domain-runtime.ts'
import { accountAigcDirectory } from '../src/studybuddy/aigc-data.ts'
it('loads the complete candidate in its real sealed dsh profile on shared Node and tears it down', async () => {
  const directory = resolve(process.env.AIGC_ASSEMBLED_DIRECTORY ?? '.dsh-build/studybuddy-aigc-development'), bytes = await readFile(join(directory, 'manifest.json')), manifest = JSON.parse(bytes.toString('utf8'))
  const pin = { manifestSha256: createHash('sha256').update(bytes).digest('hex'), sourceCommit: manifest.sourceCommit, sourceDigest: manifest.sourceDigest, lockDigest: manifest.lockDigest }
  const root = await mkdtemp(join(tmpdir(), 'aigc-profile-')), scope = { accountId: 'fixture', generation: 1 }, children: ReturnType<typeof spawn>[] = []
  const resources = await loadAigcNativeResources(directory, pin, { primaryRuntimeDirectory: resolve('apps/desktop/.desktop-build/targets/win-x64/runtime/primary-runtime'),
    dshDirectory: resolve('apps/desktop/.desktop-build/development/project'), workspaceDirectory: process.cwd() })
  const runtime = new AigcDomainRuntime({ userDataRoot: root, resources: async () => resources, isCurrent: () => true, gateway: async () => undefined,
    native: async () => { throw Error('AIGC_UNPAID_TEST_NO_NATIVE_CALLS') }, invalidated: () => {}, launch: (file, args, options) => { const child = spawn(file, [...args], options); children.push(child); return child } })
  try {
    const { origin } = await runtime.ensure(scope), response = await fetch(origin, { headers: runtime.requestHeaders(scope, origin, origin) })
    expect(response.ok).toBe(true); expect(await response.text()).toContain('<html')
    expect((await fetch(origin)).status).toBe(401)
    const project = join(accountAigcDirectory(root, scope.accountId), 'workspaces', 'assembly'); await mkdir(project, { recursive: true })
    const sessionId = 'session-00000000-0000-4000-8000-000000000001'
    const catalog = await runtime.invoke(scope, { operation: 'catalog', directory: project, sessionId }, new AbortController().signal) as { tools: { name: string; schemaSha256: string }[] }
    expect(catalog.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['read', 'write', 'edit', 'browser', 'askUser', 'getDocument', 'writeDocument', 'memory']))
    const references = await fetch(origin + '/api/native/referenceSource?operation=canvases&directory=' + encodeURIComponent(project), { headers: runtime.requestHeaders(scope, origin, origin) })
    expect(references.ok).toBe(true)
    const execute = (name: string, args: object) => runtime.invoke(scope, { operation: 'execute', directory: project, sessionId, name, callId: 'assembly-' + name, arguments: args,
      schemaSha256: catalog.tools.find(tool => tool.name === name)!.schemaSha256, canvasId: null, expectedRevision: 0 }, new AbortController().signal).catch(error => { throw Error('ASSEMBLY_' + name + ': ' + error.message) })
    const wave = Buffer.alloc(3244); wave.write('RIFF'); wave.writeUInt32LE(3236, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(3200, 40)
    await writeFile(join(project, 'tone.wav'), wave)
    await execute('ffmpeg', { steps: [{ method: 'input', args: ['tone.wav'] }, { method: 'output', args: ['tone.mp3'] }], operation: { method: 'run', args: [] } })
    expect((await readFile(join(project, 'tone.mp3'))).length).toBeGreaterThan(100)
    const probe = await execute('ffprobe', { path: 'tone.mp3' }) as { content: { text?: string }[] }; expect(probe.content[0]?.text).toContain('mp3')
    const browser = await execute('browser', { action: 'open', url: origin }) as { content: { text?: string }[] }
    const browserSessionId = JSON.parse(browser.content[0]!.text!).browserSessionId; expect(typeof browserSessionId).toBe('string')
    const watching = new AbortController(), stream = await fetch(origin + '/api/browser/stream?directory=' + encodeURIComponent(project) + '&sessionId=' + encodeURIComponent(browserSessionId), { headers: { ...runtime.requestHeaders(scope, origin, origin), origin, 'x-toonflow-workspace': '1' }, signal: watching.signal })
    expect(stream.ok).toBe(true); expect(stream.headers.get('content-type')).toContain('application/x-ndjson'); watching.abort(); await stream.body?.cancel().catch(() => {})
    await execute('browser', { action: 'close', browserSessionId })
    expect(children).toHaveLength(1); expect(children[0]!.spawnfile).toBe(resources.node)
    expect(children[0]!.spawnargs.join(' ')).toContain('--profile studybuddy-aigc')
  } finally { await runtime.revoke(); await rm(root, { recursive: true, force: true, maxRetries: 5 }) }
  expect(children.every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true)
}, 90000)
