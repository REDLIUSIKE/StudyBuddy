import { expect, it, vi } from 'vitest'
import { fixture, owner, documentAdapter } from './fixture.ts'
import * as capabilityPlugin from '../../src/capabilities/index.ts'

it('mountsOnlyForActualCallerAndUnregisterRevokesMountedTools', async () => {
  const f = await fixture(), adapter = documentAdapter()
  const invoke = vi.fn(async () => ({ data: null, artifacts: [], operationRef: null }))
  try {
    await f.ctx.plugin(capabilityPlugin, { owner: () => owner, port: { invoke }, authorize: async () => {} })
    const remove = f.ctx.capabilities.registry.register(adapter)
    expect((await f.call('creative_project', { action: 'list-modules' })).isError).toBe(false)
    expect((await f.call('creative_project', { action: 'create', moduleId: 'novel', title: 'Chapter' })).isError).toBe(false)
    expect((await f.call('creative_novel_writeChapter', { text: 'Hello' })).isError).toBe(false)
    const restricted=f.agent.ctx.tools.restrict({allow:[]})
    expect((await f.call('creative_novel_writeChapter',{text:'revoked'})).isError).toBe(true);restricted()
    expect((await f.call('creative_novel_writeChapter', { text: 'Foreign' }, f.other)).isError).toBe(true)
    remove()
    expect((await f.call('creative_novel_writeChapter', { text: 'Late' })).isError).toBe(true)
  } finally { await f.close() }
})
it('checksChangedSchemaAndRejectsInvalidArgumentsBeforeExecute', async () => {
  const f = await fixture(), adapter = documentAdapter(), execute = vi.spyOn(adapter, 'execute')
  try {
    await f.ctx.plugin(capabilityPlugin, { owner: () => owner, port: { invoke: async () => ({ data: null, artifacts: [], operationRef: null }) }, authorize: async () => {} })
    f.ctx.capabilities.registry.register(adapter)
    await f.call('creative_project', { action: 'create', moduleId: 'novel', title: 'Chapter' })
    expect((await f.call('creative_novel_writeChapter', { text: 123 })).isError).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    adapter.descriptor.description = 'Changed without a revision'
    expect((await f.call('creative_novel_writeChapter', { text: 'Hello' })).isError).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  } finally { await f.close() }
})
it('rejectsUndeclaredArtifactsBeforePersistingSuccess', async () => {
  const f = await fixture(), adapter = documentAdapter()
  try {
    vi.spyOn(adapter, 'execute').mockResolvedValue({ data: { saved: true }, operationRef: null, artifacts: [{ artifactRef: 'foreign-one', moduleId: 'novel', schemaRef: 'undeclared.image', originSessionId: f.agent.id, mime: 'image/png', bytes: 1, sha256: 'a'.repeat(64) }] } as never)
    await f.ctx.plugin(capabilityPlugin, { owner: () => owner, port: { invoke: async () => ({ data: null, artifacts: [], operationRef: null }) }, authorize: async () => {} })
    f.ctx.capabilities.registry.register(adapter)
    await f.call('creative_project', { action: 'create', moduleId: 'novel', title: 'Chapter' })
    expect((await f.call('creative_novel_writeChapter', { text: 'Hello' })).isError).toBe(true)
  } finally { await f.close() }
})
it('pluginUnloadAbortsAndAwaitsItsOwnedExecution', async () => {
  const f = await fixture(), adapter = documentAdapter()
  let started!: () => void, settled = false
  const ready = new Promise<void>(resolve => { started = resolve })
  vi.spyOn(adapter, 'execute').mockImplementation(async (...args: unknown[]) => {
    const context = args[0] as { signal: AbortSignal }
    started()
    await new Promise<void>(resolve => { context.signal.addEventListener('abort', () => { setTimeout(resolve, 20) }, { once: true }) })
    settled = true
    return { data: { saved: true }, artifacts: [], operationRef: null }
  })
  try {
    const plugin = f.ctx.plugin(capabilityPlugin, { owner: () => owner, port: { invoke: async () => ({ data: null, artifacts: [], operationRef: null }) }, authorize: async () => {} })
    await plugin
    f.ctx.capabilities.registry.register(adapter)
    await f.call('creative_project', { action: 'create', moduleId: 'novel', title: 'Chapter' })
    const pending = f.call('creative_novel_writeChapter', { text: 'Hello' })
    await ready
    await plugin.dispose()
    expect(settled).toBe(true)
    expect((await pending).isError).toBe(true)
  } finally { await f.close() }
})
it('rejectsBootstrapOverridesAtTheExecutor', async () => {
  const f = await fixture(), adapter = documentAdapter()
  try {
    await f.ctx.plugin(capabilityPlugin, { owner: () => owner, port: { invoke: async () => ({ data: null, artifacts: [], operationRef: null }) }, authorize: async () => {} })
    f.ctx.capabilities.registry.register(adapter)
    expect((await f.call('creative_project', { action: 'create', moduleId: 'novel', title: 'Chapter', apiKey: 'forbidden' })).isError).toBe(true)
  } finally { await f.close() }
})
it('reloadReopensTheDomainAndPreservesAssociations', async () => {
  const f = await fixture()
  const options = { owner: () => owner, port: { invoke: async () => ({ data: null, artifacts: [], operationRef: null }) }, authorize: async () => {} }
  try {
    const first = f.ctx.plugin(capabilityPlugin, options)
    await first
    f.ctx.capabilities.registry.register(documentAdapter())
    expect((await f.call('creative_project', { action: 'create', moduleId: 'novel', title: 'Chapter' })).isError).toBe(false)
    await first.dispose()
    await f.ctx.plugin(capabilityPlugin, options)
    f.ctx.capabilities.registry.register(documentAdapter())
    expect((await f.call('creative_project', { action: 'attach', moduleId: 'novel', projectRef: 'novel-one' })).isError).toBe(false)
  } finally { await f.close() }
})
it('keeps an admitted document reference when its tool catalogue fails to load',async()=>{
 const f=await fixture(),adapter=documentAdapter()
 vi.spyOn(adapter,'tools').mockRejectedValueOnce(Error('CANVAS_LOAD_FAILED'))
 try{
  await f.ctx.plugin(capabilityPlugin,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async()=>{}})
  f.ctx.capabilities.registry.register(adapter)
  expect((await f.call('creative_project',{action:'create',moduleId:'novel',title:'Chapter'})).isError).toBe(true)
  const identity={...owner,callerSessionId:f.agent.id,workspaceId:null,toolCallId:'lookup'}
  expect(await f.ctx.capabilities.associations.find(identity,'novel')).toEqual([{moduleId:'novel',projectRef:'novel-one'}])
  expect(await f.ctx.capabilities.associations.find({...identity,callerSessionId:f.other.id},'novel')).toEqual([])
 }finally{await f.close()}
})
it('mounts a video capability beside the original editor tool without replacing it',async()=>{
 const f=await fixture(),adapter={...documentAdapter(),id:'video',bind:async()=>({moduleId:'video',projectRef:'video-one'})};adapter.descriptor.name='look';adapter.descriptor.effect='read'
 const legacy=vi.fn(async()=>({legacy:true}))
 try{
  f.agent.ctx.tools.register({name:'video_look',description:'Original editor preview',parameters:{type:'object',properties:{},additionalProperties:false},output:{schema:{type:'object',properties:{legacy:{type:'boolean'}},required:['legacy'],additionalProperties:false},render:()=>[]},execute:legacy})
  await f.ctx.plugin(capabilityPlugin,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async()=>{}})
  f.ctx.capabilities.registry.register(adapter)
  expect((await f.call('creative_project',{action:'create',moduleId:'video',title:'Film'})).isError).toBe(false)
  expect((await f.call('video_look',{})).isError).toBe(false);expect(legacy).toHaveBeenCalledTimes(1)
  expect((await f.call('creative_video_look',{text:'preview'})).isError).toBe(false)
 }finally{await f.close()}
})
