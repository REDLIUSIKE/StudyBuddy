/** Account-owned conversational media bridge; the backend alone executes and bills generation. */
import { createHash } from 'node:crypto'
import { HARNESS_IMAGE_MODELS, HARNESS_VIDEO_MODEL, parseHarnessMediaInvocationV1 } from '@studybuddy/contracts'
import type { OwnedScope, HarnessMediaContextV1, HarnessMediaTaskV1, HarnessMediaContentV1, HarnessMediaKind, HarnessCapabilityCallerV1 } from '@studybuddy/contracts'

export interface MediaRequestRecord {
  schemaVersion: 1; accountId: string; sessionId: string; requestId: string
  kind: HarnessMediaKind; modelId: string; inputHash: string
}
export interface MediaRequestJournal {
  claim(row: MediaRequestRecord): Promise<{ row: MediaRequestRecord; created: boolean }>
  get(accountId: string, requestId: string): Promise<MediaRequestRecord | null>
}
interface Dependencies {
  scope(): OwnedScope | undefined
  api: {
    request(scope: OwnedScope, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown>
    content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response>
  }
  journal: MediaRequestJournal
}
const fail = (code: string): never => { throw Error(code) }
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('HARNESS_MEDIA_RESPONSE_INVALID')
  return value as Record<string, unknown>
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const base = (kind: HarnessMediaKind) => kind === 'image' ? '/images' : ''

/** All methods capture the actual Main account and the private Host generation. */
export class HarnessMediaBridge {
  constructor(private readonly deps: Dependencies) {}

  private assert(context: HarnessMediaContextV1, hostGeneration: string, signal?: AbortSignal): void {
    const scope = this.deps.scope()
    if (!scope || context.hostGeneration !== hostGeneration || scope.accountId !== context.scope.accountId ||
      scope.generation !== context.scope.generation) fail('HARNESS_MEDIA_SCOPE_REVOKED')
    signal?.throwIfAborted()
  }
  private async model(context: HarnessMediaContextV1, kind: HarnessMediaKind, modelId: string,
    hostGeneration: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const document = record(await this.deps.api.request(context.scope, base(kind) + '/catalog', undefined, signal))
    this.assert(context, hostGeneration, signal)
    if (document.schemaVersion !== 1 || !Array.isArray(document.models)) return fail('HARNESS_MEDIA_RESPONSE_INVALID')
    const matches = document.models.map(record).filter(row => row.modelId === modelId && row.type === kind)
    const model = matches[0]
    if (matches.length !== 1 || !model || typeof model.providerId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(model.providerId)) return fail('HARNESS_MEDIA_MODEL_UNAVAILABLE')
    return model
  }
  private project(value: unknown, row: MediaRequestRecord): HarnessMediaTaskV1 {
    const response = record(value)
    if (response.schemaVersion !== 1 || response.requestId !== row.requestId || response.modelId !== row.modelId ||
      !['queued', 'in_progress', 'completed', 'failed', 'unknown'].includes(String(response.state))) {
      return fail('HARNESS_MEDIA_RESPONSE_INVALID')
    }
    return { schemaVersion: 1, requestId: row.requestId, sessionId: row.sessionId, kind: row.kind,
      modelId: row.modelId, state: response.state as HarnessMediaTaskV1['state'],
      contentAvailable: response.state === 'completed' && response.contentAvailable === true }
  }
  private async lookup(context: HarnessMediaContextV1, input: { requestId: string; kind: HarnessMediaKind },
    hostGeneration: string, signal?: AbortSignal): Promise<MediaRequestRecord> {
    const row = await this.deps.journal.get(context.scope.accountId, input.requestId)
    this.assert(context, hostGeneration, signal)
    if (!row || row.accountId !== context.scope.accountId || row.sessionId !== context.sessionId || row.kind !== input.kind ||
      row.requestId !== input.requestId) return fail('HARNESS_MEDIA_TASK_NOT_FOUND')
    return row
  }
  private async status(context: HarnessMediaContextV1, row: MediaRequestRecord, host: string,
    signal?: AbortSignal): Promise<HarnessMediaTaskV1> {
    const value = await this.deps.api.request(context.scope, base(row.kind) + '/requests/' + row.requestId, undefined, signal)
    this.assert(context, host, signal)
    return this.project(value, row)
  }

