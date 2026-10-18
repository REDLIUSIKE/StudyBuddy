// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SourcesPanel } from '../src/client/SourcesPanel.tsx'
import { SourceEditor } from '../src/client/SourceEditor.tsx'
import { SourceController, type SourceSnapshot } from '../src/client/source-controller.ts'
import type { AccountFace } from '../src/client/face.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
const t = (key: keyof typeof zh) => zh[key]
const source = (localRef: string, name: string): SourceSnapshot['sources'][number] => ({
  localRef, name, localRevision: 'revision-' + localRef, sourceRevision: null,
  route: 'local_direct', state: 'saved', operationId: null, registration: null,
  testedModelId: 'fixture-tested', testedProtocol: 'openai_responses',
  inventory: {
    schemaVersion: 2, inventoryRevision: 'a'.repeat(64), fetchedAt: '2026-10-11T00:00:00Z',
    endpoint: 'https://example.test/v1/models', responseSha256: [],
    models: ['fixture-tested', 'fixture-untested'].map(exactModelId => ({
      exactModelId, ownedBy: null, lifecycle: null, shutdownDate: null,
    })),
  },
})
const first = source('first-key-source', 'Provider · Personal')
const second = source('second-key-source', 'Provider · Work')
function snapshot(): SourceSnapshot {
  return {
    scope: { accountId: 'fixture-owner', generation: 1 }, sources: [first, second],
    models: [first, second].map(row => ({
      internalId: row.localRef, name: row.name, baseUrl: 'https://example.test/v1',
      apiKey: 'synthetic-' + row.localRef,
    })),
    registrations: [], draft: null, checkResult: null, pending: null, busy: false,
    errorCode: null, probe: null, ping: null, nativeCatalog: null, readiness: [], details: {},
  }
}
function actions(): AccountFace['source'] {
  return {
    load: vi.fn(async () => { }), createDraft: vi.fn(), editSource: vi.fn(), editDraft: vi.fn(),
    check: vi.fn(async () => { }), save: vi.fn(async () => { }), detectAndSave: vi.fn(async () => { }),
    resume: vi.fn(async () => { }), resumeLegacy: vi.fn(async () => { }),
    remove: vi.fn(async () => { }), rename: vi.fn(async () => { }), reorder: vi.fn(async () => { }),
    clearDraft: vi.fn(), ping: vi.fn(async () => { }), probe: vi.fn(async () => { }),
    loadDetail: vi.fn(async () => { }), resumeBuiltin: vi.fn(async () => { }), validateBuiltin: vi.fn(async () => { }),
    refreshBalance: vi.fn(async () => { }), diagnostic: vi.fn(async () => { }),
  }
}
it('keeps two Keys from one provider as independent compact rows addressed by their source ids', () => {
  const commands = actions(), openEditor = vi.fn()
  render(<SourcesPanel state={snapshot()} actions={commands} t={t} openEditor={openEditor} />)
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(screen.queryByText('fixture-tested')).toBeNull()
  expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  fireEvent.click(within(rows[1]!).getByRole('button', { name: /^编辑/ }))
  expect(commands.editSource).toHaveBeenCalledWith(second.localRef)
  expect(openEditor).toHaveBeenCalledOnce()
  expect(commands.detectAndSave).not.toHaveBeenCalled()
})
it('opens the original controller draft from the full-width provider add action', () => {
  const state = snapshot(), openEditor = vi.fn()
  const unused = async (): Promise<never> => { throw new Error('UNUSED_FIXTURE_OPERATION') }
  const controller = new SourceController({
    listNativeUserSources: unused, getNativeUserModels: unused, listNativeUserModelRegistrations: unused,
    checkNativeUserSource: unused, saveNativeUserSource: unused, resumeNativeUserSourceSave: unused,
    deleteNativeUserModel: unused, reorderNativeUserModels: unused, updateNativeUserModel: unused,
    pingNativeUserModel: unused, testNativeUserModel: unused, resumeNativeUserModelSave: unused,
  })
  controller.setScope(state.scope)
  const commands = { ...actions(), createDraft: controller.createDraft }
  render(<SourcesPanel state={state} actions={commands} t={t} openEditor={openEditor} />)
  fireEvent.click(screen.getByRole('button', { name: '添加模型提供商' }))
  expect(controller.getSnapshot().draft).toEqual({ schemaVersion: 2, internalId: null, expectedLocalRevision: null,
    name: '', apiKey: '', sourcePresetId: null, advanced: null })
  expect(openEditor).toHaveBeenCalledOnce()
  controller.dispose()
})
it('labels configured credentials and saved sources without asserting built-in chat readiness', () => {
  const state = snapshot()
  state.models = [state.models[0]!, { ...state.models[1]!, apiKey: '' }]
  render(<SourcesPanel state={state} actions={actions()} t={t} openEditor={() => {}} />)
  expect(screen.getByRole('img', { name: '已保存' }).getAttribute('data-model-readiness')).toBe('unknown')
  expect(screen.getByRole('img', { name: '缺少 API Key' })).toBeTruthy()
  expect(screen.getAllByText('已保存')).toHaveLength(1)
  expect(screen.getByText(zh.sourceMissing)).toBeTruthy()
  expect(screen.queryByText('可使用')).toBeNull()
})
it('keeps an interrupted save and its failure visible outside the collapsed details', () => {
  const state = snapshot(), commands = actions()
  state.pending = {
    schemaVersion: 2, operationId: '11111111-1111-4111-8111-111111111111', verificationId: '22222222-2222-4222-8222-222222222222',
    draft: { schemaVersion: 2, internalId: first.localRef, expectedLocalRevision: first.localRevision, name: first.name,
      apiKey: 'synthetic-key', sourcePresetId: 'fixture', advanced: null },
  }
  state.errorCode = 'NATIVE_RESULT_UNKNOWN'
  render(<SourcesPanel state={state} actions={commands} t={t} openEditor={() => {}} />)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getAllByText('保存未完成').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '恢复原操作' }))
  expect(commands.resume).toHaveBeenCalledWith()
  expect(screen.getByRole('button', { name: '添加模型提供商' }).getAttribute('disabled')).not.toBeNull()
})
it('keeps recovery and complete catalogs available when a pending source has no local Key to edit', () => {
  const state = snapshot(), commands = actions()
  const operationId = '33333333-3333-4333-8333-333333333333'
  state.sources = [{ ...first, state: 'pending', operationId }]
  state.models = []
  render(<SourcesPanel state={state} actions={commands} t={t} openEditor={() => {}} />)
  expect(screen.getByText('保存未完成')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^编辑/ }))
  fireEvent.click(within(screen.getByRole('dialog', { name: first.name })).getByRole('button', { name: '恢复原操作' }))
  expect(commands.resume).toHaveBeenCalledWith(operationId)
  expect(commands.editSource).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('API Key')).toBeNull()
  fireEvent.click(screen.getByText('完整模型目录 · 2'))
  expect(screen.getByText('fixture-untested')).toBeTruthy()
})
it('preserves complete saved inventories and management commands inside the current Key editor', () => {
  const state = snapshot(), commands = actions(), onClose = vi.fn()
  state.draft = {
    schemaVersion: 2, internalId: first.localRef, expectedLocalRevision: first.localRevision,
    name: first.name, apiKey: 'synthetic-key', sourcePresetId: null,
    advanced: { baseUrl: 'https://example.test/v1', anthropicUrl: null, modelsUrl: null, protocol: null },
  }
  render(<SourceEditor state={state} actions={commands} t={t} onClose={onClose} />)
  fireEvent.click(screen.getByText('完整模型目录 · 2'))
  expect(screen.getByText('fixture-tested')).toBeTruthy()
  expect(screen.getByText('fixture-untested')).toBeTruthy()
  expect(screen.getAllByText('已检测')).toHaveLength(1)
  expect(screen.getAllByText('未检测')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '下移' }))
  expect(commands.reorder).toHaveBeenCalledWith([second.localRef, first.localRef])
  fireEvent.click(screen.getByRole('button', { name: '重命名' }))
  fireEvent.change(screen.getByRole('dialog', { name: '重命名' }).querySelector('input')!, { target: { value: 'Renamed personal Key' } })
  fireEvent.click(within(screen.getByRole('dialog', { name: '重命名' })).getByRole('button', { name: '保存' }))
  expect(commands.rename).toHaveBeenCalledWith(first.localRef, 'Renamed personal Key')
  expect(commands.detectAndSave).not.toHaveBeenCalled()
})

