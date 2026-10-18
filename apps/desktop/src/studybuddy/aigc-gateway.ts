/** Private loopback relay. Native authority owns routing and billing; this module never charges. */
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { PLATFORM_PROVIDER } from '@deepseek-ai/dsh-llm-studybuddy-builtin'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { NativeProtocol, OwnedScope } from '@studybuddy/contracts'
import type { AigcTextConsumer, AigcTextChoice, AigcPlatformConsumer } from './aigc-types.ts'
import { assertAigcPath } from './aigc-resources.ts'

const paths: Readonly<Record<string, NativeProtocol>> = {
  '/v1/chat/completions': 'openai_chat_completions', '/v1/responses': 'openai_responses', '/v1/messages': 'anthropic_messages',
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
interface Options {
  isCurrent(scope: OwnedScope): boolean
  logRoot: string | ((scope: OwnedScope) => string)
  consumer: AigcTextConsumer
  platform?: AigcPlatformConsumer
  media?: { request(scope: OwnedScope, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown>
    content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response> }
  fetch?: typeof fetch
}
interface Row {
  scope: OwnedScope
  server: Server
  origin: string
  authorization: string
  revoked: boolean
  tasks: Set<Promise<void>>
  aborts: Set<AbortController>
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('AIGC_REQUEST_INVALID')
  return value as Record<string, unknown>
}
function checkBody(body: Record<string, unknown>, grant: AigcTextChoice): void {
  if (body.model !== grant.selection.exactModelId) throw Error('AIGC_MODEL_UNAVAILABLE')
  const flags = grant.authority.capabilityFlags
  const outputLimit = grant.authority.maxOutputTokens
  if (outputLimit === null) throw Error('AIGC_MODEL_UNAVAILABLE')
  if (Array.isArray(body.tools) && body.tools.length && !flags.includes('tool_use')) throw Error('AIGC_CAPABILITY_UNAVAILABLE')
  if ((body.reasoning_effort && body.reasoning_effort !== 'none' && body.reasoning_effort !== 'off' ||
    body.thinking && object(body.thinking).type === 'enabled') && !flags.includes('thinking') &&
    !flags.includes('always_thinking')) throw Error('AIGC_CAPABILITY_UNAVAILABLE')
  for (const name of ['max_tokens', 'max_completion_tokens', 'max_output_tokens']) {
    const value = body[name]
    if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) <= 0 ||
      Number(value) > outputLimit)) throw Error('AIGC_OUTPUT_LIMIT_INVALID')
  }
  const input = body.messages ?? body.input
  if (!Array.isArray(input) && typeof input !== 'string') throw Error('AIGC_REQUEST_INVALID')
  if (!Array.isArray(input)) return
  for (const message of input) {
    const content = object(message).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      const type = object(part).type
      if (['image_url', 'input_image', 'image'].includes(String(type)) && !flags.includes('image_in') ||
        ['video_url', 'input_video', 'video'].includes(String(type)) && !flags.includes('video_in') ||
        ['input_audio', 'audio'].includes(String(type)) && !flags.includes('audio_in') ||
        ['input_file', 'document'].includes(String(type))) throw Error('AIGC_CAPABILITY_UNAVAILABLE')
    }
  }
}
function returnedModel(value: unknown): unknown {
  const row = object(value)
  return row.model ?? (row.response && object(row.response).model) ?? (row.message && object(row.message).model)
}
async function responseText(response: Response): Promise<string> {
  if (!response.body) throw Error('AIGC_RESPONSE_INVALID')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 8 * 1024 * 1024) throw Error('AIGC_RESPONSE_INVALID')
      chunks.push(part.value)
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
function reply(res: ServerResponse, status: number, code: string): void {
  if (res.headersSent) { res.destroy(); return }
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ error: { code, message: code } }))
}

