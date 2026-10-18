import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { isAgentLoopRequest, LlmAdapter, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'

class RequestTrustAdapter extends LlmAdapter {
  override async resolveModel(provider: string, id: string) { return { provider, id, name: id, defaultMaxTokens: 16 } }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: isAgentLoopRequest(options) ? 'trusted loop' : 'untrusted caller' }
  }
}

it('retains process-local loop authority while resolving defaults and does not mint it for a caller', async () => {
  const ctx = new Context(); new LlmRuntime(ctx); ctx.llm.registerAdapter(['route'], new RequestTrustAdapter())
  try {
    const run = async (request: GenerateOptions) => {
      const chunks = []
      for await (const chunk of ctx.llm.stream(request)) chunks.push(chunk); return chunks
    }
    expect(await run(markAgentLoopRequest(Object.freeze({
      provider: 'route', model: 'exact-model', messages:
        [],
    })))).toEqual([{ type: 'text-delta', index: 0, text: 'trusted loop' }])
    expect(await run({ provider: 'route', model: 'exact-model', messages: [] })).toEqual([{
      type: 'text-delta', index:
        0, text: 'untrusted caller',
    }])
  } finally { await ctx.fiber.dispose() }
})
