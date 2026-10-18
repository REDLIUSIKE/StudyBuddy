import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { AigcTextGrant, AigcPreparedRequest, AigcTextRequest, AigcPlatformTextGrant } from '../src/studybuddy/aigc-types.ts'
import { AigcGateway } from '../src/studybuddy/aigc-gateway.ts'
import { AigcMediaClient } from '../src/studybuddy/aigc-media.ts'
import { DiskMediaKeyJournal } from '../src/studybuddy/media-key-journal.ts'

const toonflowServer = fileURLToPath(new URL('../../../integrations/toonflow/apps/server/', import.meta.url))
const sourceBun = fileURLToPath(new URL('../../../.dsh-build/aigc-reviewed-build-baselines-20261015/studybuddy-aigc/bin/bun.exe', import.meta.url))
it.runIf(process.platform === 'win32' && existsSync(sourceBun) && existsSync(join(toonflowServer, 'src/utils/media/generation.ts')))
('reads image references only from the admitted Toonflow workspace and keeps the original save pipeline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-source-reference-')), workspace = join(root, 'workspace')
  const models = ['doubao-seedream-5-0-flash-260915', 'doubao-seedream-5-0-pro-260628'], providerId = 'mediaKey' + 'c'.repeat(64)
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const journal = new DiskMediaKeyJournal(join(root, 'journal'))
  const requestIds: string[] = []
  let creations = 0
  await mkdir(workspace); await writeFile(join(workspace, 'reference.png'), png); await writeFile(join(root, 'outside.png'), png)
  const media = new AigcMediaClient({ isCurrent: () => true, journal,
    target: async () => ({ baseUrl: 'https://gateway.test', apiKey: 'fixture-reference-key' }),
    fetch: async (url, init) => {
      if (url.endsWith('/images/catalog')) return Response.json({ schemaVersion: 1, models: models.map(modelId => ({
        providerId, modelId, type: 'image', providerLabel: 'Fixture', label: modelId, fundingSource: 'platform', sizes: ['1K', '1.5K', '2K'],
        priceGuard: { version: 'fixture-1', expressionSha256: 'a'.repeat(64), pluginSha256: 'b'.repeat(64) },
      })) })
      expect(url).toBe('https://gateway.test/v1/images/generations')
      const body = JSON.parse(String(init?.body)); creations++
      requestIds.push(new Headers(init?.headers).get('X-Request-Id')!)
      expect(body.image).toEqual(['data:image/png;base64,iVBORw0KGgoB'])
      expect(models).toContain(body.model)
      return Response.json({ model: body.model, data: [{ b64_json: '/9j/AQ==' }] })
    } })
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, media,
    consumer: { consumerCatalog: async () => [], prepareConsumerRequest: async () => { throw Error('TEXT_DENIED') }, consumerRequestStatus: async () => null } })
  try {
    const local = await gateway.start(scope)
    const script = `
      import assert from 'node:assert/strict';
      import { join } from 'node:path';
      import { readFile } from '@toonflow/file';
      import { configureGateway } from './src/utils/studyBuddy/gateway.ts';
      import { configurePolicy } from './src/utils/studyBuddy/policy.ts';
      import { generateMedia } from './src/utils/media/generation.ts';
      const workspace = process.env.AIGC_FIXTURE_WORKSPACE;
      await configurePolicy('f'.repeat(64), [workspace]);
      await configureGateway({ origin: process.env.AIGC_FIXTURE_ORIGIN, authorization: process.env.AIGC_FIXTURE_AUTHORIZATION });
      const results = [];
      for (const modelId of ['doubao-seedream-5-0-flash-260915', 'doubao-seedream-5-0-pro-260628']) {
        const input = { providerId: 'mediaKey' + 'c'.repeat(64), modelId, prompt: 'reference fixture', size: '1K',
          images: [{ path: 'reference.png', mimeType: 'image/png' }], outputDirectory: 'assets/original' };
        const [result] = await generateMedia(workspace, 'image', input, undefined, crypto.randomUUID());
        assert.equal(result.mimeType, 'image/jpeg');
        assert.deepEqual([...await readFile(join(workspace, result.path))], [255, 216, 255, 1]);
        await assert.rejects(generateMedia(workspace, 'image', { ...input, images: [{ path: '../outside.png', mimeType: 'image/png' }] }));
        await assert.rejects(generateMedia(workspace, 'image', { ...input, images: Array.from({ length: 11 }, () => input.images[0]) }));
        const controller = new AbortController(); controller.abort();
        await assert.rejects(generateMedia(workspace, 'image', input, controller.signal));
        results.push(modelId);
      }
      console.log(JSON.stringify({ results, originalSave: true, outsideRejected: true, countRejected: true, cancellationPreserved: true }));
      process.exit(0);
    `
    const stdout = await new Promise<string>((accept, reject) => execFile(sourceBun, ['--eval', script], {
      cwd: toonflowServer, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
      env: { ...process.env, STUDYBUDDY_EMBEDDED: '1', TOONFLOW_DATA_DIR: join(root, 'settings'),
        AIGC_FIXTURE_WORKSPACE: workspace, AIGC_FIXTURE_ORIGIN: local.origin, AIGC_FIXTURE_AUTHORIZATION: local.authorization },
    }, (error, output, stderr) => error ? reject(new Error(stderr || error.message)) : accept(output)))
    expect(JSON.parse(stdout.trim())).toEqual({ results: models, originalSave: true, outsideRejected: true, countRejected: true, cancellationPreserved: true })
    expect(creations).toBe(2)
    for (const id of requestIds) {
      const record = await journal.get(scope.accountId, id)
      expect(record).not.toBeNull()
      const saved = JSON.stringify(record)
      expect(saved).not.toContain('fixture-reference-key')
      expect(saved).not.toContain('data:image/'); expect(saved).not.toContain('iVBORw0KGgoB')
    }
  } finally { media.clearTransient(); await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
}, 20000)

