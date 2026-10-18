import { expect, it } from 'vitest'
import { ResearchPageController } from '../src/client/research-controller.ts'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'

it('shows an owned failed selection, retains old references and rejects stale or foreign failures', async () => {
  const scope = { accountId: 'synthetic-a', generation: 1 }, released: string[] = []
  const host = { acquire: async () => ({ lease: 'lease', partition: 'test', entryUrl: 'http://127.0.0.1:9999/', scope }), release: async () => {}, setTheme: async () => {}, setVisible: async () => {}, subscribeInvalid: () => () => {} }
  const controller = new ResearchPageController(host, id => ({ sessionId: id, release: () => { released.push(id) } }) as SessionReference)
  controller.setScope(scope); await controller.page.acquire()
  const notice = (projectId: string, revision: number, data?: object) => ({ lease: 'lease', scope, revision, action: { kind: 'open-project', projectId }, ...(data ? { data } : { errorCode: 'RESEARCH_NATIVE_SESSION_UNAVAILABLE' }) })
  controller.accept(notice('alpha', 1, { projectId:'alpha',sessionId:'session-a' }))
  expect(controller.accept(notice('beta', 2))).toBe(true)
  expect(controller.getSnapshot().selectionError).toEqual({ projectId:'beta' })
  expect(controller.getSnapshot().views[0]?.selected).toBe(false)
  expect(released).toEqual([])
  expect(controller.accept({ ...notice('beta', 3), scope: { ...scope, generation:2 } })).toBe(false)
  expect(controller.accept(notice('alpha', 1, { projectId:'alpha',sessionId:'session-a' }))).toBe(false)
  controller.accept(notice('beta', 3, { projectId:'beta',sessionId:'session-b' }))
  expect(controller.getSnapshot().selectionError).toBeUndefined()
  controller.setScope(null); expect(released.sort()).toEqual(['session-a','session-b'])
  controller.dispose()
})

