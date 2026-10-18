import { it,expect,vi } from 'vitest'
import { SourceController } from '../src/client/source-controller.ts'
import type { NativeAccountApi, NativeUserSourceCheckV2, NativeUserSourceCheckV3, NativeUserSourceViewV3 } from '@studybuddy/contracts'
const checked:NativeUserSourceCheckV2={ schemaVersion:2,route:'local_direct',sourceRevision:'a'.repeat(64),inventory:{
  schemaVersion:2,inventoryRevision:'b'.repeat(64),endpoint:'https://api.openai.com/v1/models',fetchedAt:
    new Date().toISOString(),responseSha256:[],models:[{ exactModelId:'synthetic-model',ownedBy:null,lifecycle:null,
    shutdownDate:null }] },ping:{ success:true,latencyMs:1,url:'https://api.openai.com/v1',errorCode:null },probe:{
  protocol:'openai_responses',success:true,latencyMs:1,returnedModel:'synthetic-model',response:'OK',errorCode:
          null },verificationId:'11111111-1111-4111-8111-111111111111',verifiedAt:new Date().toISOString(),expiresAt:
            new Date(Date.now()+600000).toISOString(),errorCode:null }
const api={
  listNativeUserModelRegistrations:async()=>[],resumeNativeUserModelSave:async()=>{throw new Error('fixture')},
  listNativeUserSources:async()=>[],getNativeUserModels:async()=>[],checkNativeUserSource:async()=>checked,
  saveNativeUserSource:async()=>{throw Object.assign(new Error('NATIVE_RESULT_UNKNOWN'),{ operationId:'original' })},
  resumeNativeUserSourceSave:async()=>{throw new Error('fixture')},deleteNativeUserModel:async()=>true,
  reorderNativeUserModels:async()=>true,
  updateNativeUserModel:async()=>null,pingNativeUserModel:async()=>({ success:true,latencyMs:1,url:
    'https://api.openai.com/v1',errorCode:null }),
  testNativeUserModel:async()=>({ schemaVersion:1 as const,probes:[],verificationId:null,verifiedAt:null,expiresAt:null }),
} satisfies Pick<NativeAccountApi,
  'listNativeUserSources'|'getNativeUserModels'|'checkNativeUserSource'|'saveNativeUserSource'|'resumeNativeUserSourceSave'|'deleteNativeUserModel'|'reorderNativeUserModels'|'updateNativeUserModel'|'pingNativeUserModel'|'testNativeUserModel'|'listNativeUserModelRegistrations'|'resumeNativeUserModelSave'>