/** One account-owned listener, with explicit shutdown and no retry/fallback. */
export class AigcGateway {
  private row: Row | undefined
  private opening: Promise<{ origin: string; authorization: string }> | undefined
  constructor(private readonly options: Options) { }
  /** Resolve the existing keyless node selector to the same currently admitted native model route. */
  async nativeModel(scope: OwnedScope, providerId: string, modelId: string): Promise<{ provider: string; model: string; capabilityFlags: readonly string[] }> {
    await this.start(scope)
    const row = this.row!; this.assert(row)
    const grants = await this.catalog(row)
    const selected = grants.filter(grant => {
      const selection = grant.selection, personal = 'routeId' in selection ? selection : undefined
      const id = 'studyBuddyText' + createHash('sha256').update(JSON.stringify([personal?.sourceId ?? 'platform', personal?.localRef ?? 'platform', selection.providerId, selection.exactModelId, selection.protocol, selection.fundingSource])).digest('hex')
      return (providerId === id || providerId === grant.handle) && modelId === selection.exactModelId
    })
    if (selected.length !== 1 || selected[0]!.authority.maxOutputTokens === null) throw Error('AIGC_MODEL_UNAVAILABLE')
    const grant = selected[0]!; this.assert(row)
    return { provider: 'routeId' in grant.selection ? grant.selection.routeId : PLATFORM_PROVIDER, model: grant.selection.exactModelId, capabilityFlags: grant.authority.capabilityFlags }
  }

