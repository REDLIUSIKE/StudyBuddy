// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SourceManagement } from '../src/client/SourceManagement.tsx'
import type { SourceSnapshot } from '../src/client/source-controller.ts'
import type { AccountFace } from '../src/client/face.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
const op = '33333333-3333-4333-8333-333333333333'
const source: SourceSnapshot['sources'][number] = {
  schemaVersion: 3, localRef: 'fixture-key', name: 'Fixture',
  localRevision: 'a'.repeat(64), sourceRevision: 'b'.repeat(64),
  route: 'local_direct', state: 'saved', operationId: op, inventory: null, probeSelection: {
    exactModelId:
      'fixture-exact', protocol: 'openai_responses',
  },
  configuration: { providerId: 'openai', sourcePresetId: 'openai', baseUrl: 'https://example.test/v1', anthropicUrl: null },
}
function fixture() {
  const noop = vi.fn(async () => { }), commands: AccountFace['source'] = {
    load: noop, createDraft: vi.fn(), editSource:
      vi.fn(), editDraft: vi.fn(), check: noop, save: noop, detectAndSave: noop,
    resume: noop, resumeLegacy: noop, remove: noop, rename: noop, reorder: noop, clearDraft: vi.fn(), ping: noop, probe: noop,
    loadDetail: vi.fn(async () => { }), resumeBuiltin: vi.fn(async () => { }), validateBuiltin: vi.fn(async () => { }),
    refreshBalance: vi.fn(async () => { }), diagnostic: vi.fn(async () => { }),
  }
  const state: SourceSnapshot = {
    scope: { accountId: 'fixture-owner', generation: 1 }, sources: [source], models: [],
    registrations: [], draft: null, checkResult: null, pending: null,
    nativeCatalog: null, busy: false, errorCode: null, probe: null, ping: null, details: {}, readiness: [{
      schemaVersion: 1, operationId: op, localRef: source.localRef, sourceRevision: 'b'.repeat(64),
      state: 'pending', phase: 'validation', catalogVersion: null, catalogDigest: null, hostApplied: null,
      appliedModels: [], errorCode: null,
    }],
  }
  return { state, commands }
}
it('reads cached source detail on opening and keeps control recovery separate from explicit model validation', () => {
  const { state, commands } = fixture()
  render(<SourceManagement source={source} state={state} actions={commands} t={key => zh[key]} onClose={() => { }} />)
  expect(commands.loadDetail).toHaveBeenCalledWith(source.localRef)
  expect(commands.refreshBalance).not.toHaveBeenCalled()
  expect(commands.validateBuiltin).not.toHaveBeenCalled()
  expect(commands.diagnostic).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '继续准备' }))
  expect(commands.resumeBuiltin).toHaveBeenCalledWith(op)
  expect(commands.validateBuiltin).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '验证模型' }))
  expect(commands.validateBuiltin).toHaveBeenCalledWith(op)
})
it('shows real zero timings while preserving unknown terminal usage instead of a normalized zero', () => {
  const { state, commands } = fixture()
  const selection = {
    routeId: 'fixture-route', sourceId: 'fixture-source', localRef: source.localRef, providerId:
      'openai' as const, exactModelId: 'fixture-exact', protocol: 'openai_responses' as const,
    connectionId: '44444444-4444-4444-8444-444444444444', credentialRevision: 'cred-1', grantRevision: 'grant-1',
    fundingSource: 'user_api' as const,
  }
  state.details = {
    [source.localRef]: {
      schemaVersion: 1, localRef: source.localRef, readiness: state.readiness[0]!, balance: null,
      lastDiagnostics: [{
        schemaVersion: 1, operationId: op, clientRequestId: '55555555-5555-4555-8555-555555555555',
        selection, purpose: 'diagnostic', providerResponseId: null,
        returnedModel: null, outcome: 'unknown', usageOrigin: 'unknown', usage: null, firstVisibleTextMs: 0,
        dispatchToTerminalMs: 0, errorCode: null,
      }],
    },
  }
  render(<SourceManagement source={source} state={state} actions={commands} t={key => zh[key]} onClose={() => { }} />)
  fireEvent.click(screen.getByText('来源诊断'))
  expect(screen.getAllByText('0 毫秒')).toHaveLength(2)
  expect(screen.getByText('用量待确认')).toBeTruthy()
  expect(screen.queryByText(/Infinity|NaN|0 Token/)).toBeNull()
  expect(screen.getByRole('button', { name: '运行诊断' }).hasAttribute('disabled')).toBe(true)
})
it.each([500, 0,
  null])('reports whole-request throughput only with trusted terminal output and a positive observed duration: %s', (duration) => {
  const { state, commands } = fixture(), selection = {
    routeId: 'fixture-route', sourceId: 'fixture-source', localRef:
      source.localRef, providerId: 'openai' as const, exactModelId: 'fixture-exact', protocol: 'openai_responses' as const,
    connectionId: '44444444-4444-4444-8444-444444444444', credentialRevision: 'cred-1', grantRevision: 'grant-1',
    fundingSource: 'user_api' as const,
  }
  state.details = {
    [source.localRef]: {
      schemaVersion: 1, localRef: source.localRef, readiness: state.readiness[0]!, balance:
        null, lastDiagnostics: [{
        schemaVersion: 1, operationId: op, clientRequestId: '55555555-5555-4555-8555-555555555555',
        selection, purpose: 'diagnostic', providerResponseId: 'actual-response', returnedModel: 'fixture-exact', outcome:
            'completed', usageOrigin: 'provider_terminal', usage: {
          inputTokens: 3, outputTokens: 8, inputTotalTokens: 3,
          cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cacheWrite5mTokens: null, cacheWrite1hTokens:
                null,
        }, firstVisibleTextMs: 100, dispatchToTerminalMs: duration, errorCode: null,
      }],
    },
  }
  render(<SourceManagement source={source} state={state} actions={commands} t={key => zh[key]} onClose={() => { }} />)
  fireEvent.click(screen.getByText('来源诊断'))
  expect(screen.getByText(duration === 500 ? '请求平均输出速率: 16.00 Token/秒' : '请求平均输出速率: 待确认')).toBeTruthy()
  expect(screen.queryByText(/Infinity|NaN|20\.00/)).toBeNull()
  expect(screen.getByText(/运行诊断会调用所选模型一次，输出上限 32 Token/)).toBeTruthy()
})
