import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import LlmRuntime, { markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId, KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { snapshotSessionFormatJson } from '@deepseek-ai/dsh-session-format'
import { canonicalNativeBuiltinCatalogPayloadV1, parseNativeBuiltinCatalogAppliedV1 } from '@studybuddy/contracts'
import type { NativeBuiltinCatalogApplyV1, NativeBuiltinRequestFreezeV1 } from '@studybuddy/contracts'
import { afterEach, expect, it, vi } from 'vitest'
import { installBuiltinHostControl } from '../src/studybuddy-builtin-models.ts'
import type { BuiltinHostControl } from '../src/studybuddy-builtin-models.ts'
import { restoreReleasedV4Artifact } from '../../../packages/session/session-format-v3-to-v4/src/index.ts'
import {installResearchBudgetGuard} from '../src/research-budget-guard.ts'

const contexts: Context[] = []
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
const scope = { accountId: '11111111-1111-4111-8111-111111111111', generation: 1 }
const operationId = '44444444-4444-4444-8444-444444444444'
async function fixture(durable: boolean) {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(LlmRuntime); await ctx.plugin(AgentRegistry); await ctx.plugin(SessionStore)
  await ctx.plugin(DefaultModel, { provider: '', model: '' })
  const session = ctx.sessions.create(SessionId('88888888-8888-4888-8888-888888888888'), { meta: { delegationDepth: 0 } })
  const agent = { id: session.id, ctx, session, status: 'running' } as Agent
  const facts: NativeBuiltinRequestFreezeV1[] = [], flush = vi.fn(() => {
    facts.push(session.snapshotEvents().findLast(row => row.type === 'studybuddy/builtin-request')!.data as NativeBuiltinRequestFreezeV1)
  })
  if (durable) ctx.on('session/flush', flush)
  const control: BuiltinHostControl = installBuiltinHostControl(ctx, async (message) => {
    const request = (message as { request: NativeBuiltinRequestFreezeV1 }).request
    control.admissionResult({
      clientRequestId: request.clientRequestId, data: {
        schemaVersion: 1, clientRequestId: request.clientRequestId,
        selection: request.selection, authority: request.authority, sessionId: request.sessionId, purpose:
          request.purpose, requestReceipt: null,
      },
    })
  })
  const input: NativeBuiltinCatalogApplyV1 = {
    schemaVersion: 1, operationId, scope, hostGeneration:
      control.hostGeneration, catalogVersion: 'owned-catalog', catalogDigest: '0'.repeat(64),
    routes: [{
      mode: 'local_direct', routeId: 'owned-route', displayName: 'Owned source', baseUrl:
        'https://api.openai.com/v1', apiKey: 'private-test-key',
      grant: {
        schemaVersion: 1, grantRevision: 'a'.repeat(64), catalogRevision: 'manual-1', accountOwner:
          scope.accountId, deviceId: control.hostGeneration,
        sourceId: '22222222-2222-4222-8222-222222222222', connectionId: '22222222-2222-4222-8222-222222222222',
        localRef: 'owned-source', credentialRevision: 'credential-1', protocol: 'openai_chat_completions',
        authorityExpiresAt: 4_000_000_000,
        allowedModels: [{
          logicalModelId: 'manual.model', providerId: 'openai', exactModelId: 'model-a', displayName:
            'Exact model', protocol: 'openai_chat_completions', contextWindow: 4096, maxOutputTokens: 128,
          capabilityFlags: [], evidenceSha256: 'b'.repeat(64), membershipRevision: 'member-1', capabilityRevision:
            'cap-1', adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available',
        }],
      },
    }],
  }
  const snapshot = { ...input, catalogDigest: createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(input)).digest('hex') }
  const ack = parseNativeBuiltinCatalogAppliedV1(await control.command('apply', snapshot))
  await control.command('publish', {
    schemaVersion: 1, readiness: {
      schemaVersion: 1, operationId, localRef:
        'owned-source', sourceRevision: 'c'.repeat(64), state: 'ready', phase: 'ready', catalogVersion: ack.catalogVersion,
      catalogDigest: ack.catalogDigest, hostApplied: ack, appliedModels: ack.applied, errorCode: null,
    },
  })
  const wire = vi.fn<typeof fetch>(async () => {
    expect(flush).toHaveBeenCalledOnce()
    return new Response('data: ' + JSON.stringify({
      id: 'actual-response', model: 'model-a', choices: [{
        index: 0, delta:
          { content: 'OK' }, finish_reason: 'stop',
      }], usage: {
        prompt_tokens: 1, completion_tokens: 1, total_tokens:
          2,
      },
    }) + '\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', wire)
  const options = markAgentLoopRequest({ provider: 'owned-route', model: 'model-a', sessionId: session.id, messages: [] })
  const dispatch = async () => { const chunks = []; for await (const chunk of ctx.llm.stream(options)) chunks.push(chunk); return chunks }
  return { ctx, agent, session, facts, flush, wire, dispatch }
}
it('uses the real initiator scope and durably records a keyless exact freeze before actual SDK dispatch', async () => {
  const { ctx, agent, session, facts, wire, dispatch } = await fixture(true)
  expect((await dispatch()).at(-1)).toMatchObject({
    type: 'finish', reason: {
      kind: 'error', failure: {
        code:
          'BUILTIN_TRUST_REQUIRED',
      },
    },
  })
  expect(wire).not.toHaveBeenCalled()
  await ctx.agents.withInitiator(agent, dispatch)
  expect(wire).toHaveBeenCalledOnce()
  expect(facts).toEqual([expect.objectContaining({
    purpose: 'chat', sessionId: session.id, scope, selection:
      expect.objectContaining({ localRef: 'owned-source', credentialRevision: 'credential-1' }),
  })])
  const events = session.snapshotEvents()
  expect(JSON.stringify(events)).not.toContain('private-test-key')
  expect(JSON.stringify(events)).not.toContain('requestTicket')
  expect(KNOWN_SESSION_EVENT_TYPES.has('studybuddy/builtin-request')).toBe(true)
  const artifact = {
    header: { ...session.header, delegationDepth: session.header.delegationDepth ?? 0 },
    events: events.map(event => ({ ...event, data: snapshotSessionFormatJson(event.data) })), inheritedEventCount: 0,
  }
  expect(restoreReleasedV4Artifact(artifact, KNOWN_SESSION_EVENT_TYPES).events).toEqual(events)
  const previousVocabulary = new Set(KNOWN_SESSION_EVENT_TYPES); previousVocabulary.delete('studybuddy/builtin-request')
  expect(() => restoreReleasedV4Artifact(artifact, previousVocabulary)).toThrow('unknown event type')
  const restored = Session.create(SessionId('99999999-9999-4999-8999-999999999999'), events)
  expect(restored.snapshotEvents().slice(0, events.length)).toEqual(events)
})
it('refuses wire dispatch when the real Session has no durability participant', async () => {
  const { ctx, agent, wire, dispatch } = await fixture(false)
  expect((await ctx.agents.withInitiator(agent, dispatch)).at(-1)).toMatchObject({
    type: 'finish', reason: {
      kind:
        'error', failure: { code: 'BUILTIN_AUDIT_UNAVAILABLE' },
    },
  })
  expect(wire).not.toHaveBeenCalled()
})
it('runs project budget admission before any key or SDK dispatch and leaves the original draft request unpaid on pause',async()=>{
 const {ctx,agent,session,facts,wire,dispatch}=await fixture(true),guard=vi.fn(async()=>{throw Error('RESEARCH_BUDGET_REACHED')}),dispose=installResearchBudgetGuard(ctx,guard)
 try{const chunks=await ctx.agents.withInitiator(agent,dispatch);expect(chunks.at(-1)).toMatchObject({type:'finish',reason:{kind:'error'}});expect(guard).toHaveBeenCalledWith(expect.objectContaining({sessionId:session.id,modelId:'model-a',fundingSource:'user_api'}));expect(wire).not.toHaveBeenCalled();expect(facts).toEqual([]);}finally{dispose()}
})
