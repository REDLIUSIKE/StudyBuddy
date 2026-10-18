import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import DeepSeekLlmApiExtensionRegistry from '@deepseek-ai/dsh-deepseek-llm-api-extensions'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as RetiredUpload from '../src/index.ts'

it('prepares model requests without upload fields or acceptance markers', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(DeepSeekLlmApiExtensionRegistry)
    await ctx.plugin(RetiredUpload)
    const session = ctx.sessions.create(SessionId('studybuddy-private-session'))
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'private study note' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    const prepared = await ctx.deepseekLlmApiExtensions.prepare({
      body: { messages: [{ role: 'user', content: 'private study note' }] },
      signal: new AbortController().signal, sessionId: session.id,
    })
    expect(prepared.fields).not.toHaveProperty('dsh_session_log')
    await prepared.accept()
    expect(session.snapshotEvents().map(event => event.type)).toEqual(['user/message'])
  } finally { await ctx.fiber.dispose() }
})