it.each([
  ['image/png', [137, 80, 78, 71, 13, 10, 26, 10, 1]],
  ['image/jpeg', [255, 216, 255, 1]],
  ['image/webp', [82, 73, 70, 70, 1, 0, 0, 0, 87, 69, 66, 80, 1]],
] as const)('hands image content through the private bridge without replay or owner leakage (%s)', async (mime, bytes) => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-image-')), id = randomUUID()
  const journal = new DiskMediaKeyJournal(join(root, 'journal')), modelId = 'doubao-seedream-5-0-flash-260915'
  const providerId = 'mediaKey' + 'c'.repeat(64), guard = { version: 'fixture-price-v1',
    expressionSha256: 'a'.repeat(64), pluginSha256: 'b'.repeat(64) }
  let current = scope, creations = 0
  const media = new AigcMediaClient({ isCurrent: owner => owner === current, journal,
    target: async owner => ({ baseUrl: 'https://gateway.test', apiKey: 'fixture-key-' + owner.accountId }),
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer fixture-key-' + current.accountId)
      expect(headers.has('X-StudyBuddy-Request-Ticket')).toBe(false)
      expect(headers.has('Cookie')).toBe(false)
      if (url === 'https://guijitongzhuo.com/api/v2/aigc-media/key/images/catalog')
        return Response.json({ schemaVersion: 1, models: [{ providerId, modelId, type: 'image', priceGuard: guard, sizes: ['1K', '1.5K', '2K'] }] })
      if (url === 'https://gateway.test/v1/images/generations') {
        creations++
        expect(init?.method).toBe('POST')
        expect(headers.get('X-Request-Id')).toBe(id)
        expect(headers.get('X-StudyBuddy-CNY-Price-Version')).toBe('fixture-price-v1')
        expect(headers.get('X-StudyBuddy-CNY-Expression-SHA256')).toBe('a'.repeat(64))
        expect(headers.get('X-StudyBuddy-CNY-Plugin-SHA256')).toBe('b'.repeat(64))
        expect(JSON.parse(String(init?.body))).toEqual({ model: modelId, prompt: 'A car', size: '2K', response_format: 'b64_json', watermark: true })
        return Response.json({ model: modelId, data: [{ b64_json: Buffer.from(bytes).toString('base64') }] })
      }
      if (url === 'https://guijitongzhuo.com/api/v2/aigc-media/key/requests/' + id) return new Response(null, { status: 404 })
      throw Error('UNEXPECTED_BOUNDARY: ' + url)
    } })
  const gateway = new AigcGateway({ isCurrent: owner => owner === current, logRoot: root, media,
    consumer: { consumerCatalog: async () => [], prepareConsumerRequest: async () => { throw Error('TEXT_DENIED') }, consumerRequestStatus: async () => null } })
  try {
    const local = await gateway.start(scope), headers = { Authorization: 'Bearer ' + local.authorization }
    const catalog = await fetch(local.origin + '/media/images/catalog', { headers })
    expect(catalog.status).toBe(200)
    expect(await catalog.json()).toMatchObject({ models: [{ modelId, type: 'image' }] })
    const body = { requestId: id, modelId, handle: providerId, prompt: 'A car', size: '2K' }
    const submit = () => fetch(local.origin + '/media/images/requests', { method: 'POST', headers, body: JSON.stringify(body) })
    const created = await submit()
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ requestId: id, kind: 'image', modelId, state: 'completed', contentAvailable: true })
    for (let read = 0; read < 2; read++) {
      expect((await submit()).status).toBe(200)
      const status = await fetch(local.origin + '/media/images/requests/' + id, { headers })
      expect(await status.json()).toMatchObject({ requestId: id, state: 'completed' })
      const content = await fetch(local.origin + '/media/images/requests/' + id + '/content', { headers })
      expect(content.status).toBe(200); expect(content.headers.get('content-type')).toBe(mime)
      expect([...new Uint8Array(await content.arrayBuffer())]).toEqual([...bytes])
    }
    expect(creations).toBe(1)
    const extra = await fetch(local.origin + '/media/images/requests', { method: 'POST', headers,
      body: JSON.stringify({ ...body, requestId: randomUUID(), ratio: '16:9' }) })
    expect(extra.status).toBe(409); expect(creations).toBe(1)
    const conflict = await fetch(local.origin + '/media/images/requests', { method: 'POST', headers, body: JSON.stringify({ ...body, prompt: 'Changed' }) })
    expect(conflict.status).toBe(409); expect(creations).toBe(1)
    expect((await fetch(local.origin + '/v1/images/generations', { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(409)
    expect((await fetch(local.origin + '/media/images/requests/' + id + '/content')).status).toBe(401)
    current = { accountId: 'other-synthetic-owner', generation: 2 }
    const other = await gateway.start(current)
    const foreign = await fetch(other.origin + '/media/images/requests/' + id, { headers: { Authorization: 'Bearer ' + other.authorization } })
    expect(foreign.status).toBe(409); expect(await foreign.text()).not.toContain('fixture-key')
    expect(await journal.get(current.accountId, id)).toBeNull(); expect(creations).toBe(1)
  } finally { media.clearTransient(); await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
})

it('admits references above 8 MiB while keeping text-only image and video request bodies bounded at 8 MiB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-reference-budget-')), modelId = 'doubao-seedream-5-0-flash-260915'
  let creations = 0
  const media = new AigcMediaClient({ isCurrent: () => true, journal: new DiskMediaKeyJournal(join(root, 'journal')),
    target: async () => ({ baseUrl: 'https://gateway.test', apiKey: 'fixture-key' }), fetch: async (url, init) => {
      if (url.endsWith('/images/catalog')) return Response.json({ schemaVersion: 1, models: [{ modelId, type: 'image', providerId: 'owned-image',
        priceGuard: { version: 'fixture-1', expressionSha256: 'a'.repeat(64), pluginSha256: 'b'.repeat(64) } }] })
      creations++; expect(url).toBe('https://gateway.test/v1/images/generations')
      expect(JSON.parse(String(init?.body)).image).toHaveLength(1)
      return Response.json({ model: modelId, data: [{ b64_json: '/9j/AQ==' }] })
    } })
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, media,
    consumer: { consumerCatalog: async () => [], prepareConsumerRequest: async () => { throw Error('TEXT_DENIED') }, consumerRequestStatus: async () => null } })
  try {
    const local = await gateway.start(scope), headers = { Authorization: 'Bearer ' + local.authorization }
    const png = Buffer.alloc(7 * 1024 * 1024); png.set([137, 80, 78, 71, 13, 10, 26, 10])
    const dataUrl = 'data:image/png;base64,' + png.toString('base64')
    const input = { requestId: randomUUID(), modelId, handle: 'owned-image', prompt: 'reference', size: '1K' }
    const accepted = await fetch(local.origin + '/media/images/requests', { method: 'POST', headers, body: JSON.stringify({ ...input, images: [{ dataUrl }] }) })
    expect(accepted.status, await accepted.clone().text()).toBe(200); expect(await accepted.json()).toMatchObject({ state: 'completed' }); expect(creations).toBe(1)
    for (const path of ['/media/images/requests', '/media/requests']) {
      const rejected = await fetch(local.origin + path, { method: 'POST', headers, body: JSON.stringify({ ...input, requestId: randomUUID(), padding: dataUrl }) })
      expect(rejected.status).toBe(409); expect(await rejected.json()).toMatchObject({ error: { code: 'AIGC_REQUEST_TOO_LARGE' } })
    }
    expect(creations).toBe(1)
  } finally { media.clearTransient(); await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
})

