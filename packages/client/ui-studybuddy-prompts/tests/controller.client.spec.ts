import { describe, expect, it } from 'vitest'
import { PromptController, type PromptHost, type PromptRecord } from '../src/client/controller.ts'

const row: PromptRecord = { id: '00000000-0000-4000-8000-000000000001', title: '协作', body: '一\n\n  二  ', revision: 1, owned: true, sourceId: '00000000-0000-4000-8000-000000000001', createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' }
describe('account-scoped prompt projection', () => {
  it('keeps a completed save when an older mine request arrives last', async () => {
    let settle!: (value: unknown) => void
    const controller = new PromptController({ invoke: async method => method === 'mine' ? new Promise(resolve => { settle = resolve }) : row })
    controller.setScope('one')
    const old = controller.loadMine()
    await controller.save({ id: row.id, title: row.title, body: row.body, expectedRevision: 0 })
    settle([]); await old
    expect(controller.getSnapshot().items).toEqual([row])
  })
  it('keeps a returned publication when an earlier square baseline arrives last', async () => {
    let settle!: (value: unknown) => void
    const controller = new PromptController({ invoke: async method => method === 'square' ? new Promise(resolve => { settle = resolve }) : row })
    controller.setScope('one')
    const old = controller.loadSquare()
    await controller.publish(row)
    settle([]); await old
    expect(controller.getSnapshot().publicItems).toEqual([row])
  })
  it('advances the square page only after success and resets it after a refresh', async () => {
    let fail = false
    const controller = new PromptController({ invoke: async () => { if (fail) throw Error('NETWORK_UNAVAILABLE'); return [row] } })
    controller.setScope('one')
    await controller.loadSquare('', 1)
    fail = true; await expect(controller.loadSquare('', 2)).rejects.toThrow()
    expect(controller.getSnapshot().squarePage).toBe(1)
    fail = false; await controller.loadSquare('', 2)
    expect(controller.getSnapshot().squarePage).toBe(2)
    await controller.loadSquare('', 1)
    expect(controller.getSnapshot().squarePage).toBe(1)
  })
  it('discards a late private list after changing accounts', async () => {
    let settle!: (value: unknown) => void
    const host: PromptHost = { invoke: async () => new Promise(resolve => { settle = resolve }) }
    const controller = new PromptController(host)
    controller.setScope('one')
    const load = controller.loadMine()
    controller.setScope('two')
    settle([row])
    await load
    expect(controller.getSnapshot().items).toEqual([])
    expect(controller.getSnapshot().scope).toBe('two')
  })
  it('retries exactly the saved publication identity and exposes the returned square card', async () => {
    const requests: unknown[] = []
    const controller = new PromptController({ invoke: async (method, args) => {
      if (method === 'mine') return [row]
      requests.push(args[0])
      if (requests.length === 1) throw new Error('NETWORK_UNAVAILABLE')
      return { ...row, id: '00000000-0000-4000-8000-000000000002' }
    } })
    controller.setScope('one')
    await controller.loadMine()
    await expect(controller.publish(row)).rejects.toThrow('NETWORK_UNAVAILABLE')
    await controller.publish(row)
    expect(requests[1]).toEqual(requests[0])
    expect(controller.getSnapshot().publicItems[0]?.body).toBe(row.body)
  })
  it('never replaces private records with another owner public record', async () => {
    const controller = new PromptController({ invoke: async () => [{ ...row, owned: false, sourceId: null }] })
    controller.setScope('one')
    await expect(controller.loadMine()).rejects.toThrow('PROMPT_RESPONSE_INVALID')
    expect(controller.getSnapshot().items).toEqual([])
  })
})