it('reuses a successful source read for rapid page returns but keeps explicit refresh and scope changes fresh',async()=>{
  vi.useFakeTimers(); vi.setSystemTime(100000)
  const read=vi.fn(async()=>[]),controller=new SourceController({...api,listNativeUserSources:read})
  try{
    controller.setScope({accountId:'a',generation:1})
    await Promise.all([controller.ensureLoaded(),controller.ensureLoaded()])
    await controller.ensureLoaded();expect(read).toHaveBeenCalledOnce()
    await controller.load();expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30001);await controller.ensureLoaded();expect(read).toHaveBeenCalledTimes(3)
    controller.setScope({accountId:'a',generation:2});await controller.ensureLoaded();expect(read).toHaveBeenCalledTimes(4)
  }finally{controller.dispose();vi.useRealTimers()}
})
it('does not let an older background source read overwrite a later explicit read',async()=>{
  let finish!:(value:[])=>void
  const first=new Promise<[]>(resolve=>{finish=resolve}),read=vi.fn().mockReturnValueOnce(first).mockResolvedValue([])
  const controller=new SourceController({...api,listNativeUserSources:read})
  controller.setScope({accountId:'a',generation:1})
  const earlier=controller.ensureLoaded();await controller.load()
  expect(controller.getSnapshot().busy).toBe(false)
  finish([]);await earlier;expect(read).toHaveBeenCalledTimes(2)
  await controller.ensureLoaded();expect(read).toHaveBeenCalledTimes(2);controller.dispose()
})
it('prepares model metadata independently after local rows are usable', async () => {
  const directory=Promise.withResolvers<never>(),catalog=vi.fn(()=>directory.promise)
  const controller=new SourceController({...api,getNativeBuiltinCatalog:catalog})
  controller.setScope({accountId:'a',generation:1})
  const pending=controller.prepare()
  await vi.waitFor(()=>expect(catalog).toHaveBeenCalledOnce())
  expect(controller.getSnapshot().busy).toBe(false)
  expect(controller.getSnapshot().catalogBusy).toBe(true)
  directory.reject(new Error('CATALOG_UNAVAILABLE'))
  await pending
  expect(controller.getSnapshot().busy).toBe(false)
})
it('makes local source rows usable without waiting for registrations or the remote model catalog', async () => {
  const registrations = Promise.withResolvers<[]>(), catalog = vi.fn(async () => { throw new Error('CATALOG_NOT_REQUESTED') })
  const controller = new SourceController({ ...api, listNativeUserModelRegistrations: () => registrations.promise,
    getNativeBuiltinCatalog: catalog })
  controller.setScope({ accountId: 'a', generation: 1 })
  const loading = controller.load()
  try {
    await vi.waitFor(() => expect(controller.getSnapshot().busy).toBe(false), { timeout: 200 })
    expect(catalog).not.toHaveBeenCalled()
    await controller.ensureLoaded()
    expect(catalog).not.toHaveBeenCalled()
  } finally { registrations.resolve([]); await loading; controller.dispose() }
})
it('does not continue an old preparation with the replacement account model directory',async()=>{
  const local=Promise.withResolvers<[]>(),catalog=vi.fn(async()=>{throw Error('NOT_REQUESTED')})
  const controller=new SourceController({...api,listNativeUserSourcesV3:()=>local.promise,getNativeBuiltinCatalog:catalog})
  controller.setScope({accountId:'a',generation:1});const pending=controller.prepare()
  controller.setScope({accountId:'b',generation:2});local.resolve([]);await pending
  expect(catalog).not.toHaveBeenCalled()
  expect(controller.getSnapshot().nativeCatalog).toBeNull()
})
it('loads the model directory only for an editor and reuses it until expiry or an account change', async () => {
  const now=vi.spyOn(Date,'now').mockReturnValue(1000000)
  const directory={schemaVersion:1 as const,catalogRevision:'fixture',checkedAt:new Date(1000000).toISOString(),
    expiresAt:new Date(2000000).toISOString(),models:[],transports:[]}
  const catalog=vi.fn(async()=>directory),controller=new SourceController({...api,getNativeBuiltinCatalog:catalog})
  try{
    controller.setScope({accountId:'a',generation:1});await controller.load();expect(catalog).not.toHaveBeenCalled()
    controller.createDraft();await vi.waitFor(()=>expect(controller.getSnapshot().catalogBusy).toBe(false))
    controller.clearDraft();controller.createDraft();expect(catalog).toHaveBeenCalledOnce()
    now.mockReturnValue(2000001);controller.clearDraft();controller.createDraft()
    await vi.waitFor(()=>expect(catalog).toHaveBeenCalledTimes(2))
    await vi.waitFor(()=>expect(controller.getSnapshot().catalogBusy).toBe(false))
    controller.setScope({accountId:'b',generation:2});controller.createDraft()
    await vi.waitFor(()=>expect(catalog).toHaveBeenCalledTimes(3))
  }finally{controller.dispose();now.mockRestore()}
})
it('uses V3 inventory proof without an inference or automatic first model, then saves once with explicit selection', async () => {
  const probeSelection = { exactModelId: 'synthetic-model', protocol: 'openai_responses' as const }
  const check: NativeUserSourceCheckV3 = { ...checked, route: 'local_direct', schemaVersion: 3, state: 'source_checked', probe: null,
    probeSelection, admittedModels: [] }
  const save = vi.fn<NativeAccountApi['saveNativeUserSourceV3']>(async request => ({
    schemaVersion: 3, operationId:
      request.operationId, state: 'saved', route: 'local_direct', localRef: 'fixture', localRevision: 'c'.repeat(64),
    sourceRevision: 'a'.repeat(64), inventoryRevision: 'b'.repeat(64), pendingPhase: null,
  }))
  const legacyProbe = vi.fn(api.testNativeUserModel)
  const controller = new SourceController({
    ...api, testNativeUserModel: legacyProbe, checkNativeUserSourceV3: async () => check,
    saveNativeUserSourceV3: save, listNativeUserSourcesV3: async () => [],
  })
  controller.setScope({ accountId: 'a', generation: 1 }); controller.createDraft()
  expect(controller.getSnapshot().draft).toMatchObject({ schemaVersion: 3, probeSelection: null })
  controller.editDraft({ name: 'neutral source', apiKey: 'private-key', sourcePresetId: 'openai', probeSelection })
  await controller.detectAndSave()
  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0].draft.probeSelection).toEqual(probeSelection)
  expect(legacyProbe).not.toHaveBeenCalled()
})
it('keeps current native discovery candidates across an explicit model choice but clears them when the Key changes', async () => {
  const model = {
    logicalModelId: 'manual-fixture', providerId: 'openai' as const, exactModelId: 'synthetic-model', displayName:
      'Synthetic model', protocol: 'openai_responses' as const, contextWindow: 4096, maxOutputTokens: 128, capabilityFlags: [],
    evidenceSha256: 'a'.repeat(64), membershipRevision: 'manual-1', capabilityRevision: 'cap-1', adapterRevision:
      'adapter-1', priceAuthorityRevision: null, availability: 'available' as const,
  }
  const check: NativeUserSourceCheckV3 = {
    ...checked, route: 'local_direct', schemaVersion: 3, state: 'discovered', probe: null, probeSelection: null,
    sourceRevision: null, verificationId: null, verifiedAt: null, expiresAt: null, admittedModels: [model],
  }
  const save = vi.fn(), controller = new SourceController({ ...api, checkNativeUserSourceV3: async () => check,
    saveNativeUserSourceV3: save })
  controller.setScope({ accountId: 'a', generation: 1 }); controller.createDraft(); controller.editDraft({
    name: 'source',
    apiKey: 'private-key', sourcePresetId: 'openai',
  })
  await controller.check()
  expect(controller.getSnapshot().admittedModels).toEqual([model])
  expect(controller.getSnapshot().checkResult?.verificationId).toBeNull()
  await controller.save(); expect(save).not.toHaveBeenCalled()
  controller.editDraft({ probeSelection: { exactModelId: 'synthetic-model', protocol: 'openai_responses' } })
  expect(controller.getSnapshot().checkResult).toBeNull()
  expect(controller.getSnapshot().admittedModels).toEqual([model])
  controller.editDraft({ apiKey: 'another-private-key' })
  expect(controller.getSnapshot().admittedModels).toEqual([])
})
it('shows configured saved source separately from built-in readiness and does not validate during load', async () => {
  const row: NativeUserSourceViewV3 = {
    schemaVersion: 3, localRef: 'fixture', localRevision: 'c'.repeat(64), sourceRevision:
      'a'.repeat(64), name: 'source', route: 'local_direct', inventory: checked.inventory, probeSelection: {
      exactModelId:
          'synthetic-model', protocol: 'openai_responses',
    }, state: 'saved', operationId: '11111111-1111-4111-8111-111111111111',
    configuration: { providerId: 'openai', sourcePresetId: 'openai', baseUrl: 'https://api.openai.com/v1', anthropicUrl: null },
  }
  const run = vi.fn(), readiness = {
    schemaVersion: 1 as const, operationId: row.operationId!, localRef: row.localRef,
    sourceRevision: row.sourceRevision!, state: 'pending' as const, phase: 'validation' as const, catalogVersion: null,
    catalogDigest: null, hostApplied: null, appliedModels: [], errorCode: null,
  }
  const controller = new SourceController({
    ...api, listNativeUserSourcesV3: async () => [row], listNativeBuiltinReadiness:
      async () => [readiness], runNativeBuiltinDiagnostic: run,
  })
  controller.setScope({ accountId: 'a', generation: 1 }); await controller.load()
  expect(controller.getSnapshot().sources[0]!.state).toBe('saved')
  expect(controller.getSnapshot().readiness[0]!.state).toBe('pending')
  expect(run).not.toHaveBeenCalled()
})
it('keeps original configured source operations visible when the optional built-in catalog or readiness lookup fails', async () => {
  const row: NativeUserSourceViewV3 = {
    schemaVersion: 3, localRef: 'fixture', localRevision: 'c'.repeat(64), sourceRevision:
      'a'.repeat(64), name: 'source', route: 'local_direct', inventory: checked.inventory, probeSelection: {
      exactModelId:
          'synthetic-model', protocol: 'openai_responses',
    }, state: 'saved', operationId: '11111111-1111-4111-8111-111111111111',
    configuration: { providerId: 'openai', sourcePresetId: 'openai', baseUrl: 'https://api.openai.com/v1', anthropicUrl: null },
  }
  const controller = new SourceController({
    ...api, listNativeUserSourcesV3: async () => [row], getNativeBuiltinCatalog:
      async () => { throw new Error('BUILTIN_CATALOG_UNAVAILABLE') }, listNativeBuiltinReadiness: async () => {
      throw new Error('BUILTIN_HOST_UNAVAILABLE')
    },
  })
  controller.setScope({ accountId: 'a', generation: 1 }); await controller.load()
  expect(controller.getSnapshot().sources).toEqual([row])
  expect(controller.getSnapshot().nativeCatalog).toBeNull()
  expect(controller.getSnapshot().readiness).toEqual([])
  expect(controller.getSnapshot().errorCode).toBe('BUILTIN_HOST_UNAVAILABLE')
  expect(controller.getSnapshot().busy).toBe(false)
})
it('editing a Key invalidates detection and prevents saving with old verification',async()=>{
  let writes=0
  const controller=new SourceController({ ...api,saveNativeUserSource:async()=>{writes++;throw new Error('unexpected')} })
  controller.setScope({ accountId:'a',generation:1 });controller.createDraft()
  controller.editDraft({ name:'source',apiKey:'first-key',sourcePresetId:'openai' })
  await controller.check();expect(controller.getSnapshot().checkResult?.verificationId).toBeTruthy()
  controller.editDraft({ apiKey:'changed-key' });expect(controller.getSnapshot().checkResult).toBeNull()
  await controller.save();expect(writes).toBe(0);expect(controller.getSnapshot().errorCode).toBe('NATIVE_VERIFICATION_REQUIRED')
})
it('retains the same operation after an interrupted save and requires explicit recovery',async()=>{
  const controller=new SourceController(api)
  controller.setScope({ accountId:'a',generation:1 });controller.createDraft();controller.editDraft({ name:'source',apiKey:
    'fixture',sourcePresetId:'openai' })
  await controller.check();await controller.save()
  const pending=controller.getSnapshot().pending
  expect(pending?.operationId).toMatch(/^[0-9a-f-]{36}$/)
  await controller.save();expect(controller.getSnapshot().pending?.operationId).toBe(pending?.operationId)
})
it('allows fresh detection when the companion rejects an expired proof before starting a write',async()=>{
  const controller=new SourceController({ ...api,saveNativeUserSource:async()=>{throw new Error('NATIVE_VERIFICATION_REQUIRED')} })
  controller.setScope({ accountId:'a',generation:1 });controller.createDraft();controller.editDraft({ name:'source',apiKey:
    'fixture',sourcePresetId:'openai' })
  await controller.check();await controller.save()
  expect(controller.getSnapshot().pending).toBeNull();expect(controller.getSnapshot().checkResult).toBeNull()
  expect(controller.getSnapshot().draft?.name).toBe('source');await controller.check()
  expect(controller.getSnapshot().checkResult?.verificationId).toBe(checked.verificationId)
})
const saved={ schemaVersion:2 as const,state:'saved' as const,route:'local_direct' as const,localRef:'fixture',
  sourceRevision:'a'.repeat(64),registration:null,pendingPhase:null }