it.each([false,true])('aborts an image submit at the same Key boundary and reads uncertainty without another submit (references=%s)', async (references) => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-image-abort-')), id = randomUUID()
  const modelId = 'doubao-seedream-5-0-flash-260915', journal = new DiskMediaKeyJournal(join(root, 'journal'))
  let creations = 0, upstreamAborted = false, started!: () => void, aborted!: () => void
  const dispatch = new Promise<void>(accept => { started = accept }), cancellation = new Promise<void>(accept => { aborted = accept })
  const media = new AigcMediaClient({ isCurrent: () => true, journal, target: async () => ({ baseUrl: 'https://gateway.test', apiKey: 'fixture-key' }),
    fetch: async (url, init) => {
      if (url.endsWith('/images/catalog')) return Response.json({ schemaVersion: 1, models: [{ type: 'image', providerId: 'owned-image', modelId,
        priceGuard: { version: 'fixture-1', expressionSha256: 'a'.repeat(64), pluginSha256: 'b'.repeat(64) } }] })
      if (url === 'https://gateway.test/v1/images/generations') {
        creations++; started()
        return new Promise<Response>((_accept, reject) => init?.signal?.addEventListener('abort', () => {
          upstreamAborted = true; aborted(); reject(init.signal?.reason)
        }, { once: true }))
      }
      if (url === 'https://gateway.test/v1/tasks/by-request/' + id)
        return Response.json({ request_id: id, model: modelId, status: 'UNKNOWN', content_available: false })
      throw Error('UNEXPECTED_BOUNDARY: ' + url)
    } })
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, media,
    consumer: { consumerCatalog: async () => [], prepareConsumerRequest: async () => { throw Error('TEXT_DENIED') }, consumerRequestStatus: async () => null } })
  try {
    const local = await gateway.start(scope), headers = { Authorization: 'Bearer ' + local.authorization }, controller = new AbortController()
    const body = { requestId: id, modelId, handle: 'owned-image', prompt: 'A car', size: '2K',
      ...references ? { images: [{ dataUrl: 'data:image/png;base64,iVBORw0KGgoB' }] } : {} }
    const pending = fetch(local.origin + '/media/images/requests', { method: 'POST', headers, signal: controller.signal, body: JSON.stringify(body) })
    const outcome = await Promise.race([dispatch.then(() => 'started'), pending.then(() => 'rejected-route')])
    expect(outcome).toBe('started')
    controller.abort(); await expect(pending).rejects.toThrow(); await cancellation
    expect(upstreamAborted).toBe(true); expect((await journal.get(scope.accountId, id))?.state).toBe('unknown')
    const replay = await fetch(local.origin + '/media/images/requests', { method: 'POST', headers, body: JSON.stringify(body) })
    expect(replay.status, await replay.clone().text()).toBe(200); expect(await replay.json()).toMatchObject({ requestId: id, state: 'unknown', contentAvailable: false })
    expect(creations).toBe(1)
  } finally { media.clearTransient(); await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
})

