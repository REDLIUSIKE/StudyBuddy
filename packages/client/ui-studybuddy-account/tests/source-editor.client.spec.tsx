// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest'
import { act,cleanup,render,screen,fireEvent } from '@testing-library/react'
import { SourcesPanel } from '../src/client/SourcesPanel.tsx'
import { SourceEditor } from '../src/client/SourceEditor.tsx'
import { zh } from '../src/client/locales.ts'
import type { SourceDraft, SourceSnapshot } from '../src/client/source-controller.ts'
import type { AccountFace } from '../src/client/face.ts'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('renders every inventory model, keeps tested status separate and confirms deletion',()=>{
  const sources=[{ localRef:'fixture',localRevision:'revision',sourceRevision:null,name:'Fixture source',route:
    'local_direct' as const,state:'saved' as const,operationId:null,registration:null,testedModelId:'tested-exact',
  testedProtocol:'openai_responses' as const,inventory:{ schemaVersion:2 as const,inventoryRevision:'a'.repeat(64),
    fetchedAt:'2026-10-11T00:00:00.000Z',endpoint:'https://api.openai.com/v1/models',responseSha256:[],models:
          ['tested-exact','second-exact','third-exact'].map(exactModelId=>({ exactModelId,ownedBy:null,lifecycle:null,
            shutdownDate:null })) } }]
  const remove=vi.fn(async()=>{}),editSource=vi.fn()
  const actions: AccountFace['source'] = {
    load:async()=>{},createDraft:()=>{},editSource,editDraft:()=>{},check:async()=>{},save:async()=>{},
    detectAndSave:async()=>{},resume:async()=>{},resumeLegacy:async()=>{},remove,rename:async()=>{},
    reorder:async()=>{},clearDraft:()=>{},ping:async()=>{},probe:async()=>{},
    diagnostic:async()=>{},loadDetail:async()=>{},resumeBuiltin:async()=>{},validateBuiltin:async()=>{},refreshBalance:async()=>{},
  }
  const state: SourceSnapshot = { scope:{ accountId:'fixture-owner',generation:1 },sources,models:[],registrations:[],draft:null,
    checkResult:null,pending:null,busy:false,errorCode:null,probe:null,ping:null,nativeCatalog:null,readiness:[],details:{} }
  render(<SourcesPanel state={state} actions={actions} t={key=>zh[key]} openEditor={()=>{}}/>)
  expect(screen.queryByText('完整模型目录 · 3')).toBeNull()
  fireEvent.click(screen.getByRole('button',{ name:/^编辑/ }))
  fireEvent.click(screen.getByText('完整模型目录 · 3'))
  for(const model of sources[0]!.inventory.models)expect(screen.getByText(model.exactModelId)).toBeTruthy()
  expect(screen.getAllByText('已检测')).toHaveLength(1)
  expect(screen.getAllByText('未检测')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button',{ name:'删除' }));expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button',{ name:'删除' })[1]!);expect(remove).toHaveBeenCalledWith('fixture')
})

