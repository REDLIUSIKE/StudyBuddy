import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { expect, it, vi } from 'vitest'
import { PlatformModelDirectory } from '../src/studybuddy-platform-models.ts'
import { parsePlatformPrepared, PLATFORM_PROVIDER } from '../src/studybuddy-platform-contracts.ts'
import { fixture } from './fixtures/platform.ts'
import type { PlatformRequest } from '../src/studybuddy-platform-contracts.ts'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { AttachmentId, AttachmentStore, ImageVariantId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'

const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP3sAAAAASUVORK5CYII=', 'base64')
const imageRef: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'c'.repeat(64)}`),
  mediaType: 'image/png', bytes: imageBytes.length, width: 1, height: 1,
}
class WireAttachmentStore extends AttachmentStore {
  readonly imageLimits = {
    maxImageBytes: 1024, maxImagesPerMessage: 1, maxMessageImageBytes: 1024,
    maxImagePixels: 1, maxImageDimension: 1, mediaTypes: ['image/png'] as const,
  }
  validateImage(_input: SaveImageAttachment): Promise<void> { return Promise.reject(new Error('not used by request conversion')) }
  saveImage(_input: SaveImageAttachment): Promise<ImageAttachmentRef> { return Promise.reject(new Error('not used by request conversion')) }
  readImage(ref: ImageAttachmentRef) { return Promise.resolve({ ref, data: imageBytes }) }
  override readImageRequest(ref: ImageAttachmentRef) {
    return Promise.resolve({
      variantId: ImageVariantId(`sha256:${'d'.repeat(64)}`), attachment: ref, data: imageBytes,
      mediaType: ref.mediaType, bytes: imageBytes.length, width: ref.width, height: ref.height,
      depth: 'uchar' as const, space: 'srgb' as const, hasAlpha: true,
    })
  }
}
function prepared(request: PlatformRequest, s = fixture()) {
  const material = {
      schemaVersion: 2,
      connectionId: '44444444-4444-4444-8444-444444444444',
      accountOwner: request.scope.accountId,
      deviceId: '55555555-5555-4555-8555-555555555555',
      toolId: 'dsh',
      fundingSource: 'platform',
      selectedProviderId: 'deepseek',
      gatewayOrigin: 'https://guijitongzhuo.com',
      protocol: 'openai_chat_completions',
      selectedModelId: request.exactModelId,
      authorizedModelIds: [request.exactModelId],
      authorizedModels: s.catalog.models,
      membershipRevision: s.catalog.catalogRevision,
      apiKey: 'synthetic-owned-platform-key',
      authorityHandle: '66666666-6666-4666-8666-666666666666',
      pendingBindingRevision: 'binding-r1',
      credentialRevision: 1,
      receiptRevision: 1,
      catalogRevision: s.catalog.catalogRevision,
      policyRevision: 'policy-r1',
      pendingExpiresAt: new Date(Date.now() + 300000).toISOString(),
    }
  const authority = {
    schemaVersion: 2,
    toolId: 'dsh',
    protocol: material.protocol,
    state: 'connected',
    permissionState: 'eligible',
    accountOwner: material.accountOwner,
    deviceId: material.deviceId,
    fundingSource: 'platform',
    authorizedModelIds: material.authorizedModelIds,
    authorizedModels: material.authorizedModels,
    membershipRevision: material.membershipRevision,
    bindingRevision: material.pendingBindingRevision,
    authorityHandle: material.authorityHandle,
    credentialRevision: material.credentialRevision,
    receiptRevision: material.receiptRevision,
    catalogRevision: material.catalogRevision,
    policyRevision: material.policyRevision,
    lastVerifiedAt: new Date().toISOString(),
  }
  return parsePlatformPrepared({ request, material, authority })
}
async function run(body: (f: ReturnType<typeof setup>) => Promise<void>) {
  const f = setup()
  try {
    await body(f)
  } finally {
    await f.ctx.fiber.dispose()
  }
}
function setup(rawUsage: unknown = { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 }, imageInput = false) {
  const ctx = new Context()
  new LlmRuntime(ctx)
  const attachments = new WireAttachmentStore(ctx)
  const s = fixture()
  if (imageInput) s.catalog.models[0]!.capabilityFlags.push('image_in')
  const admit = vi.fn(async (request: PlatformRequest) => prepared(request, s)),
    wire = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      expect(url).toBe('https://guijitongzhuo.com/v1/chat/completions')
      if (typeof init?.body !== 'string') throw new Error('fixture body missing')
      const body: unknown = JSON.parse(init.body)
      expect(body).toMatchObject({ model: 'deepseek-flash' })
      const rows = [
        {
          id: 'response-a',
          model: 'deepseek-flash',
          choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: 'stop' }],
        },
        {
          id: 'response-a',
          model: 'deepseek-flash',
          choices: [],
          ...(rawUsage === null ? {} : { usage: rawUsage }),
        },
      ]
      return new Response(rows.map(row => 'data: ' + JSON.stringify(row) + '\n\n').join('') + 'data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    })
  const directory = new PlatformModelDirectory(ctx, {
    trustedSession: options => (options.sessionId === 'session-a' ? 'session-a' : undefined),
    resolveAttachments: () => attachments,
    admit,
    fetch: wire,
  })
  directory.apply(s, s.hostGeneration)
  return { ctx, directory, admit, wire, s }
}
const options = () =>
  markAgentLoopRequest({
    provider: PLATFORM_PROVIDER,
    model: 'deepseek-flash',
    sessionId: 'session-a' as NonNullable<GenerateOptions['sessionId']>,
    maxTokens: 16,
    messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Reply OK.' }] }],
  })
it('reports the exact admitted image modality in both registry and prepared calls', async () => {
  const f = setup(undefined, true)
  try {
    expect((await f.ctx.llm.listModels(PLATFORM_PROVIDER))[0]?.inputModalities).toEqual(['text', 'image'])
    expect((await f.directory.prepareCall(PLATFORM_PROVIDER, 'deepseek-flash')).model.inputModalities).toEqual(['text', 'image'])
    expect(f.directory.imageToolModels()).toEqual([{ provider: PLATFORM_PROVIDER, model: 'deepseek-flash' }])
    f.directory.revoke(f.s.scope)
    expect(f.directory.imageToolModels()).toEqual([])
  } finally { await f.ctx.fiber.dispose() }
})
it('sends an attached image through the actual Pi converter with exact platform model and unchanged terminal usage', async () => {
  const f = setup(undefined, true), chunks = []
  const request: GenerateOptions = options()
  request.messages = [{ role: 'user', content: [{ type: 'text', text: 'Reply OK.' }, { type: 'image', attachment: imageRef }] }]
  try {
    for await (const chunk of f.ctx.llm.stream(request)) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 8, outputTokens: 1, totalTokens: 9 } }])
    expect(f.admit).toHaveBeenCalledOnce()
    expect(f.wire).toHaveBeenCalledOnce()
    const init = f.wire.mock.calls[0]?.[1]
    expect(typeof init?.body).toBe('string')
    const body: unknown = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model: 'deepseek-flash', messages: [{ role: 'user', content: expect.arrayContaining([
      { type: 'text', text: 'Reply OK.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBytes.toString('base64')}` } },
    ]) }] })
    expect(new Headers(init?.headers).get('X-Request-Id')).toBe(f.admit.mock.calls[0]?.[0].clientRequestId)
  } finally { await f.ctx.fiber.dispose() }
})
it('uses current image facts with the original configured Key after a catalogue metadata revision', async () => {
  const f = setup(undefined, true), previous = fixture(), chunks = []
  f.s.catalog.catalogRevision = 'harness-platform-fixture-r2'
  f.s.catalog.models[0]!.membershipRevision = f.s.catalog.catalogRevision
  f.s.catalog.models[0]!.evidenceSha256 = 'e'.repeat(64)
  f.directory.apply(f.s, f.s.hostGeneration)
  let oldMaterial: ReturnType<typeof prepared>['material'] | undefined
  f.admit.mockImplementation(async request => {
    oldMaterial = prepared({ ...request, catalogRevision: previous.catalog.catalogRevision }, previous).material
    return parsePlatformPrepared({ request, material: oldMaterial, authority: null })
  })
  const request: GenerateOptions = options()
  request.messages = [{ role: 'user', content: [{ type: 'text', text: 'Reply OK.' }, { type: 'image', attachment: imageRef }] }]
  try {
    for await (const chunk of f.ctx.llm.stream(request)) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(f.wire).toHaveBeenCalledOnce()
    expect(new Headers(f.wire.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer synthetic-owned-platform-key')
    expect(oldMaterial?.catalogRevision).toBe('harness-platform-fixture-r1')
    expect(oldMaterial?.authorizedModels[0]?.capabilityFlags).not.toContain('image_in')
    expect(f.admit.mock.calls[0]?.[0].catalogRevision).toBe('harness-platform-fixture-r2')
    expect(JSON.parse(String(f.wire.mock.calls[0]?.[1]?.body))).toMatchObject({ messages: [{ role: 'user', content: expect.arrayContaining([
      { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBytes.toString('base64')}` } },
    ]) }] })
  } finally { await f.ctx.fiber.dispose() }
})
it('keeps an unverified text route text-only and rejects direct native image dispatch before provider I/O', async () => {
  const f = setup(), request: GenerateOptions = options()
  request.messages = [{ role: 'user', content: [{ type: 'text', text: 'Reply OK.' }, { type: 'image', attachment: imageRef }] }]
  try {
    expect((await f.ctx.llm.listModels(PLATFORM_PROVIDER))[0]?.inputModalities).toEqual(['text'])
    expect(f.directory.imageToolModels()).toEqual([])
    await expect(async () => {
      for await (const _chunk of f.directory.stream(request)) { /* drain the direct adapter */ }
    }).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
    expect(f.admit).toHaveBeenCalledOnce()
    expect(f.wire).not.toHaveBeenCalled()
  } finally { await f.ctx.fiber.dispose() }
})
it.each([null, { prompt_tokens: 8 }, { completion_tokens: 1 }])('keeps platform raw usage %j unknown instead of publishing SDK zero defaults', async usage => {
  const f = setup(usage), chunks = []
  try { for await (const chunk of f.ctx.llm.stream(options())) chunks.push(chunk); expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([]) }
  finally { await f.ctx.fiber.dispose() }
})
it('records provider terminal usage once when the platform response finishes with tool calls', async () => {
  const f = setup(), chunks = []
  const request:GenerateOptions = options()
  request.tools=[{ name: 'video_read_project', description: 'Read project', parameters: { type: 'object', properties: {} } }]
  f.wire.mockImplementation(async () => new Response([
    { id: 'response-tool', model: 'deepseek-flash', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-video', type: 'function', function: { name: 'video_read_project', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] },
    { id: 'response-tool', model: 'deepseek-flash', choices: [], usage: { prompt_tokens: 20, completion_tokens: 9, total_tokens: 29, prompt_cache_hit_tokens: 5, completion_tokens_details: { reasoning_tokens: 4 } } },
  ].map(row => 'data: ' + JSON.stringify(row) + '\n\n').join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }))
  try {
    for await (const chunk of f.ctx.llm.stream(request)) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } })
    expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 15, outputTokens: 9, totalTokens: 29, cacheReadTokens: 5, reasoningTokens: 4 } }])
    expect(f.wire).toHaveBeenCalledOnce()
  } finally { await f.ctx.fiber.dispose() }
})
it('preserves exact zero platform usage only when both aggregate fields came from the provider', async () => {
  const f = setup({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }), chunks = []
  try { for await (const chunk of f.ctx.llm.stream(options())) chunks.push(chunk); expect(chunks.filter(chunk => chunk.type === 'usage')).toEqual([{ type: 'usage', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }]) }
  finally { await f.ctx.fiber.dispose() }
})
it('advertises platform models in the actual LLM registry and performs one exact native-admitted wire request', () =>
  run(async (f) => {
    expect(f.ctx.llm.listProviders()).toContainEqual({ id: PLATFORM_PROVIDER, name: 'StudyBuddy 平台模型' })
    expect(await f.ctx.llm.listModels(PLATFORM_PROVIDER)).toHaveLength(1)
    const chunks = []
    for await (const chunk of f.ctx.llm.stream(options())) chunks.push(chunk)
    expect(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'OK')).toBe(true)
    expect(f.admit).toHaveBeenCalledOnce()
    expect(f.wire).toHaveBeenCalledOnce()
    expect(new Headers(f.wire.mock.calls[0]?.[1]?.headers).get('X-Request-Id')).toBe(f.admit.mock.calls[0]?.[0].clientRequestId)
  }))
it('refuses an ordinary API caller without process-local Agent loop trust', () =>
  run(async (f) => {
    await expect(async () => {
      for await (const _chunk of f.directory.stream({ ...options() })) {
        /* drain */
      }
    }).rejects.toMatchObject({ code: 'BUILTIN_TRUST_REQUIRED' })
    expect(f.admit).not.toHaveBeenCalled()
    expect(f.wire).not.toHaveBeenCalled()
  }))
it('fences a prepared call and removes the old account models on logout', () =>
  run(async (f) => {
    const call = await f.directory.prepareCall(PLATFORM_PROVIDER, 'deepseek-flash')
    f.directory.revoke(f.s.scope)
    expect(f.ctx.llm.listProviders().some(row => row.id === PLATFORM_PROVIDER)).toBe(false)
    await expect(async () => {
      for await (const _chunk of call.stream(options())) {
        /* drain */
      }
    }).rejects.toMatchObject({ code: 'BUILTIN_PLATFORM_SCOPE_REVOKED' })
    expect(f.wire).not.toHaveBeenCalled()
  }))
it('keeps the admitted request frozen when a catalog refresh arrives before its response', () =>
  run(async (f) => {
    const original = f.admit.getMockImplementation()!
    f.admit.mockImplementation(async request => {
      const reply = await original(request)
      const next = { ...f.s, catalog: { ...f.s.catalog, catalogRevision: 'harness-platform-fixture-r2',
        models: f.s.catalog.models.map(model => ({ ...model, membershipRevision: 'harness-platform-fixture-r2' })) } }
      f.directory.apply(next, next.hostGeneration)
      return reply
    })
    const chunks = []
    for await (const chunk of f.ctx.llm.stream(options())) chunks.push(chunk)
    expect(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'OK')).toBe(true)
    expect(f.admit.mock.calls[0]?.[0].catalogRevision).toBe('harness-platform-fixture-r1')
    expect(f.wire).toHaveBeenCalledOnce()
  }))
it('preserves a rejected gateway request as an error without fabricating a returned-model mismatch', () =>
  run(async (f) => {
    f.wire.mockResolvedValue(
      Response.json(
        { error: { message: 'synthetic invalid request', type: 'invalid_request_error', code: 'invalid_request' } },
        { status: 400 },
      ),
    )
    const chunks = []
    for await (const chunk of f.directory.stream(options())) chunks.push(chunk)
    expect(chunks.filter(chunk => chunk.type === 'finish')).toHaveLength(1)
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'INVALID_REQUEST' } },
    })
  }))