  /** Private IPC operation; no credential, URL or funding override is accepted. */
  async handle(value: unknown, hostGeneration: string, signal?: AbortSignal): Promise<unknown> {
    const request = parseHarnessMediaInvocationV1(value), context = request.context
    this.assert(context, hostGeneration, signal)
    if (request.operation === 'catalog') {
      const imageModels = []
      for (const id of HARNESS_IMAGE_MODELS) {
        const model = await this.model(context, 'image', id, hostGeneration, signal)
        imageModels.push({ modelId: id, label: typeof model.label === 'string' ? model.label : id, sizes: ['1K', '1.5K', '2K'] })
      }
      const model = await this.model(context, 'video', HARNESS_VIDEO_MODEL, hostGeneration, signal)
      return { schemaVersion: 1, imageModels, videoModels: [{ modelId: HARNESS_VIDEO_MODEL,
        label: typeof model.label === 'string' ? model.label : HARNESS_VIDEO_MODEL }] }
    }
    if (request.operation === 'create-image' || request.operation === 'create-video') {
      const kind = request.operation === 'create-image' ? 'image' : 'video'
      const input = request.input, row: MediaRequestRecord = { schemaVersion: 1,
        accountId: context.scope.accountId, sessionId: context.sessionId, requestId: input.requestId,
        kind, modelId: input.modelId, inputHash: hash(input) }
      const claimed = await this.deps.journal.claim(row)
      this.assert(context, hostGeneration, signal)
      if (JSON.stringify(claimed.row) !== JSON.stringify(row)) fail('HARNESS_MEDIA_REQUEST_CONFLICT')
      // Once claimed, every repeated invocation can only query the original request.
      if (!claimed.created) return this.status(context, row, hostGeneration, signal)
      const model = await this.model(context, kind, input.modelId, hostGeneration, signal)
      const body = request.operation === 'create-image'
        ? { ...request.input, handle: model.providerId }
        : { requestId: request.input.requestId, handle: model.providerId, prompt: request.input.prompt,
          duration: request.input.duration, resolution: request.input.resolution, ratio: request.input.ratio,
          generateAudio: request.input.generateAudio, mode: 'text', images: [] }
      let response: unknown
      try { response = await this.deps.api.request(context.scope, base(kind) + '/requests', body, signal) }
      catch (error) {
        this.assert(context, hostGeneration, signal)
        const code = error instanceof Error ? error.message : ''
        if (['AIGC_AUTH_REQUIRED', 'AIGC_ACCESS_REQUIRED', 'AIGC_IMAGE_UNAVAILABLE', 'AIGC_VIDEO_UNAVAILABLE',
          'AIGC_SCOPE_REVOKED', 'AIGC_REQUEST_INVALID', 'AIGC_REQUEST_CONFLICT'].includes(code)) throw error
        // Keep the original reference visible so recovery can only query this request.
        return { schemaVersion: 1, requestId: row.requestId, sessionId: row.sessionId, kind: row.kind,
          modelId: row.modelId, state: 'unknown', contentAvailable: false } satisfies HarnessMediaTaskV1
      }
      this.assert(context, hostGeneration, signal)
      return this.project(response, row)
    }
    const row = await this.lookup(context, request.input, hostGeneration, signal)
    const task = await this.status(context, row, hostGeneration, signal)
    if (request.operation === 'status') return task
    return this.completedContent(context, row, task, hostGeneration, signal)
  }

  /** Main-only authorized handoff. The actual caller stays intact; journal provenance is checked separately. */
  async readCompletedContent(caller: HarnessCapabilityCallerV1, requestId: string, kind: HarnessMediaKind, hostGeneration: string,
    authorize: (source: MediaRequestRecord, caller: HarnessCapabilityCallerV1) => Promise<void>, signal?: AbortSignal): Promise<HarnessMediaContentV1> {
    const context = { scope: caller.scope, hostGeneration: caller.hostGeneration, sessionId: caller.callerSessionId }
    this.assert(context, hostGeneration, signal)
    const row = await this.deps.journal.get(caller.scope.accountId, requestId)
    this.assert(context, hostGeneration, signal)
    if (!row || row.accountId !== caller.scope.accountId || row.requestId !== requestId || row.kind !== kind) return fail('HARNESS_MEDIA_TASK_NOT_FOUND')
    await authorize({ ...row }, structuredClone(caller)); this.assert(context, hostGeneration, signal)
    const task = await this.status(context, row, hostGeneration, signal)
    return this.completedContent(context, row, task, hostGeneration, signal)
  }
  private async completedContent(context: HarnessMediaContextV1, row: MediaRequestRecord, task: HarnessMediaTaskV1,
    hostGeneration: string, signal?: AbortSignal): Promise<HarnessMediaContentV1> {
    if (task.state !== 'completed' || !task.contentAvailable) return fail('HARNESS_MEDIA_CONTENT_NOT_READY')
    const response = await this.deps.api.content(context.scope, base(row.kind) + '/requests/' + row.requestId + '/content', signal)
    this.assert(context, hostGeneration, signal)
    const mime = response.headers.get('content-type')?.split(';')[0]
    const allowed = row.kind === 'image' ? ['image/png', 'image/jpeg', 'image/webp'] : ['video/mp4']
    if (!response.ok || !response.body || !mime || !allowed.includes(mime)) {
      await response.body?.cancel(); return fail('HARNESS_MEDIA_CONTENT_INVALID')
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    const limit = row.kind === 'image' ? 16 * 1024 * 1024 : 100 * 1024 * 1024
    try {
      for (;;) {
        this.assert(context, hostGeneration, signal)
        const part = await reader.read()
        this.assert(context, hostGeneration, signal)
        if (part.done) break
        size += part.value.byteLength
        if (size > limit) fail('HARNESS_MEDIA_CONTENT_INVALID')
        chunks.push(part.value)
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    if (!size) return fail('HARNESS_MEDIA_CONTENT_INVALID')
    const bytes = Buffer.concat(chunks, size)
    const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
      mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
      mime === 'image/webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' :
      bytes.toString('ascii', 4, 8) === 'ftyp'
    if (!valid) return fail('HARNESS_MEDIA_CONTENT_INVALID')
    this.assert(context, hostGeneration, signal)
    const content: HarnessMediaContentV1 = { schemaVersion: 1, requestId: row.requestId, kind: row.kind,
      mediaType: mime as HarnessMediaContentV1['mediaType'], base64: bytes.toString('base64'), bytes: size,
      sha256: createHash('sha256').update(bytes).digest('hex') }
    return content
  }
}