it('retains independent project references and rejects notices for another lease or account', async () => {
  const scope = { accountId: 'synthetic-a', generation: 1 }, released: string[] = [], retained: string[] = []
  const make = (id: string) => { retained.push(id); return { sessionId: id, release: () => { released.push(id) } } as SessionReference }
  const host = { acquire: async () => ({ lease: 'lease-a', partition: 'test', entryUrl: 'http://127.0.0.1:1/', scope }), release: async () => {}, setTheme: async () => {} }
  const controller = new ResearchPageController(host, make)
  controller.setScope(scope); await controller.page.acquire()
  const notice = (id: string) => ({ lease: 'lease-a', scope, action: { kind: 'open-project', projectId: id }, data: { projectId: id, workspaceId: 'workspace-' + id, sessionId: 'session-' + id } })
  expect(controller.accept(notice('a'))).toBe(true)
  expect(controller.accept(notice('b'))).toBe(true)
  expect(controller.accept(notice('a'))).toBe(true)
  expect(retained).toEqual(['session-a', 'session-b'])
  expect(controller.getSnapshot().views.map(row => [row.projectId, row.selected])).toEqual([['a', true], ['b', false]])
  expect(controller.accept({ ...notice('c'), lease: 'stale' })).toBe(false)
  expect(controller.accept({ ...notice('c'), scope: { ...scope, accountId: 'synthetic-b' } })).toBe(false)
  controller.setScope(null); expect(controller.getSnapshot().views).toEqual([]); expect(released).toEqual(['session-a', 'session-b'])
  controller.dispose()
})
it('keeps two native chat references within one project and ignores a late selection', async () => {
  const scope = { accountId: 'account', generation: 1 }, retained: string[] = []
  const host = { acquire: async () => ({ lease: 'lease', partition: 'test', entryUrl: 'http://127.0.0.1:1/', scope }), release: async () => {}, setTheme: async () => {} }
  const controller = new ResearchPageController(host, id => { retained.push(id); return { sessionId: id, release: () => {} } as SessionReference })
  controller.setScope(scope); await controller.page.acquire()
  const notice = (id: string, revision: number) => ({ lease: 'lease', scope, revision, action: { kind: 'select-chat', projectId: 'study', sessionId: id }, data: { projectId: 'study', workspaceId: 'workspace', sessionId: id } })
  expect(controller.accept(notice('session-a', 1))).toBe(true)
  expect(controller.accept(notice('session-b', 3))).toBe(true)
  expect(controller.accept(notice('session-a', 2))).toBe(false)
  expect(controller.getSnapshot().views.map(row => [row.sessionId, row.selected])).toEqual([['session-a', false], ['session-b', true]])
  expect(retained).toEqual(['session-a', 'session-b'])
  controller.dispose()
})
it('restores prepared prompts per native Session and removes only the acknowledged intake', async () => {
  const scope = { accountId: 'account', generation: 1 }
  const controller = new ResearchPageController({ acquire: async () => ({ lease: 'lease', partition: 'test', entryUrl: 'http://127.0.0.1:1/', scope }), release: async () => {}, setTheme: async () => {} }, id => ({ sessionId: id, release: () => {} }) as SessionReference)
  controller.setScope(scope); await controller.page.acquire()
  const id = '11111111-1111-4111-8111-111111111111'
  controller.accept({ lease: 'lease', scope, action: { kind: 'open-project', projectId: 'study' }, data: { projectId: 'study', sessionId: 'session-a', workspaceId: 'workspace', intents: [{ id, projectId: 'study', sessionId: 'session-a', text: 'Reviewed workflow', references: ['study.csv'], createdAt: '2026-10-13T01:00:00Z' }] } })
  expect(controller.getSnapshot().views[0]?.intents).toHaveLength(1)
  controller.acknowledgeIntent('22222222-2222-4222-8222-222222222222'); expect(controller.getSnapshot().views[0]?.intents).toHaveLength(1)
  controller.acknowledgeIntent(id); expect(controller.getSnapshot().views[0]?.intents).toEqual([])
  controller.dispose()
})
it('hides the native conversation after its last tab closes without retaining a replacement or accepting a late selection', async () => {
  const scope = { accountId: 'account', generation: 1 }, retained: string[] = [], released: string[] = []
  const controller = new ResearchPageController({ acquire: async () => ({ lease: 'lease', partition: 'test', entryUrl: 'http://127.0.0.1:1/', scope }), release: async () => {}, setTheme: async () => {} }, id => {
    retained.push(id); return { sessionId: id, release: () => { released.push(id) } } as SessionReference
  })
  controller.setScope(scope); await controller.page.acquire()
  const opened = { lease: 'lease', scope, revision: 1, action: { kind: 'open-project', projectId: 'study' }, data: { projectId: 'study', sessionId: 'session-a' } }
  expect(controller.accept(opened)).toBe(true)
  const empty = { lease: 'lease', scope, revision: 2, action: { kind: 'close-chat', projectId: 'study', sessionId: 'session-a' }, data: { projectId: 'study', sessionId: null, chats: [{ sessionId: 'session-a', label: 'Research 1', closed: true }], intents: [] } }
  expect(controller.accept(empty)).toBe(true)
  expect(controller.getSnapshot().views.map(row => row.selected)).toEqual([false])
  expect(controller.getSnapshot().selectionError).toBeUndefined()
  expect(retained).toEqual(['session-a']); expect(released).toEqual([])
  expect(controller.accept(opened)).toBe(false)
  expect(controller.accept({ ...empty, revision: 3, scope: { ...scope, generation: 2 } })).toBe(false)
  expect(controller.accept({ ...empty, revision: 3, data: { ...empty.data, projectId: 'other' } })).toBe(false)
  expect(controller.accept({ ...empty, revision: 3, action: { kind: 'new-chat', projectId: 'study' } })).toBe(false)
  expect(controller.accept({ ...opened, revision: 3, action: { kind: 'select-chat', projectId: 'study', sessionId: 'session-a' } })).toBe(true)
  expect(controller.getSnapshot().views.map(row => row.selected)).toEqual([true]); expect(retained).toEqual(['session-a'])
  controller.dispose(); expect(released).toEqual(['session-a'])
})