function ready(overrides:Partial<ConstructorParameters<typeof SourceController>[0]>={}){
  const controller=new SourceController({ ...api,...overrides })
  controller.setScope({ accountId:'a',generation:1 });controller.createDraft()
  controller.editDraft({ name:'source',apiKey:'synthetic-key',sourcePresetId:'openai' })
  return controller
}
it('can save when the browser exposes getRandomValues without secure-context randomUUID',async()=>{
  const original=globalThis.crypto,save=vi.fn<NativeAccountApi['saveNativeUserSource']>(async()=>saved)
  vi.stubGlobal('crypto',{ getRandomValues:original.getRandomValues.bind(original) })
  try{
    await ready({ saveNativeUserSource:save }).detectAndSave()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0].operationId).toMatch(/^[0-9a-f-]{36}$/)
  }finally{vi.unstubAllGlobals()}
})
function deferred<T>() {let resolve!:(value:T)=>void; const promise = new Promise<T>((r) => { resolve = r });return { promise,resolve } }
it('detects and saves once in one action, retaining the latest name without repeating a paid probe',async()=>{
  const check=vi.fn<NativeAccountApi['checkNativeUserSource']>(async()=>checked),
    save=vi.fn<NativeAccountApi['saveNativeUserSource']>(async()=>saved)
  const controller=ready({ checkNativeUserSource:check,saveNativeUserSource:save })
  await controller.check();controller.editDraft({ name:'renamed source' })
  await controller.detectAndSave()
  expect(check).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]?.[0].draft.name).toBe('renamed source')
  expect(controller.getSnapshot().draft).toBeNull()
})
it('does not repeat detection or save on double click while detection is still running',async()=>{
  const detection=deferred<NativeUserSourceCheckV2>(),check=vi.fn(()=>detection.promise),
    save=vi.fn<NativeAccountApi['saveNativeUserSource']>(async()=>saved)
  const controller=ready({ checkNativeUserSource:check,saveNativeUserSource:save })
  const first=controller.detectAndSave();await controller.detectAndSave()
  detection.resolve(checked);await first
  expect(check).toHaveBeenCalledTimes(1);expect(save).toHaveBeenCalledTimes(1)
})
it('keeps name-only edits during detection and saves that current name',async()=>{
  const detection=deferred<NativeUserSourceCheckV2>(),save=vi.fn<NativeAccountApi['saveNativeUserSource']>(async()=>saved)
  const controller=ready({ checkNativeUserSource:()=>detection.promise,saveNativeUserSource:save })
  const action=controller.detectAndSave();controller.editDraft({ name:'latest name' })
  detection.resolve(checked);await action
  expect(save.mock.calls[0]?.[0].draft.name).toBe('latest name')
})
it.each(['key', 'scope'] as const)('never saves a late detection after its %s changes', async (change) => {
  const detection = deferred<NativeUserSourceCheckV2>(), save = vi.fn<NativeAccountApi['saveNativeUserSource']>(async () => saved)
  const controller = ready({ checkNativeUserSource: () => detection.promise, saveNativeUserSource: save })
  const action = controller.detectAndSave()
  if (change === 'key') controller.editDraft({ apiKey: 'another-synthetic-key' })
  else controller.setScope({ accountId: 'b', generation: 2 })
  detection.resolve(checked); await action
  expect(save).not.toHaveBeenCalled(); expect(controller.getSnapshot().checkResult).toBeNull()
})
it('does not save a proof without a successful model probe',async()=>{
  const save=vi.fn<NativeAccountApi['saveNativeUserSource']>(async()=>saved)
  const controller=ready({ checkNativeUserSource:async()=>({ ...checked,probe:null }),saveNativeUserSource:save })
  await controller.detectAndSave()
  expect(save).not.toHaveBeenCalled();expect(controller.getSnapshot().errorCode).toBe('NATIVE_VERIFICATION_REQUIRED')
})
it('lets a missing original journal recover to fresh detection without discarding the draft',async()=>{
  const controller=ready({ resumeNativeUserSourceSave:async()=>{throw new Error('NATIVE_SOURCE_SAVE_JOURNAL_MISSING')} })
  await controller.check();await controller.save();expect(controller.getSnapshot().pending).not.toBeNull()
  await controller.resume()
  expect(controller.getSnapshot().pending).toBeNull();expect(controller.getSnapshot().checkResult).toBeNull()
  expect(controller.getSnapshot().draft?.name).toBe('source')
  expect(controller.getSnapshot().errorCode).toBe('NATIVE_SAVE_JOURNAL_MISSING')
})
it('retains the original operation on a generic invalid configuration or mismatched receipt',async()=>{
  const controller=ready({ resumeNativeUserSourceSave:async()=>{throw new Error('NATIVE_TOOL_INVALID_CONFIG')} })
  await controller.check();await controller.save()
  const pending=controller.getSnapshot().pending
  expect(pending).not.toBeNull()
  await controller.resume()
  expect(controller.getSnapshot().pending).toBe(pending)
  expect(controller.getSnapshot().errorCode).toBe('NATIVE_TOOL_INVALID_CONFIG')
  await controller.detectAndSave()
  expect(controller.getSnapshot().pending).toBe(pending)
  expect(controller.getSnapshot().errorCode).toBe('NATIVE_SAVE_RECOVERY_REQUIRED')
})
it('normalizes pasted request endpoints before detection while retaining the explicit catalog URL',async()=>{
  const check=vi.fn<NativeAccountApi['checkNativeUserSource']>(async()=>checked)
  const normalized=ready({ checkNativeUserSource:check })
  normalized.editDraft({ sourcePresetId:null,advanced:{ baseUrl:'https://fixture.example/v1/chat/completions/',
    anthropicUrl:'https://fixture.example/anthropic/v1/messages/',modelsUrl:'https://fixture.example/custom/catalog',protocol:null } })
  await normalized.check()
  expect(check.mock.calls[0]?.[0].advanced).toEqual({ baseUrl:'https://fixture.example/v1',anthropicUrl:
    'https://fixture.example/anthropic',modelsUrl:'https://fixture.example/custom/catalog',protocol:null })
  normalized.dispose()
})