it('requires an explicit exact manual model for V3 and keeps eight provider presets neutral', () => {
  const editDraft = vi.fn(), detectAndSave = vi.fn(async () => { }), noop = async () => { }
  const actions: AccountFace['source'] = {
    load: noop, createDraft: () => { }, editSource: () => { }, editDraft, check: noop, save: noop, detectAndSave,
    resume: noop, resumeLegacy: noop, remove: noop, rename: noop, reorder: noop, clearDraft: () => { }, ping: noop, probe: noop,
    loadDetail: noop, resumeBuiltin: noop, validateBuiltin: noop, refreshBalance: noop, diagnostic: noop,
  }
  const authority = {
    logicalModelId: 'manual-fixture', providerId: 'openai' as const, exactModelId: 'fixture-exact',
    displayName: 'Fixture exact',
    protocol: 'openai_responses' as const, contextWindow: 4096, maxOutputTokens: 128, capabilityFlags: [], evidenceSha256: 'a'.repeat(64),
    membershipRevision: 'manual-1', capabilityRevision: 'cap-1', adapterRevision: 'adapter-1', priceAuthorityRevision:
      null, availability: 'available' as const,
  }
  const draft: SourceDraft = {
    schemaVersion: 3, internalId: null, expectedLocalRevision: null, name: 'Fixture', apiKey: 'synthetic-key',
    sourcePresetId: 'openai', advanced: null, probeSelection: null,
  }
  const state: SourceSnapshot = {
    scope: { accountId: 'fixture-owner', generation: 1 }, sources: [], models: [], registrations: [], draft,
    checkResult: null, pending: null, busy: false, errorCode: null, probe: null, ping: null, details: {}, readiness: [],
    nativeCatalog: {
      schemaVersion: 1, catalogRevision: 'manual-1', checkedAt: '2026-10-11T00:00:00Z', expiresAt:
        '2099-10-11T00:00:00Z', models: [authority], transports: [],
    },
  }
  const view = render(<SourceEditor state={state} actions={actions} t={key => zh[key]} onClose={() => { }} />)
  for (const provider of ['deepseek', 'kimi', 'hunyuan', 'zhipu', 'minimax', 'mimo', 'openai',
    'anthropic']) expect(screen.getByRole('option', { name: provider })).toBeTruthy()
  const selected = screen.getByLabelText('验证模型') as HTMLSelectElement
  expect(selected.value).toBe('')
  expect(screen.getByRole('button', { name: '保存并验证' }).hasAttribute('disabled')).toBe(true)
  expect(detectAndSave).not.toHaveBeenCalled()
  fireEvent.change(selected, { target: { value: 'fixture-exact|openai_responses' } })
  expect(editDraft).toHaveBeenCalledWith({ probeSelection: { exactModelId: 'fixture-exact', protocol: 'openai_responses' } })
  view.rerender(<SourceEditor state={{
    ...state, draft: {
      ...draft, probeSelection: {
        exactModelId: 'fixture-exact', protocol: 'openai_responses',
      },
    },
  }} actions={actions} t={key => zh[key]} onClose={() => { }} />)
  expect(screen.getByRole('button', { name: '保存并验证' }).hasAttribute('disabled')).toBe(false)
  expect(screen.getByText(/可能产生供应商费用/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '保存并验证' }))
  expect(detectAndSave).toHaveBeenCalledOnce()
})
it('offers discovery before local exact selection and uses native local candidates alongside a domestic catalog', () => {
  const check = vi.fn(async () => { }), noop = async () => { }, actions: AccountFace['source'] = {
    load: noop, createDraft: () => { }, editSource: () => { }, editDraft:
      () => { }, check, save: noop, detectAndSave: noop, resume: noop, resumeLegacy: noop, remove: noop, rename: noop, reorder: noop,
    clearDraft: () => { }, ping: noop, probe: noop, loadDetail: noop, resumeBuiltin: noop, validateBuiltin: noop,
    refreshBalance: noop, diagnostic: noop,
  }
  const authority = {
    logicalModelId: 'manual-fixture', providerId: 'openai' as const, exactModelId: 'fixture-exact',
    displayName: 'Fixture exact', protocol: 'openai_responses' as const, contextWindow: 4096, maxOutputTokens: 128,
    capabilityFlags: [], evidenceSha256: 'a'.repeat(64), membershipRevision: 'manual-1', capabilityRevision: 'cap-1',
    adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available' as const,
  }
  const state: SourceSnapshot = {
    scope: { accountId: 'fixture-owner', generation: 1 }, sources: [], models: [], registrations: [],
    draft: {
      schemaVersion: 3, internalId: null, expectedLocalRevision: null, name: 'Fixture', apiKey: 'synthetic-key',
      sourcePresetId: 'openai', advanced: null, probeSelection: null,
    }, checkResult: null, pending: null, busy: false, errorCode:
      null, probe: null, ping: null, details: {}, readiness: [], admittedModels: [authority], nativeCatalog: {
      schemaVersion: 1,
      catalogRevision: 'domestic-1', checkedAt: '2026-10-11T00:00:00Z', expiresAt: '2099-10-11T00:00:00Z', models: [], transports: [],
    },
  }
  render(<SourceEditor state={state} actions={actions} t={key => zh[key]} onClose={() => { }} />)
  expect(screen.getByRole('option', { name: 'Fixture exact · fixture-exact · openai_responses' })).toBeTruthy()
  expect((screen.getByLabelText('验证模型') as HTMLSelectElement).value).toBe('')
  expect(screen.getByRole('button', { name: '保存并验证' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '发现模型' })); expect(check).toHaveBeenCalledOnce()
})
it('keeps changed Key in an owned draft and uses the Harness reveal control',()=>{
  const change=vi.fn(),detectAndSave=vi.fn(async()=>{}),actions: AccountFace['source'] = {
    load:async()=>{},createDraft:()=>{},editSource:()=>{},editDraft:change,check:async()=>{},save:async()=>{},
    detectAndSave,resume:async()=>{},resumeLegacy:async()=>{},remove:async()=>{},rename:async()=>{},
    reorder:async()=>{},clearDraft:()=>{},ping:async()=>{},probe:async()=>{},
    diagnostic:async()=>{},loadDetail:async()=>{},resumeBuiltin:async()=>{},validateBuiltin:async()=>{},refreshBalance:async()=>{},
  }
  const state: SourceSnapshot = { scope:{ accountId:'fixture-owner',generation:1 },sources:[],models:[],registrations:[],draft:{
    schemaVersion:2 as const,internalId:null,expectedLocalRevision:null,name:'Fixture',apiKey:'synthetic-key',
    sourcePresetId:'openai',advanced:null },checkResult:null,pending:null,busy:false,errorCode:null,probe:null,ping:null,
  nativeCatalog:null,readiness:[],details:{} }
  render(<SourceEditor state={state} actions={actions} t={key=>zh[key]} onClose={()=>{}}/>)
  const key=screen.getByLabelText('API Key') as HTMLInputElement
  expect(key.type).toBe('password')
  fireEvent.click(screen.getByRole('button',{ name:'显示 Key' }));expect(key.type).toBe('text')
  fireEvent.change(key,{ target:{ value:'changed-synthetic-key' } });expect(change).toHaveBeenCalledWith({ apiKey:'changed-synthetic-key' })
  expect(screen.getByText(/输出上限 100 Token/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{ name:'检测并保存' }))
  expect(detectAndSave).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{ name:'保存' })).toBeNull()
})
it('does not paste a late clipboard result into another account or a closed draft',async()=>{
  let finish!:(value:string)=>void
  vi.stubGlobal('navigator',{ clipboard:{ readText:()=>new Promise<string>((resolve)=>{finish=resolve}) } })
  const change=vi.fn(),actions: AccountFace['source'] = {
    load:async()=>{},createDraft:()=>{},editSource:()=>{},editDraft:change,check:async()=>{},save:async()=>{},
    detectAndSave:async()=>{},resume:async()=>{},resumeLegacy:async()=>{},remove:async()=>{},rename:async()=>{},
    reorder:async()=>{},clearDraft:()=>{},ping:async()=>{},probe:async()=>{},
    diagnostic:async()=>{},loadDetail:async()=>{},resumeBuiltin:async()=>{},validateBuiltin:async()=>{},refreshBalance:async()=>{},
  }
  const state: SourceSnapshot = { scope:{ accountId:'first-fixture',generation:1 },sources:[],models:[],registrations:[],draft:{
    schemaVersion:2 as const,internalId:null,expectedLocalRevision:null,name:'Fixture',apiKey:'synthetic-key',
    sourcePresetId:'openai',advanced:null },checkResult:null,pending:null,busy:false,errorCode:null,probe:null,ping:null,
  nativeCatalog:null,readiness:[],details:{} }
  const first=render(<SourceEditor state={state} actions={actions} t={key=>zh[key]} onClose={()=>{}}/>)
  fireEvent.click(screen.getByRole('button',{ name:'粘贴 Key' }));first.unmount()
  render(<SourceEditor state={{ ...state,scope:{ accountId:'second-fixture',generation:2 } }} actions={actions} t={key=>
    zh[key]} onClose={()=>{}}/>)
  await act(async()=>{finish('late-synthetic-key')})
  expect(change).not.toHaveBeenCalled()
})