  /** Open a private listener for the current account only.
   * @param scope - Main-owned authenticated generation.
   * @returns Private bootstrap material for the local backend stdin. */
  async start(scope: OwnedScope): Promise<{ origin: string; authorization: string }> {
    if (this.row && same(this.row.scope, scope) && !this.row.revoked && this.options.isCurrent(scope)) {
      if (this.opening) return this.opening
      return { origin: this.row.origin, authorization: this.row.authorization }
    }
    await this.revoke()
    if (!this.options.isCurrent(scope)) throw Error('AIGC_SCOPE_REVOKED')
    const server = createServer(), row: Row = { scope, server, origin: '', authorization: randomBytes(32).toString('hex'),
      revoked: false, tasks: new Set(), aborts: new Set() }
    this.row = row
    server.on('request', (req, res) => {
      const task = this.serve(row, req, res).catch((error: unknown) => {
        const code = error instanceof Error && /^AIGC_[A-Z_]+$/.test(error.message) ? error.message : 'AIGC_GATEWAY_UNAVAILABLE'
        reply(res, code === 'AIGC_SCOPE_REVOKED' ? 401 : 409, code)
      })
      row.tasks.add(task); void task.finally(() => row.tasks.delete(task))
    })
    const opening = new Promise<{ origin: string; authorization: string }>((accept, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        const address = server.address()
        if (!address || typeof address === 'string' || row.revoked || !this.options.isCurrent(scope)) {
          reject(Error('AIGC_SCOPE_REVOKED')); return
        }
        row.origin = `http://127.0.0.1:${address.port}`
        accept({ origin: row.origin, authorization: row.authorization })
      })
    })
    this.opening = opening
    try { return await opening } catch (error) { await this.revoke(); throw error }
    finally { if (this.opening === opening) this.opening = undefined }
  }

  private assert(row: Row): void {
    if (row.revoked || this.row !== row || !this.options.isCurrent(row.scope)) throw Error('AIGC_SCOPE_REVOKED')
  }
  private async catalog(row: Row): Promise<readonly AigcTextChoice[]> {
    const personal = await this.options.consumer.consumerCatalog(row.scope)
    const platform = await this.options.platform?.consumerCatalog(row.scope) ?? []
    this.assert(row)
    return [...personal, ...platform]
  }

  private async serve(row: Row, req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.assert(row)
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? req.headers['x-api-key']
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(row.authorization)) || req.headers.origin !== undefined ||
      req.headers.host !== new URL(row.origin).host) { reply(res, 401, 'AIGC_AUTH_REQUIRED'); return }
    const url = new URL(req.url ?? '/', row.origin)
    if (url.search || url.hash) throw Error('AIGC_REQUEST_INVALID')
    if (req.method === 'GET' && url.pathname === '/catalog') {
      const catalog = await this.catalog(row)
      this.assert(row)
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(catalog)); return
    }
    if (this.options.media && req.method === 'GET' && /^\/media\/(?:(?:images|speech)\/)?requests\/[0-9a-f-]{36}\/content$/.test(url.pathname)) {
      const controller = new AbortController(), abort = () => { if (!res.writableEnded) controller.abort() }
      row.aborts.add(controller); res.once('close', abort)
      try {
        const response = await this.options.media.content(row.scope, url.pathname.slice('/media'.length), controller.signal)
        this.assert(row)
        if (!response.ok || !response.body) throw Error('AIGC_TASK_CONTENT_UNAVAILABLE')
        const mime = response.headers.get('content-type')?.split(';')[0]
        const allowed = url.pathname.startsWith('/media/images/') ? ['image/png', 'image/jpeg', 'image/webp'] :
          url.pathname.startsWith('/media/speech/')?['audio/wav','audio/mpeg','audio/flac','audio/pcm']:['video/mp4']
        if (!mime || !allowed.includes(mime)) { await response.body.cancel(); throw Error('AIGC_TASK_CONTENT_UNAVAILABLE') }
        const reader = response.body.getReader(); let size = 0
        try { for (;;) {
          const part = await reader.read(); this.assert(row); controller.signal.throwIfAborted()
          if (part.done) break
          size += part.value.byteLength; if (size > 100 * 1024 * 1024) throw Error('AIGC_CONTENT_TOO_LARGE')
          if (!res.headersSent) res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' })
          if (!res.write(part.value)) await new Promise<void>((accept, reject) => {
            const close = () => { res.off('drain', drain); reject(Error('AIGC_SCOPE_REVOKED')) }
            const drain = () => { res.off('close', close); accept() }
            res.once('drain', drain); res.once('close', close)
          })
        } if (!size) throw Error('AIGC_RESPONSE_INVALID'); res.end() }
        finally { await reader.cancel(); reader.releaseLock() }
      } finally { row.aborts.delete(controller); res.off('close', abort) }
      return
    }
    if (this.options.media && ((req.method === 'GET' && (/^\/media\/(?:(?:images|speech)\/)?catalog$/.test(url.pathname) ||
      /^\/media\/(?:(?:images|speech)\/)?requests\/[0-9a-f-]{36}$/.test(url.pathname))) ||
      req.method === 'POST' && /^\/media\/(?:(?:images|speech)\/)?requests$/.test(url.pathname))) {
      const controller = new AbortController()
      row.aborts.add(controller)
      const abort = () => { if (!res.writableEnded) controller.abort() }
      res.once('close', abort)
      try {
        const chunks: Buffer[] = []; let size = 0
        const imageRequest = req.method === 'POST' && url.pathname === '/media/images/requests'
        const limit = (imageRequest ? 128 : 8) * 1024 * 1024
        for await (const value of req) {
          if (!Buffer.isBuffer(value)) throw Error('AIGC_REQUEST_INVALID')
          size += value.length
          if (size > limit) throw Error('AIGC_REQUEST_TOO_LARGE')
          chunks.push(value)
        }
        if (req.method === 'GET' && size) throw Error('AIGC_REQUEST_INVALID')
        const body = req.method === 'POST' ? object(JSON.parse(Buffer.concat(chunks).toString('utf8'))) : undefined
        if (size > 8 * 1024 * 1024 && (!imageRequest || !Array.isArray(body?.images) || !body.images.length)) throw Error('AIGC_REQUEST_TOO_LARGE')
        const result = await this.options.media.request(row.scope, url.pathname.slice('/media'.length), body, controller.signal)
        this.assert(row); controller.signal.throwIfAborted()
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(result))
      } finally { row.aborts.delete(controller); res.off('close', abort) }
      return
    }
    if (/\/videos?(\/|$)/.test(url.pathname)) throw Error('AIGC_VIDEO_MODEL_NOT_CONFIGURED')
    if (/\/images?(\/|$)/.test(url.pathname)) throw Error('AIGC_IMAGE_UNAVAILABLE')
    const match = /^\/([a-f0-9]{64})(\/v1\/(?:chat\/completions|responses|messages))$/.exec(url.pathname)
    const protocol = match?.[2] && paths[match[2]]
    if (req.method !== 'POST' || !match || !protocol) throw Error('AIGC_ENDPOINT_DENIED')
    const controller = new AbortController()
    row.aborts.add(controller)
    const abort = () => { if (!res.writableEnded) controller.abort() }
    res.once('close', abort)
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const value of req) {
        const bytes: unknown = value
        if (!Buffer.isBuffer(bytes)) throw Error('AIGC_REQUEST_INVALID')
        size += bytes.length
        if (size > 8 * 1024 * 1024) throw Error('AIGC_REQUEST_TOO_LARGE')
        chunks.push(Buffer.from(new Uint8Array(bytes)))
      }
      const body = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const grant = (await this.catalog(row)).find(value => value.handle === match[1])
      this.assert(row); controller.signal.throwIfAborted()
      if (!grant || grant.selection.protocol !== protocol) throw Error('AIGC_MODEL_UNAVAILABLE')
      checkBody(body, grant)
      const requestId = randomUUID(), sessionId = 'aigc-' + randomUUID()
      const input = { handle: grant.handle, clientRequestId: requestId, sessionId, protocol }
      let gatewayOrigin: string, apiKey: string
      if ('kind' in grant && grant.kind === 'platform') {
        const prepared = await this.options.platform!.prepareAigcRequest(row.scope, input)
        this.assert(row); controller.signal.throwIfAborted()
        if (prepared.request.clientRequestId !== requestId || prepared.request.sessionId !== sessionId ||
          prepared.material.selectedModelId !== grant.selection.exactModelId ||
          prepared.material.selectedProviderId !== grant.selection.providerId || prepared.material.fundingSource !== 'platform' ||
          prepared.material.protocol !== protocol || prepared.authority !== null && prepared.material.catalogRevision !== grant.catalogVersion ||
          !prepared.material.authorizedModels.some(value => same(value, grant.authority))) throw Error('AIGC_MODEL_UNAVAILABLE')
        gatewayOrigin = prepared.material.gatewayOrigin; apiKey = prepared.material.apiKey
      } else {
        const prepared = await this.options.consumer.prepareConsumerRequest(row.scope, input)
        this.assert(row); controller.signal.throwIfAborted()
        const { frozen, route } = prepared
        if (!same(frozen.selection, grant.selection) || !same(frozen.authority, grant.authority) ||
          frozen.clientRequestId !== requestId || frozen.sessionId !== sessionId || frozen.purpose !== 'chat' ||
          frozen.requestReceipt !== null) throw Error('AIGC_MODEL_UNAVAILABLE')
        gatewayOrigin = route.gatewayOrigin; apiKey = route.apiKey
      }
      const current = (await this.catalog(row)).find(value => value.handle === grant.handle)
      this.assert(row); controller.signal.throwIfAborted()
      if (!same(current, grant)) throw Error('AIGC_MODEL_UNAVAILABLE')
      const endpoint = new URL(gatewayOrigin)
      if (endpoint.protocol !== 'https:' || endpoint.origin !== gatewayOrigin || endpoint.username || endpoint.password) {
        throw Error('AIGC_ENDPOINT_DENIED')
      }
      const logRoot = typeof this.options.logRoot === 'string' ? this.options.logRoot : this.options.logRoot(row.scope)
      await assertAigcPath(logRoot)
      await mkdir(logRoot, { recursive: true })
      const log = join(logRoot, requestId + '.jsonl')
      await writeFile(log, JSON.stringify({ requestId, sessionId, grant, body, startedAt: Date.now(), billing: 'unknown' }) + '\n',
        { flag: 'wx', mode: 0o600 })
      this.assert(row); controller.signal.throwIfAborted()
      try {
        const headers = protocol === 'anthropic_messages'
          ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
          : { Authorization: 'Bearer ' + apiKey }
        const endpoint = match[2]
        if (!endpoint) throw Error('AIGC_REQUEST_INVALID')
        const upstream = await (this.options.fetch ?? fetch)(gatewayOrigin + endpoint, { method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'X-Request-Id': requestId },
          body: JSON.stringify(body), redirect: 'error', signal: controller.signal })
        this.assert(row)
        if (!upstream.ok) {
          await upstream.body?.cancel(); throw Error('AIGC_UPSTREAM_REJECTED')
        }
        if (upstream.headers.get('content-type')?.startsWith('text/event-stream')) await this.stream(row, upstream, res, grant, log)
        else {
          const bytes = await responseText(upstream)
          this.assert(row)
          const response: unknown = JSON.parse(bytes)
          if (returnedModel(response) !== grant.selection.exactModelId) throw Error('AIGC_RESPONSE_MODEL_INVALID')
          await appendFile(log, JSON.stringify({ transportResponse: response, billing: 'unknown' }) + '\n')
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(bytes)
        }
        await appendFile(log, JSON.stringify({ transport: 'completed', completedAt: Date.now() }) + '\n')
      } catch (error) {
        await appendFile(log, JSON.stringify({ transport: controller.signal.aborted ? 'cancelled' : 'unknown',
          completedAt: Date.now() }) + '\n'); throw error
      } finally {
        const receipt = 'kind' in grant ? null : await this.options.consumer.consumerRequestStatus(row.scope, requestId).catch(() => null)
        await appendFile(log, JSON.stringify({ nativeReceipt: receipt ? { ...receipt, requestTicket: null } : null,
          billing: 'unknown', reconciliationRequired: receipt?.state !== 'terminal' }) + '\n')
      }
    } finally { row.aborts.delete(controller); res.off('close', abort) }
  }

  private async stream(row: Row, upstream: Response, res: ServerResponse, grant: AigcTextChoice, log: string): Promise<void> {
    if (!upstream.body) throw Error('AIGC_RESPONSE_INVALID')
    const reader = upstream.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
    let buffer = '', pending = '', verified = false, terminal = false
    try {
      for (;;) {
        const part = await reader.read(); this.assert(row)
        if (part.done) break
        buffer = (buffer + decoder.decode(part.value, { stream: true })).replace(/\r\n/g, '\n')
        if (buffer.length + pending.length > 1024 * 1024) throw Error('AIGC_RESPONSE_INVALID')
        let end: number
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, end + 2); buffer = buffer.slice(end + 2)
          const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
          if (data && data !== '[DONE]') {
            const parsed = object(JSON.parse(data)), model = returnedModel(parsed)
            if (model !== undefined && model !== grant.selection.exactModelId) throw Error('AIGC_RESPONSE_MODEL_INVALID')
            if (model === grant.selection.exactModelId) verified = true
            if (['response.completed', 'response.failed', 'response.incomplete', 'message_stop'].includes(String(parsed.type))) {
              terminal = true
            }
          }
          if (data === '[DONE]') terminal = true
          pending += event
          if (verified) {
            await appendFile(log, JSON.stringify({ transportEvents: pending, billing: 'unknown' }) + '\n')
            this.assert(row)
            if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
            res.write(pending); pending = ''
          }
        }
      }
      buffer += decoder.decode()
      if (!verified || !terminal || buffer.trim() || pending) throw Error('AIGC_RESPONSE_INVALID')
      res.end()
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  }

  /** Fence the listener immediately, cancel dispatches and await every owned operation. */
  async revoke(): Promise<void> {
    const row = this.row
    if (!row) return
    row.revoked = true; this.row = undefined
    for (const controller of row.aborts) controller.abort()
    const closed = new Promise<void>(accept => row.server.close(() => { accept() }))
    row.server.closeAllConnections()
    await Promise.allSettled([...row.tasks]); await closed
  }
}