it('shows configured credentials independently of a pending built-in source and reads details without a paid call', () => {
  const state = snapshot(), commands = actions(), operationId = '33333333-3333-4333-8333-333333333333'
  state.sources = [{
    schemaVersion: 3, localRef: first.localRef, name: first.name, localRevision: 'a'.repeat(64),
    sourceRevision: 'b'.repeat(64),
    route: 'local_direct', state: 'saved', operationId, inventory: first.inventory,
    probeSelection: { exactModelId: 'fixture-tested', protocol: 'openai_responses' },
    configuration: { providerId: 'openai', sourcePresetId: 'openai', baseUrl: 'https://example.test/v1', anthropicUrl: null },
  }]
  state.readiness = [{
    schemaVersion: 1, operationId, localRef: first.localRef, sourceRevision: 'b'.repeat(64), state:
      'pending', phase: 'validation',
    catalogVersion: null, catalogDigest: null, hostApplied: null, appliedModels: [], errorCode: null,
  }]
  render(<SourcesPanel state={state} actions={commands} t={t} openEditor={() => { }} />)
  expect(screen.getByRole('img', { name: '内置 AI 准备中' }).getAttribute('data-model-readiness')).toBe('pending')
  expect(screen.getByText('内置 AI 准备中')).toBeTruthy()
  expect(screen.queryByText('内置 AI 已就绪')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^编辑/ }))
  expect(commands.loadDetail).toHaveBeenCalledWith(first.localRef)
  expect(commands.validateBuiltin).not.toHaveBeenCalled()
  expect(commands.diagnostic).not.toHaveBeenCalled()
  expect(commands.refreshBalance).not.toHaveBeenCalled()
})
