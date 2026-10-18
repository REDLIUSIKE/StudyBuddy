/** Synthetic native freeze for SDK projection coverage; this fixture grants no product authority. */
import { parseNativeBuiltinRequestFreezeV1 } from '../../../vendor/studybuddy-contracts/dist/native-builtin-consumer-v1.js'

export const name = 'snapshot-builtin-request-audit'
export const inject = ['sessions']

/**
 * Construct a secret-free native response fixture for the actual runtime Session.
 * @param {string} sessionId - Real Session identity supplied by the assembled runtime.
 * @returns {import('@studybuddy/contracts').NativeBuiltinRequestFreezeV1} Exact synthetic audit payload.
 */
export function fixtureFreeze(sessionId) {
  return parseNativeBuiltinRequestFreezeV1({
    schemaVersion: 1,
    scope: { accountId: '11111111-1111-4111-8111-111111111111', generation: 1 },
    hostGeneration: '33333333-3333-4333-8333-333333333333',
    catalogVersion: 'synthetic-sdk-catalog', catalogDigest: 'd'.repeat(64),
    selection: {
      routeId: 'synthetic-owned-route', sourceId: '22222222-2222-4222-8222-222222222222',
      localRef: 'synthetic-source', providerId: 'openai', exactModelId: 'synthetic-model',
      protocol: 'openai_chat_completions', connectionId: '55555555-5555-4555-8555-555555555555',
      credentialRevision: 'credential-1', grantRevision: 'a'.repeat(64), fundingSource: 'user_api',
    },
    authority: {
      logicalModelId: 'synthetic.model', providerId: 'openai', exactModelId: 'synthetic-model',
      displayName: 'Synthetic model', protocol: 'openai_chat_completions', contextWindow: 4096,
      maxOutputTokens: 128, capabilityFlags: [], evidenceSha256: 'b'.repeat(64),
      membershipRevision: 'member-1', capabilityRevision: 'cap-1', adapterRevision: 'adapter-1',
      priceAuthorityRevision: null, availability: 'available',
    },
    clientRequestId: '66666666-6666-4666-8666-666666666666', sessionId, purpose: 'chat',
  })
}

/**
 * Feed one native-boundary fixture into the real Session and SDK server without modifying its message surface.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Assembled profile services.
 */
export function apply(ctx) {
  ctx.on('agent/turn-stopping', ({ agent }) => {
    const session = agent.session
    if (session.header.parentSession !== undefined) return
    const before = JSON.stringify(session.deriveMessages())
    session.append('studybuddy/builtin-request', fixtureFreeze(session.id))
    if (JSON.stringify(session.deriveMessages()) !== before) throw new Error('audit changed model-visible messages')
  })
}
