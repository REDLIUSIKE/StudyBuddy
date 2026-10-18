import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import LlmRuntime, { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import * as ImageOffload from '@deepseek-ai/dsh-compaction-image-offload'
import { requireSharp } from '../../../packages/attachment/attachment-local/src/sharp.ts'
import { canonicalNativeBuiltinCatalogPayloadV1 } from '@studybuddy/contracts'
import type { NativeBuiltinCatalogApplyV1, NativeBuiltinRequestFreezeV1, NativeBuiltinPreparedRouteV1 } from '@studybuddy/contracts'
import { afterEach, expect, it, vi } from 'vitest'
import { fixture as platformFixture } from '../../../packages/llm/llm-studybuddy-builtin/tests/fixtures/platform.ts'
import type { PlatformRequest, PlatformSnapshot } from '@deepseek-ai/dsh-llm-studybuddy-builtin'
import { parsePlatformSnapshot } from '@deepseek-ai/dsh-llm-studybuddy-builtin'
import { installBuiltinHostControl } from '../src/studybuddy-builtin-models.ts'
import type { BuiltinHostControl } from '../src/studybuddy-builtin-models.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
  vi.unstubAllGlobals()
})

async function loaderHarness(onSend: (message: object, control: BuiltinHostControl) => Promise<void> = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-image-tools-'))
  const ctx = new Context()
  cleanups.push(async () => {
    await ctx.fiber.dispose()
    // This uniquely acquired test directory contains only this fixture's YAML.
    await rm(root, { recursive: true, force: true })
  })
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  let control: BuiltinHostControl | undefined
  const builtin = {
    name: 'native-owned-image-fixture', inject: ['agents', 'sessions', 'llm', 'agentDefaultModel', 'tools', 'systemPrompt'],
    apply(owner: Context) { control = installBuiltinHostControl(owner, async (message) => {
      if (!control) throw new Error('native control not loaded')
      await onSend(message, control)
    }) },
  }
  const modules = new Map<string, unknown>([
    ['agents', AgentRegistry], ['sessions', SessionStore], ['projections', SessionProjections], ['llm', LlmRuntime],
    ['prompt', SystemPrompt], ['tools', ToolRuntime], ['default-model', DefaultModel], ['loop', AgentLoop], ['native', builtin],
    ['attachments', LocalAttachmentStore], ['image-offload', ImageOffload],
  ])
  ctx.loader.internal = {
    version: 'v2', async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected fixture module ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  const config = join(root, 'cordis.yml')
  await writeFile(config, [
    '- name: agents', '- name: sessions', '- name: projections', '- name: llm', '- name: prompt', '- name: tools',
    '- name: default-model', '  config:', '    provider: ""', '    model: ""',
    '- name: attachments', '  config:', `    dshHome: ${JSON.stringify(root)}`, '- name: image-offload',
    '- name: loop', '  config:', '    agents: []', '- name: native', '',
  ].join('\n'))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  if (!control) throw new Error('native fixture was not loaded')
  return { ctx, root, control }
}

it('registers explicit image analysis tools through the real Loader composition and removes them on disposal', async () => {
  const { ctx } = await loaderHarness()
  const names = ctx.tools.schemas().map(tool => tool.name)
  expect(names).toContain('list_image_models')
  expect(names).toContain('analyze_image')
  const native = [...ctx.loader.entries()].find(entry => entry.options.name === 'native')
  await native?.fiber?.dispose()
  expect(ctx.tools.schemas().map(tool => tool.name)).not.toContain('analyze_image')
  expect(ctx.tools.schemas().map(tool => tool.name)).not.toContain('list_image_models')
})

const scope = { accountId: '11111111-1111-4111-8111-111111111111', generation: 1 }
const sourceId = '22222222-2222-4222-8222-222222222222'
const privateProvider = 'sb-image-fixture-source'
const gatewayOrigin = 'https://guijitongzhuo.com'
const models = (membershipRevision: string) => [
  { logicalModelId: 'dsh.deepseek.text-model.chat', providerId: 'deepseek' as const, exactModelId: 'text-model', displayName: 'Fixture Text',
    protocol: 'openai_chat_completions' as const, contextWindow: 4096, maxOutputTokens: 128,
    capabilityFlags: ['tool_use'] as const, evidenceSha256: 'b'.repeat(64), membershipRevision,
    capabilityRevision: 'capability-1', adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available' as const },
  { logicalModelId: 'dsh.deepseek.vision-model.chat', providerId: 'deepseek' as const, exactModelId: 'vision-model', displayName: 'Fixture Vision',
    protocol: 'openai_chat_completions' as const, contextWindow: 4096, maxOutputTokens: 128,
    capabilityFlags: ['image_in'] as const, evidenceSha256: 'b'.repeat(64), membershipRevision,
    capabilityRevision: 'capability-1', adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available' as const },
]

async function publishPrivate(control: BuiltinHostControl) {
  const route: NativeBuiltinPreparedRouteV1 = {
    mode: 'gateway', routeId: privateProvider, displayName: 'Fixture private connection', gatewayOrigin, apiKey: 'synthetic-owned-private-key',
    binding: {
      schemaVersion: 1, userId: 1, tokenId: 1, connectionId: sourceId,
      operationId: '44444444-4444-4444-8444-444444444444', policyRevision: 'policy-1', tokenGroup: 'user-api',
      pendingExpiresAt: 2_000_000_000, authorityExpiresAt: 4_000_000_000,
      state: 'active', hostCatalogVersion: null,
      grant: {
        schemaVersion: 1, grantRevision: 'a'.repeat(64), catalogRevision: 'catalog-1',
        scope: { backendInstanceId: 'backend-1', accountOwner: scope.accountId,
          deviceId: '33333333-3333-4333-8333-333333333333', sourceId, localRef: privateProvider, providerId: 'deepseek',
          credentialReference: 'credential-ref', credentialRevision: 'credential-1', baseUrl: 'https://api.deepseek.com',
          protocol: 'openai_chat_completions', consumerId: 'studybuddy_harness', consumerVersion: '1', fundingSource: 'user_api' },
        allowedModels: models('membership-1'),
      },
    },
  }
  const payload: NativeBuiltinCatalogApplyV1 = {
    schemaVersion: 1, scope, hostGeneration: control.hostGeneration,
    operationId: '55555555-5555-4555-8555-555555555555', catalogVersion: 'catalog-1', catalogDigest: 'c'.repeat(64), routes: [route],
  }
  const catalog = { ...payload, catalogDigest: createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(payload)).digest('hex') }
  const applied = await control.command('apply', catalog)
  await control.command('publish', { schemaVersion: 1, readiness: {
    schemaVersion: 1, operationId: catalog.operationId, localRef: privateProvider, sourceRevision: 'e'.repeat(64),
    state: 'ready', phase: 'ready', catalogVersion: catalog.catalogVersion, catalogDigest: catalog.catalogDigest,
    hostApplied: applied, appliedModels: (applied as { applied: unknown }).applied, errorCode: null,
  } })
}

function platformSnapshot(control: BuiltinHostControl): PlatformSnapshot {
  const original = platformFixture()
  return parsePlatformSnapshot({ ...original, scope, hostGeneration: control.hostGeneration, catalog: {
    ...original.catalog, models: models(original.catalog.catalogRevision).map(model => ({
      logicalModelId: model.logicalModelId, providerId: model.providerId, exactModelId: model.exactModelId,
      displayName: model.displayName, protocol: model.protocol, contextWindow: model.contextWindow, maxOutputTokens: model.maxOutputTokens,
      capabilityFlags: model.capabilityFlags, evidenceSha256: model.evidenceSha256, membershipRevision: model.membershipRevision,
      availability: model.availability, toolId: 'dsh' as const,
    })),
  } })
}
function platformReply(request: PlatformRequest, snapshot: PlatformSnapshot) {
  return { request, authority: null, material: {
    schemaVersion: 2, connectionId: sourceId, accountOwner: scope.accountId,
    deviceId: '33333333-3333-4333-8333-333333333333', toolId: 'dsh', fundingSource: 'platform', selectedProviderId: 'deepseek',
    gatewayOrigin, protocol: 'openai_chat_completions', selectedModelId: request.exactModelId,
    authorizedModelIds: snapshot.catalog.models.map(model => model.exactModelId), authorizedModels: snapshot.catalog.models,
    membershipRevision: snapshot.catalog.catalogRevision, apiKey: 'synthetic-owned-platform-key',
    authorityHandle: '66666666-6666-4666-8666-666666666666', pendingBindingRevision: 'binding-1',
    credentialRevision: 1, receiptRevision: 1, catalogRevision: snapshot.catalog.catalogRevision,
    policyRevision: 'policy-1', pendingExpiresAt: new Date(Date.now() + 300000).toISOString(),
  } }
}

interface WireCall { model: string; body: Record<string, unknown>; requestId: string | null; key: string | null }
async function conversation(funding: 'platform' | 'user_api', helperResult: 'complete' | 'missing-usage' | 'truncated' | 'large-multibyte' = 'complete', admissionBarrier?: Promise<void>) {
  const admissions: { model: string; session: string; requestId: string; funding: string }[] = []
  const snapshots: { id: string; events: readonly SessionEvent[]; header: SessionHeader }[] = []
  let platform: PlatformSnapshot | undefined
  const f = await loaderHarness(async (message, control) => {
    const data = message as { type?: string; request?: NativeBuiltinRequestFreezeV1 | PlatformRequest }
    if (data.type === 'builtin-admit' && data.request && 'selection' in data.request) {
      const request = data.request
      admissions.push({ model: request.selection.exactModelId, session: String(request.sessionId),
        requestId: request.clientRequestId, funding: request.selection.fundingSource })
      if (admissionBarrier) await admissionBarrier
      control.admissionResult({ clientRequestId: request.clientRequestId, data: {
        schemaVersion: 1, clientRequestId: request.clientRequestId, selection: request.selection, authority: request.authority,
        sessionId: request.sessionId, purpose: request.purpose, requestReceipt: null,
      } })
    } else if (data.type === 'platform-admit' && data.request && 'exactModelId' in data.request && platform) {
      const request = data.request
      admissions.push({ model: request.exactModelId, session: request.sessionId, requestId: request.clientRequestId, funding })
      if (admissionBarrier) await admissionBarrier
      control.platformAdmissionResult({ clientRequestId: request.clientRequestId, data: platformReply(request, platform) })
    } else throw new Error('unexpected native fixture IPC')
  })
  f.ctx.on('session/flush', (session) => { snapshots.push({ id: String(session.id), header: session.header, events: session.snapshotEvents() }) })
  if (funding === 'user_api') await publishPrivate(f.control)
  else { platform = platformSnapshot(f.control); await f.control.command('platform-apply', platform) }
  const provider = funding === 'platform' ? 'studybuddy-platform' : privateProvider
  const sharp = requireSharp()
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#00ff00' } }).png().toBuffer()
  const ref = await f.ctx.attachments.saveImage({ mediaType: 'image/png', data: image })
  const foreign = await f.ctx.attachments.saveImage({ mediaType: 'image/png', data: await sharp({ create: { width: 2, height: 2, channels: 3, background: '#0000ff' } }).png().toBuffer() })
  const handle = await f.ctx.agents.create({ sessionId: SessionId('image-parent'), agentOptions: { provider, model: 'text-model', maxTokens: 64 } })
  const calls: WireCall[] = []
  let textSteps = 0
  const wire = vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url !== gatewayOrigin + '/v1/chat/completions' || typeof init?.body !== 'string') throw new Error('unexpected paid/network route in keyless fixture')
    const body = JSON.parse(init.body) as Record<string, unknown>, model = String(body.model), headers = new Headers(init.headers)
    calls.push({ model, body, requestId: headers.get('X-Request-Id'), key: headers.get('authorization') })
    let delta: object, finish = 'stop'
    if (model === 'vision-model') { delta = { content: helperResult === 'large-multibyte' ? '图'.repeat(11000) : 'The image contains a green pixel.' }; if (helperResult === 'truncated') finish = 'length' }
    else if (model === 'text-model') {
      textSteps++
      const name = textSteps === 1 ? 'list_image_models' : 'analyze_image'
      delta = textSteps > 2 ? { content: 'I used the visual helper and continue on the original text model.' } : {
        tool_calls: [{ index: 0, id: `image-call-${textSteps}`, type: 'function', function: {
          name, arguments: JSON.stringify(name === 'list_image_models' ? {} : { provider, model: 'vision-model', attachment_id: ref.attachmentId, question: 'Describe the pixel.' }),
        } }],
      }
      if (textSteps <= 2) finish = 'tool_calls'
    } else throw new Error('unexpected fixture model')
    const rows = [{ id: `response-${calls.length}`, model, choices: [{ index: 0, delta, finish_reason: finish }] },
      { id: `response-${calls.length}`, model, choices: [], ...(model === 'vision-model' && helperResult === 'missing-usage' ? {} : { usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }) }]
    return new Response(rows.map(row => `data: ${JSON.stringify(row)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', wire)
  return { ...f, provider, admissions, calls, snapshots, agent: handle.agent, ref, foreign, image, handle, wire }
}

function analyzeArgs(f: Awaited<ReturnType<typeof conversation>>) {
  return { provider: f.provider, model: 'vision-model', attachment_id: String(f.ref.attachmentId), question: 'Describe the pixel.' }
}
async function execute(f: Awaited<ReturnType<typeof conversation>>, args: object,
  signal = new AbortController().signal, agent: Agent | null = f.agent) {
  return f.ctx.tools.execute({ callId: ToolCallId('explicit-test-call'), name: 'analyze_image', arguments: args, signal, ...agent === null ? {} : { agent } })
}
function appendImage(f: Awaited<ReturnType<typeof conversation>>) {
  f.agent.session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'image', attachment: f.ref, offloaded: true }] }), { surfaceOp: 'append' })
}

it.each(['platform', 'user_api'] as const)('runs image analysis through the real Loader, original Agent loop, exact %s admission and trusted terminal usage, then continues the original text model', async (funding) => {
  const f = await conversation(funding)
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Describe this image.' }, { type: 'image', attachment: f.ref }] }))
  await f.agent.whenIdle()
  const events = f.agent.session.snapshotEvents()
  expect(events.findLast(event => event.type === 'turn/end')).toMatchObject({ data: { reason: { kind: 'completed' } } })
  const results = events.filter(event => event.type === 'tool/result')
  expect(results).toHaveLength(2)
  expect(results[1]).toMatchObject({ data: { message: { isError: false, content: [{ type: 'text', text: JSON.stringify({ provider: f.provider, model: 'vision-model', analysis: 'The image contains a green pixel.' }) }] } } })
  const user = events.find(event => event.type === 'user/message')
  if (user?.type !== 'user/message') throw new Error('original user receipt was not admitted')
  expect(user.data.content).toContainEqual({ type: 'image', attachment: f.ref, offloaded: true })
  const received = events.find(event => event.type === 'agent/inbox/spliced' && event.data.inserted.some(message => message.content.some(block => block.type === 'image')))
  const system = events.find(event => event.type === 'system/message')
  expect(received?.seq).toBeLessThan(system!.seq)
  expect(JSON.stringify(system?.data)).toContain(f.ref.attachmentId)
  expect(f.calls.map(call => call.model)).toEqual(['text-model', 'text-model', 'vision-model', 'text-model'])
  expect(f.admissions.map(call => call.funding)).toEqual([funding, funding, funding, funding])
  expect(f.calls.map(call => call.requestId)).toEqual(f.admissions.map(call => call.requestId))
  expect(new Set(f.calls.map(call => call.key))).toEqual(new Set([funding === 'platform' ? 'Bearer synthetic-owned-platform-key' : 'Bearer synthetic-owned-private-key']))
  const vision = f.calls.find(call => call.model === 'vision-model')!
  expect(JSON.stringify(vision.body.messages)).toContain('data:image/png;base64,')
  expect(vision.body.tools ?? []).toEqual([])
  for (const call of f.calls.filter(call => call.model === 'text-model')) {
    expect(JSON.stringify(call.body.messages)).toContain(f.ref.attachmentId)
    expect(JSON.stringify(call.body.messages)).not.toContain('data:image/')
    expect(call.body.model).toBe('text-model')
  }
  const helper = f.snapshots.findLast(row => row.id !== 'image-parent')
  expect(helper?.header).toMatchObject({ parentSession: 'image-parent', origin: 'subagent' })
  const helperMessage = helper?.events.find(event => event.type === 'assistant/message')
  if (helperMessage?.type !== 'assistant/message') throw new Error('helper reported no assistant result')
  expect(helperMessage.data.usage).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 })
  expect(f.ctx.agents.get(SessionId(String(helper?.id)))).toBeUndefined()
  expect(f.agent.session.requestHeader()?.config).toMatchObject({ provider: f.provider, model: 'text-model' })
  const replay = Session.create(f.agent.session.id, events, f.agent.session.header, undefined, f.ctx.sessions.messageProjections)
  expect(replay.deriveMessages()).toEqual(f.agent.session.deriveMessages())
  expect(replay.requestHeader()).toEqual(f.agent.session.requestHeader())
  const imagePath = f.ctx.attachments.imageHostPath(f.ref)
  if (imagePath === undefined) throw new Error('real local image store has no object path')
  expect(await readFile(imagePath)).toEqual(Buffer.from((await f.ctx.attachments.readImage(f.ref)).data))
})

it.each(['missing-usage', 'truncated', 'large-multibyte'] as const)('rejects helper %s as incomplete while preserving its original request audit', async (result) => {
  const f = await conversation('user_api', result)
  appendImage(f)
  const outcome = await execute(f, analyzeArgs(f))
  expect(outcome).toMatchObject({ isError: true, error: { info: { code: 'IMAGE_TOOL_INCOMPLETE' } } })
  expect(f.admissions).toHaveLength(1)
  expect(f.calls).toHaveLength(1)
})

it.each(['cancel', 'revoke', 'dispose-parent'] as const)('stops %s during local image read before creating or admitting a helper', async (action) => {
  const f = await conversation('user_api')
  appendImage(f)
  const stored = await f.ctx.attachments.readImage(f.ref), read = Promise.withResolvers<typeof stored>()
  const reader = vi.spyOn(f.ctx.attachments, 'readImage').mockReturnValueOnce(read.promise)
  const abort = new AbortController(), running = execute(f, analyzeArgs(f), abort.signal)
  await vi.waitFor(() => { expect(reader).toHaveBeenCalledOnce() })
  if (action === 'cancel') abort.abort(new DOMException('fixture canceled', 'AbortError'))
  else if (action === 'revoke') await f.control.command('revoke', { scope, localRef: privateProvider })
  else await f.handle.dispose()
  read.resolve(stored)
  expect(await running).toMatchObject({ isError: true })
  expect(f.admissions).toHaveLength(0)
  expect(f.calls).toHaveLength(0)
  expect(f.ctx.agents.list().filter(agent => agent.id !== 'image-parent')).toEqual([])
})

it.each(['cancel', 'revoke'] as const)('fences %s while native admission waits and rejects a late receipt before any provider fetch', async (action) => {
  const barrier = Promise.withResolvers<undefined>()
  const f = await conversation('user_api', 'complete', barrier.promise)
  appendImage(f)
  const abort = new AbortController(), running = execute(f, analyzeArgs(f), abort.signal)
  await vi.waitFor(() => { expect(f.admissions).toHaveLength(1) })
  if (action === 'cancel') abort.abort(new DOMException('fixture canceled', 'AbortError'))
  else await f.control.command('revoke', { scope, localRef: privateProvider })
  barrier.resolve(undefined)
  expect(await running).toMatchObject({ isError: true })
  expect(f.calls).toHaveLength(0)
  expect(f.ctx.agents.list().map(agent => String(agent.id))).toEqual(['image-parent'])
})

it('propagates original Agent cancellation to its active helper and records no late successful result or extra dispatch', async () => {
  const f = await conversation('platform')
  const original = f.wire.getMockImplementation()!
  const started = Promise.withResolvers<undefined>(), late = Promise.withResolvers<Response>()
  let helperAbort = false
  f.wire.mockImplementation(async (input, init) => {
    const response = await original(input, init)
    if (typeof init?.body !== 'string' || (JSON.parse(init.body) as { model: string }).model !== 'vision-model') return response
    started.resolve(undefined)
    return new Promise<Response>((resolve, reject) => {
      const aborted = () => { helperAbort = true; reject(new DOMException('fixture canceled', 'AbortError')) }
      init.signal?.addEventListener('abort', aborted, { once: true })
      void late.promise.then(resolve).finally(() => { init.signal?.removeEventListener('abort', aborted) })
    })
  })
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'image', attachment: f.ref }] }))
  await started.promise
  f.agent.cancel({ kind: 'user' })
  await f.agent.whenIdle()
  late.resolve(new Response('late ignored'))
  await Promise.resolve()
  expect(helperAbort).toBe(true)
  expect(f.calls.map(call => call.model)).toEqual(['text-model', 'text-model', 'vision-model'])
  expect(f.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end')).toMatchObject({ data: { reason: { kind: 'aborted' } } })
  expect(f.ctx.agents.list().map(agent => String(agent.id))).toEqual(['image-parent'])
})

it('cancels an active helper when its native plugin unloads and removes its tool registrations', async () => {
  const f = await conversation('platform')
  appendImage(f)
  const original = f.wire.getMockImplementation()!, started = Promise.withResolvers<undefined>(), late = Promise.withResolvers<Response>()
  let helperAbort = false
  f.wire.mockImplementation(async (input, init) => {
    const response = await original(input, init)
    started.resolve(undefined)
    return new Promise<Response>((resolve, reject) => {
      const aborted = () => { helperAbort = true; reject(new DOMException('fixture canceled', 'AbortError')) }
      init?.signal?.addEventListener('abort', aborted, { once: true })
      void late.promise.then(resolve).finally(() => { init?.signal?.removeEventListener('abort', aborted) })
      void response
    })
  })
  const running = execute(f, analyzeArgs(f))
  await started.promise
  const native = [...f.ctx.loader.entries()].find(entry => entry.options.name === 'native')
  const disposal = native?.fiber?.dispose()
  try {
    await vi.waitFor(() => { expect(helperAbort).toBe(true) })
  } finally {
    late.resolve(new Response('late ignored'))
    await running
    await disposal
  }
  expect(await running).toMatchObject({ isError: true })
  expect(f.ctx.agents.list().map(agent => String(agent.id))).toEqual(['image-parent'])
  expect(f.ctx.tools.schemas().map(tool => tool.name)).not.toContain('analyze_image')
})

it('denies invented/cross-source helpers, foreign attachments, and missing live conversation before native admission', async () => {
  const f = await conversation('user_api')
  appendImage(f)
  for (const args of [
    { ...analyzeArgs(f), model: 'invented' }, { ...analyzeArgs(f), provider: 'studybuddy-platform' },
    { ...analyzeArgs(f), attachment_id: f.foreign.attachmentId },
  ]) expect(await execute(f, args)).toMatchObject({ isError: true })
  expect(await execute(f, analyzeArgs(f), new AbortController().signal, null)).toMatchObject({ isError: true })
  expect(f.calls).toHaveLength(0)
  expect(f.admissions).toHaveLength(0)
})

it('offloads only the real committed history image node and replays the unchanged original image reference', async () => {
  const f = await conversation('user_api')
  const image = f.agent.session.append('user/message', createUserMessage({ source: { kind: 'user' },
    content: [{ type: 'image', attachment: f.ref }] }), { surfaceOp: 'append' })
  f.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Describe the previous image.' }] }))
  await f.agent.whenIdle()
  const events = f.agent.session.snapshotEvents(), decisions = events.filter(event => event.type === 'image/offload')
  expect(decisions).toHaveLength(1)
  expect(decisions[0]?.data).toEqual({ targets: [{ seq: image.seq, imageIndexes: [0] }] })
  expect(image.data.content).toEqual([{ type: 'image', attachment: f.ref }])
  const replay = Session.create(f.agent.session.id, events, f.agent.session.header, undefined, f.ctx.sessions.messageProjections)
  expect(replay.deriveMessages()).toEqual(f.agent.session.deriveMessages())
  expect(f.calls.map(call => call.model)).toEqual(['text-model', 'text-model', 'vision-model', 'text-model'])
})

it('excludes a replaced image from the current reference projection before helper admission', async () => {
  const f = await conversation('user_api')
  const old = f.agent.session.append('user/message', createUserMessage({ source: { kind: 'user' },
    content: [{ type: 'image', attachment: f.ref }] }), { surfaceOp: 'append' })
  f.agent.session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Replacement.' }] }),
    { surfaceOp: { op: 'replace', startSeq: old.seq, endSeq: old.seq }, sourceEventSeqs: [old.seq] })
  expect(await execute(f, analyzeArgs(f))).toMatchObject({ isError: true, error: { info: { code: 'IMAGE_TOOL_ATTACHMENT_DENIED' } } })
  expect(f.admissions).toHaveLength(0)
  expect(f.calls).toHaveLength(0)
})
