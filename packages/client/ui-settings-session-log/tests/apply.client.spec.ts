import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'

it('leaves General settings and the toast layer empty for legacy upload configurations', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({ name: 'root', children: {
      'settings.general.item': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    } } as never, () => null)
    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()
    expect(slots.entries('settings.general.item')).toHaveLength(0)
    expect(slots.entries('shell.overlay')).toHaveLength(0)
    await fiber.dispose()
  } finally { await ctx.fiber.dispose() }
})