it('keeps the media session private, reads original content and fences account changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-media-')), id = randomUUID()
  let active = true, creations = 0
  const media = new AigcMediaClient({ isCurrent: () => active,
    target: async () => ({baseUrl:'https://gateway.test',apiKey:'private-bearer'}),
    journal: {get:async()=>null,claim:async(_owner,row)=>({row,created:true}),save:async()=>{}},
    fetch: async (url, init) => {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer private-bearer' })
      expect(init?.headers).not.toHaveProperty('X-StudyBuddy-Client-Audience')
      if (url.endsWith('/content')) return new Response(new Uint8Array([1,2,3]), {headers:{'content-type':'video/mp4'}})
      if (url.endsWith('/catalog')) return Response.json({schemaVersion:1,models:[{type:'video',providerId:'owned-video',
        modelId:'doubao-seedance-2-5-260628',priceGuard:{version:'test-1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
      if (init?.method === 'POST') {creations++;return Response.json({model:'doubao-seedance-2-5-260628',id:'task_fixture',status:'queued'})}
      if (url.endsWith('/requests/'+id)) return Response.json({schemaVersion:1,requestId:id,kind:'video',taskId:'task_fixture',contentAvailable:true})
      return Response.json({ schemaVersion:1,requestId:id,state:'queued' })
    } })
  const gateway = new AigcGateway({ isCurrent: () => active, logRoot: root, media,
    consumer: {consumerCatalog:async()=>[],prepareConsumerRequest:async()=>{throw Error('TEXT_DENIED')},consumerRequestStatus:async()=>null} })
  try {
    const local=await gateway.start(scope),headers={Authorization:'Bearer '+local.authorization}
    const sent=await fetch(local.origin+'/media/requests',{method:'POST',headers,body:JSON.stringify({requestId:id,handle:'owned-video',
      prompt:'A car',duration:4,resolution:'480p',ratio:'16:9',generateAudio:false,mode:'text',images:[]})})
    expect(sent.status).toBe(200);expect(await sent.text()).not.toContain('private-bearer')
    const content=await fetch(local.origin+'/media/requests/'+id+'/content',{headers})
    expect([...new Uint8Array(await content.arrayBuffer())]).toEqual([1,2,3]);expect(creations).toBe(1)
    await expect(media.content(scope,'/requests/../../admin/content')).rejects.toThrow('AIGC_ENDPOINT_DENIED')
    active=false;await expect(media.content(scope,'/requests/'+id+'/content')).rejects.toThrow();expect(creations).toBe(1)
  } finally {await gateway.revoke();await rm(root,{recursive:true,force:true})}
})

it.each([false, true])('includes platform choices using current or retained Key material (retained=%s)', async (retained) => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-platform-'))
  const personal = grant()
  const platform: AigcPlatformTextGrant = { ...personal, kind: 'platform', handle: 'f'.repeat(64),
    selection: { exactModelId: personal.selection.exactModelId, providerId: 'kimi',
      fundingSource: 'platform' as const, protocol: personal.selection.protocol },
    authority: { ...personal.authority, providerId:'kimi', toolId: 'dsh' } }
  let dispatched = 0
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root,
    consumer: { consumerCatalog: async () => [], prepareConsumerRequest: async () => { throw Error('PERSONAL_DENIED') },
      consumerRequestStatus: async () => null },
    platform: { consumerCatalog: async () => [platform], prepareAigcRequest: async (_scope, input) => ({
      request: { ...input, scope, hostGeneration: 'host', catalogRevision: platform.catalogVersion,
        exactModelId: platform.selection.exactModelId },
      material: { apiKey: 'private-platform-key', gatewayOrigin: 'https://guijitongzhuo.com', selectedModelId: platform.selection.exactModelId,
        selectedProviderId: platform.selection.providerId, fundingSource: 'platform', protocol: platform.selection.protocol,
        catalogRevision: retained ? 'catalog-prior' : platform.catalogVersion, authorizedModels: [platform.authority] } as never,
      authority: retained ? null : {} as never }) },
    fetch: async (url, init) => {
      dispatched++
      expect(String(url)).toBe('https://guijitongzhuo.com/v1/chat/completions')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer private-platform-key' })
      expect(init?.headers).not.toHaveProperty('X-StudyBuddy-Request-Ticket')
      return Response.json({ model: platform.selection.exactModelId, choices: [] })
    } })
  try {
    const local = await gateway.start(scope), headers = { Authorization: 'Bearer ' + local.authorization }
    const catalog = await (await fetch(local.origin + '/catalog', { headers })).json()
    expect(catalog).toHaveLength(1)
    expect(JSON.stringify(catalog)).not.toContain('private-platform-key')
    const response = await fetch(local.origin + '/' + platform.handle + '/v1/chat/completions',
      { method: 'POST', headers, body: JSON.stringify({ model: platform.selection.exactModelId, messages: [] }) })
    expect(response.status).toBe(200)
    expect(dispatched).toBe(1)
  } finally { await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
})

const scope = { accountId: 'synthetic-owner', generation: 1 }
function grant(): AigcTextGrant {
  return { handle: 'a'.repeat(64), sourceLabel: 'Synthetic source', catalogVersion: 'catalog-1', catalogDigest: 'b'.repeat(64),
    selection: { routeId: 'fixture-route', sourceId: randomUUID(), localRef: 'fixture-source', providerId: 'kimi',
      exactModelId: 'fixture-exact-model', protocol: 'openai_chat_completions', connectionId: randomUUID(),
      credentialRevision: 'credential-1', grantRevision: 'c'.repeat(64), fundingSource: 'user_api' },
    authority: { logicalModelId: 'fixture-logical', providerId: 'kimi', exactModelId: 'fixture-exact-model',
      displayName: 'Fixture model', protocol: 'openai_chat_completions', contextWindow: 128000, maxOutputTokens: 16000,
      capabilityFlags: ['tool_use'], evidenceSha256: 'd'.repeat(64), membershipRevision: 'membership-1',
      capabilityRevision: 'cap-1', adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available' } }
}
it('resolves the native selector to the same exact admitted route and refuses ambiguity or removed membership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-native-selector-')), model = grant(); let rows = [model]
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, consumer: { consumerCatalog: async () => rows,
    prepareConsumerRequest: async () => { throw Error('NO_PAID_DISPATCH') }, consumerRequestStatus: async () => null } })
  try {
    expect(await gateway.nativeModel(scope, model.handle, model.selection.exactModelId)).toEqual({ provider: model.selection.routeId, model: model.selection.exactModelId, capabilityFlags: ['tool_use'] })
    rows = [model, { ...model }]; await expect(gateway.nativeModel(scope, model.handle, model.selection.exactModelId)).rejects.toThrow('AIGC_MODEL_UNAVAILABLE')
    rows = []; await expect(gateway.nativeModel(scope, model.handle, model.selection.exactModelId)).rejects.toThrow('AIGC_MODEL_UNAVAILABLE')
  } finally { await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
})
it('relays personal Key requests without a legacy ticket and correlates the gateway receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-model-key-')), model = grant()
  let requestId = '', dispatched = 0
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, consumer: {
    consumerCatalog: async () => [model], consumerRequestStatus: async () => null,
    prepareConsumerRequest: async (_scope, input) => {
      requestId = input.clientRequestId
      return { frozen: { schemaVersion: 1, clientRequestId: requestId, sessionId: input.sessionId,
        selection: model.selection, authority: model.authority, purpose: 'chat', requestReceipt: null },
      route: { mode: 'gateway', routeId: model.selection.routeId, displayName: 'Fixture',
        gatewayOrigin: 'https://synthetic.gateway.test', apiKey: 'private-model-key', binding: {} as never } }
    },
  }, fetch: async (_url, init) => {
    dispatched++
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer private-model-key')
    expect(headers.get('X-Request-Id')).toBe(requestId)
    expect(headers.has('X-StudyBuddy-Request-Ticket')).toBe(false)
    expect(init?.redirect).toBe('error')
    return Response.json({ model: model.selection.exactModelId, choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } })
  } })
  try {
    const local = await gateway.start(scope)
    const result = await fetch(local.origin + '/' + model.handle + '/v1/chat/completions', { method: 'POST',
      headers: { Authorization: 'Bearer ' + local.authorization },
      body: JSON.stringify({ model: model.selection.exactModelId, messages: [{ role: 'user', content: 'hello' }] }) })
    expect(result.status).toBe(200)
    expect(dispatched).toBe(1)
    expect(await result.text()).not.toContain('private-model-key')
    const logs = await readdir(root)
    expect((await Promise.all(logs.map(name => readFile(join(root, name), 'utf8')))).join('')).not.toContain('private-model-key')
  } finally { await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
})
it('rejects a retired non-null prepared receipt before any AIGC dispatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-retired-freeze-')), model = grant()
  let dispatched = 0
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, consumer: {
    consumerCatalog: async () => [model], consumerRequestStatus: async () => null,
    prepareConsumerRequest: async (_scope, input) => ({ frozen: { schemaVersion: 1, clientRequestId: input.clientRequestId,
      sessionId: input.sessionId, selection: model.selection, authority: model.authority, purpose: 'chat',
      requestReceipt: { schemaVersion: 1, operationId: randomUUID(), requestId: input.clientRequestId, purpose: 'chat',
        state: 'prepared', requestTicket: 'retired-private-ticket', expiresAt: 4_000_000_000 } },
      route: { mode: 'gateway', routeId: model.selection.routeId, displayName: 'Fixture',
        gatewayOrigin: 'https://synthetic.gateway.test', apiKey: 'private-model-key', binding: {} as never } }),
  }, fetch: async () => { dispatched++; return Response.json({ model: model.selection.exactModelId, choices: [] }) } })
  try {
    const local = await gateway.start(scope)
    const response = await fetch(local.origin + '/' + model.handle + '/v1/chat/completions', { method: 'POST',
      headers: { Authorization: 'Bearer ' + local.authorization },
      body: JSON.stringify({ model: model.selection.exactModelId, messages: [{ role: 'user', content: 'fixture' }] }) })
    expect(response.status).toBe(409)
    expect(dispatched).toBe(0)
    expect(await readdir(root)).toEqual([])
  } finally { await gateway.revoke(); await rm(root, { recursive: true, force: true }) }
})
it('relays one exact Key-only request and journals no private route secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-aigc-relay-')), model = grant()
  let active = true, requests = 0
  const upstream = createServer(async (req, res) => {
    requests++
    expect(req.headers['x-studybuddy-request-ticket']).toBeUndefined()
    expect(req.headers.authorization).toBe('Bearer never-expose-upstream-key')
    let body = ''; for await (const bytes of req) body += bytes.toString()
    expect(JSON.parse(body).model).toBe('fixture-exact-model')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ id: 'response-1', model: 'fixture-exact-model', choices: [], usage: { prompt_tokens: 3 } }))
  })
  await new Promise<void>(accept => upstream.listen(0, '127.0.0.1', accept))
  const address = upstream.address()
  if (!address || typeof address === 'string') throw Error('FIXTURE_PORT_MISSING')
  const prepare = async (_scope: typeof scope, input: AigcTextRequest): Promise<AigcPreparedRequest> => ({
    frozen: { schemaVersion: 1, clientRequestId: input.clientRequestId, selection: model.selection, authority: model.authority,
      sessionId: input.sessionId, purpose: 'chat', requestReceipt: null },
    route: { mode: 'gateway', routeId: model.selection.routeId, displayName: 'Fixture source',
      gatewayOrigin: 'https://synthetic.gateway.test', apiKey: 'never-expose-upstream-key', binding: {} as never },
  })
  const gateway = new AigcGateway({ isCurrent: () => active, logRoot: root,
    consumer: { consumerCatalog: async () => active ? [model] : [], prepareConsumerRequest: prepare,
      consumerRequestStatus: async () => null },
    fetch: async (url, init) => fetch('http://127.0.0.1:' + address.port + new URL(url instanceof Request ? url.url : url).pathname, init) })
  try {
    const local = await gateway.start(scope), headers = { Authorization: 'Bearer ' + local.authorization, 'Content-Type': 'application/json' }
    expect((await fetch(local.origin + '/catalog')).status).toBe(401)
    const catalog = await (await fetch(local.origin + '/catalog', { headers })).json()
    expect(JSON.stringify(catalog)).not.toContain('never-expose-upstream-key')
    const request = { model: model.selection.exactModelId, messages: [{ role: 'user', content: 'a real local request' }] }
    const path = '/' + model.handle + '/v1/chat/completions'
    expect((await fetch(local.origin + path, { method: 'POST', headers, body: JSON.stringify(request) })).status).toBe(200)
    expect(requests).toBe(1)
    const logs = await readdir(root)
    expect(logs.length).toBeGreaterThan(0)
    const logged = await Promise.all(logs.map(name => readFile(join(root, name), 'utf8')))
    expect(logged.join('')).toContain('a real local request')
    expect(logged.join('')).not.toContain('never-expose-upstream-key')
    expect(logged.join('')).toContain('"billing":"unknown"')
    expect((await fetch(local.origin + path, { method: 'POST', headers,
      body: JSON.stringify({ ...request, model: 'another-model' }) })).status).toBe(409)
    expect((await fetch(local.origin + '/v1/videos', { method: 'POST', headers, body: '{}' })).status).toBe(409)
    expect((await fetch(local.origin + '/v1/images/generations', { method: 'POST', headers, body: '{}' })).status).toBe(409)
    active = false
    expect((await fetch(local.origin + path, { method: 'POST', headers, body: JSON.stringify(request) })).status).toBe(401)
    expect(requests).toBe(1)
  } finally {
    await gateway.revoke()
    upstream.closeAllConnections()
    await new Promise<void>(accept => upstream.close(() => accept()))
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects expired admission, withdrawn choices and unsupported image inputs before dispatch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-admission-')), model = grant()
  let available = true, expired = true, dispatched = 0
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, consumer: {
    consumerCatalog: async () => available ? [model] : [], consumerRequestStatus: async () => null,
    prepareConsumerRequest: async (_scope, input) => {
      if (!expired) available = false
      return { frozen: { schemaVersion: 1, clientRequestId: input.clientRequestId, sessionId: input.sessionId,
        purpose: 'chat', selection: model.selection, authority: model.authority, requestReceipt: expired ? { schemaVersion: 1,
          operationId: randomUUID(), requestId: input.clientRequestId, purpose: 'chat', requestTicket: 'ticket',
          expiresAt: 1, state: 'prepared' } : null }, route: { mode: 'gateway',
        routeId: model.selection.routeId, displayName: 'Fixture', gatewayOrigin: 'https://synthetic.gateway.test',
        apiKey: 'private', binding: {} as never } }
    } }, fetch: async () => { dispatched++; throw Error('DISPATCH_FORBIDDEN') } })
  try {
    const local = await gateway.start(scope), headers = { Authorization: 'Bearer ' + local.authorization }
    const send = (body: unknown) => fetch(local.origin + '/' + model.handle + '/v1/chat/completions',
      { method: 'POST', headers, body: JSON.stringify(body) })
    const body = { model: model.selection.exactModelId, messages: [{ role: 'user', content: 'hello' }] }
    expect((await send({ ...body, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:fixture' } }] }] })).status).toBe(409)
    expect((await send(body)).status).toBe(409)
    expired = false
    expect((await send(body)).status).toBe(409)
    expect(dispatched).toBe(0)
  } finally { await gateway.revoke(); await rm(root, { force: true, recursive: true }) }
})

it('validates streamed model identity and cancels the actual upstream connection on revocation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-stream-')), model = grant()
  let wrong = true, upstreamClosed = false
  const opened = Promise.withResolvers<undefined>()
  const upstream = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: ' + JSON.stringify({ model: wrong ? 'wrong-model' : model.selection.exactModelId, choices: [] }) + '\n\n')
    if (wrong) res.end('data: [DONE]\n\n')
    else { res.once('close', () => { upstreamClosed = true }); opened.resolve(undefined) }
    req.resume()
  })
  await new Promise<void>(accept => upstream.listen(0, '127.0.0.1', accept))
  const address = upstream.address()
  if (!address || typeof address === 'string') throw Error('FIXTURE_PORT_MISSING')
  const gateway = new AigcGateway({ isCurrent: () => true, logRoot: root, consumer: {
    consumerCatalog: async () => [model], consumerRequestStatus: async () => null,
    prepareConsumerRequest: async (_scope, input) => ({ frozen: { schemaVersion: 1, clientRequestId: input.clientRequestId,
      selection: model.selection, authority: model.authority, sessionId: input.sessionId, purpose: 'chat', requestReceipt: null }, route: { mode: 'gateway', routeId: model.selection.routeId,
      displayName: 'Fixture', gatewayOrigin: 'https://synthetic.gateway.test', apiKey: 'private', binding: {} as never } }),
  }, fetch: async (url, init) => fetch('http://127.0.0.1:' + address.port + new URL(url instanceof Request ? url.url : url).pathname, init) })
  try {
    const local = await gateway.start(scope), send = () => fetch(local.origin + '/' + model.handle + '/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + local.authorization },
      body: JSON.stringify({ model: model.selection.exactModelId, stream: true, messages: [{ role: 'user', content: 'hello' }] }),
    })
    const invalid = await send()
    expect(invalid.status).toBe(409)
    expect(await invalid.text()).toContain('AIGC_RESPONSE_MODEL_INVALID')
    wrong = false
    const pending = send()
    await opened.promise
    const response = await pending
    const finished = response.text().catch(() => 'aborted')
    await gateway.revoke()
    await finished
    // Server close is delivered after the fetch cancellation closes the real socket.
    await new Promise<void>(accept => setImmediate(accept))
    expect(upstreamClosed).toBe(true)
  } finally {
    await gateway.revoke(); upstream.closeAllConnections()
    await new Promise<void>(accept => upstream.close(() => accept()))
    await rm(root, { force: true, recursive: true })
  }
})
