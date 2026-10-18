/** Real built Bun app, Main relay and synthetic upstream; no production credential or paid call. */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { AigcGateway } from '../../src/studybuddy/aigc-gateway.ts'
import type { AigcTextGrant } from '../../src/studybuddy/aigc-types.ts'

const [bunInput, entryInput] = process.argv.slice(2)
if (!bunInput || !entryInput) throw Error('FIXTURE_INPUT_MISSING')
const data = await mkdtemp(join(tmpdir(), 'aigc-built-text-')), root = join(data, 'workspaces/project')
await mkdir(root, { recursive: true })
const scope = { accountId: 'fixture-owner', generation: 1 }, authorization = randomBytes(32).toString('hex')
const grant: AigcTextGrant = { handle: 'a'.repeat(64), sourceLabel: 'Synthetic gateway', catalogVersion: 'fixture-1',
  catalogDigest: 'b'.repeat(64), selection: { routeId: 'fixture', sourceId: randomUUID(), localRef: 'fixture-source',
    providerId: 'kimi', exactModelId: 'fixture-model', protocol: 'openai_chat_completions', connectionId: randomUUID(),
    credentialRevision: 'credential-1', grantRevision: 'c'.repeat(64), fundingSource: 'user_api' },
  authority: { logicalModelId: 'fixture', providerId: 'kimi', exactModelId: 'fixture-model', displayName: 'Fixture',
    protocol: 'openai_chat_completions', contextWindow: 128000, maxOutputTokens: 16000, capabilityFlags: ['tool_use'],
    evidenceSha256: 'd'.repeat(64), membershipRevision: 'member-1', capabilityRevision: 'cap-1', adapterRevision: 'adapter-1',
    priceAuthorityRevision: null, availability: 'available' } }
let requests = 0, reject = false
const upstream = createServer(async (req, res) => {
  requests++
  assert.equal(req.headers['x-studybuddy-request-ticket'], undefined)
  assert.equal(req.headers.authorization, 'Bearer fixture-upstream-private-key')
  let body = ''; for await (const bytes of req) body += bytes.toString()
  assert.equal(JSON.parse(body).model, 'fixture-model')
  if (reject) { res.writeHead(500); res.end('fixture rejection'); return }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const chunk = (delta: unknown, finish: unknown) => JSON.stringify({ id: 'fixture-response', object: 'chat.completion.chunk',
    created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason: finish }] })
  res.write('data: ' + chunk({ role: 'assistant', content: 'fixture text' }, null) + '\n\n')
  res.write('data: ' + chunk({}, 'stop') + '\n\n'); res.end('data: [DONE]\n\n')
})
await new Promise<void>(accept => upstream.listen(0, '127.0.0.1', accept))
const address = upstream.address()
if (!address || typeof address === 'string') throw Error('FIXTURE_PORT_MISSING')
const gateway = new AigcGateway({ isCurrent: () => true, logRoot: join(data, 'journal'), consumer: {
  consumerCatalog: async () => [grant], consumerRequestStatus: async () => null,
  prepareConsumerRequest: async (_scope, input) => ({ frozen: { schemaVersion: 1, clientRequestId: input.clientRequestId,
    selection: grant.selection, authority: grant.authority, sessionId: input.sessionId, purpose: 'chat', requestReceipt: null }, route: { mode: 'gateway',
    routeId: 'fixture', displayName: 'Fixture', gatewayOrigin: 'https://fixture.gateway.test',
    apiKey: 'fixture-upstream-private-key', binding: {} as never } }),
}, fetch: async (url, init) => fetch('http://127.0.0.1:' + address.port + new URL(url instanceof Request ? url.url : url).pathname, init) })
const privateBridge = await gateway.start(scope)
const entry = resolve(entryInput), child = spawn(resolve(bunInput), [entry], { cwd: resolve(entry, '..'),
  windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { SystemRoot: process.env.SystemRoot, PATH: resolve(entry, '../../bin') } })
const done = once(child, 'exit'); let stderr = ''
child.stderr.on('data', (bytes) => { stderr += bytes.toString() })
try {
  const origin = await new Promise<string>((accept, fail) => {
    let buffer = ''; const timer = setTimeout(() => fail(Error('FIXTURE_READY_TIMEOUT: ' + stderr.slice(-1500))), 45000)
    child.once('exit', () => { clearTimeout(timer); fail(Error('FIXTURE_EXIT: ' + stderr.slice(-1500))) })
    child.stdout.on('data', (bytes) => {
      buffer += bytes.toString(); const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
      for (const line of lines) try {
        const value = JSON.parse(line)
        if (value.type === 'ready') { clearTimeout(timer); accept(value.origin) }
      } catch { /* Ignore non-control stdout. */ }
    })
    child.stdin.write(JSON.stringify({ dataDirectory: data, workspaceRoots: [join(data, 'workspaces')],
      guestAuthorization: authorization, gateway: privateBridge }) + '\n')
  })
  const headers = { 'x-studybuddy-aigc-guest': authorization, 'Content-Type': 'application/json' }
  const models = await (await fetch(origin + '/api/ai/models', { headers })).json()
  assert.equal(models.data[0].providerId, grant.handle)
  const generate = () => fetch(origin + '/api/ai/generate', { method: 'POST', headers, body: JSON.stringify({
    providerId: grant.handle, modelId: 'fixture-model', context: { messages: [{ role: 'user', content: 'fixture prompt', timestamp: 1 }] },
  }) })
  assert.match(await (await generate()).text(), /fixture text/)
  assert.equal(requests, 1)
  const agent = await fetch(origin + '/api/agent', { method: 'POST', headers, body: JSON.stringify({
    directory: root, providerId: grant.handle, modelId: 'fixture-model', prompt: 'fixture agent prompt', thinkingLevel: 'off',
  }) })
  const events = await agent.text()
  assert.match(events, /fixture text/)
  assert.doesNotMatch(events, /"type":"error"/)
  assert.equal(requests, 2)
  const sessions = await readdir(join(root, '.agent/sessions'))
  assert.match(await readFile(join(root, '.agent/sessions', sessions[0]!), 'utf8'), /fixture agent prompt/)
  reject = true
  assert.match(await (await generate()).text(), /AIGC_UPSTREAM_REJECTED/)
  assert.equal(requests, 3)
  console.log(JSON.stringify({ checks: ['built text relay ticket', 'built Agent exact gateway', 'saved Agent conversation',
    'no retry after dispatched rejection'], paidRequests: 0 }))
} finally {
  child.stdin.end('{"type":"shutdown"}\n'); const timer = setTimeout(() => child.kill(), 10000)
  await done; clearTimeout(timer); await gateway.revoke(); upstream.closeAllConnections()
  await new Promise<void>(accept => upstream.close(() => accept())); await rm(data, { recursive: true, force: true })
}
