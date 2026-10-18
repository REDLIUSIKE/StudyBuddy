import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { inject } from '../src/client/index.ts'

it('allows workspace draft preparation to select its exact model through a traced remote namespace', async () => {
  const ctx = new Context()
  const selection = { sessionId: 'prepared-session', provider: 'fixture', model: 'exact-fixture-model' }
  const selectModel = vi.fn(async () => ({ ok: true }))
  class TracedRemote extends Service {
    constructor(owner: Context) { super(owner, 'remote') }
    get session() { return Reflect.get(this.ctx, 'remote.session') }
  }
  let preparation: Promise<unknown> | undefined
  try {
    await ctx.plugin({ apply(provider: Context) {
      provider.provide('remote.session', { selectModel })
      new TracedRemote(provider)
      for (const dependency of inject) {
        if (dependency !== 'remote' && dependency !== 'remote.session') provider.provide(dependency, {})
      }
    } }).await()
    const fiber = ctx.plugin({ inject, apply(child: Context) {
      preparation = Promise.resolve().then(() => child.get('remote')!.session.selectModel(selection as never))
    } })
    await fiber.await()
    await expect(preparation).resolves.toEqual({ ok: true })
    expect(selectModel).toHaveBeenCalledExactlyOnceWith(selection)
  } finally { await ctx.fiber.dispose() }
})
