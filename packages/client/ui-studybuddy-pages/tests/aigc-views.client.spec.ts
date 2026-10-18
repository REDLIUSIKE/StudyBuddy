import { expect, it } from 'vitest'
import { AigcViews } from '../src/client/aigc-views.ts'
it('retains native drafts by Session across project switches and rejects stale account/geometry notifications', () => {
  const released: string[] = [], retained: string[] = [], scope = { accountId: 'a', generation: 1 }
  const views = new AigcViews(id => { retained.push(id); return { release: () => released.push(id) } as never })
  views.setScope(scope, 'lease-a'); views.setFrame({ x: 100, y: 50, width: 900, height: 600 })
  const notice = (revision: number, sessionId: string, project = 'aigc-' + 'a'.repeat(48)) => ({ lease: 'lease-a', scope, revision, kind: 'selection', data: { projectId: project, workspaceId: 'workspace-a', sessionId } })
  const a = 'session-00000000-0000-4000-8000-000000000001', b = 'session-00000000-0000-4000-8000-000000000002'
  expect(views.accept(notice(1, a))).toBe(true)
  views.accept({ lease: 'lease-a', scope, revision: 1, kind: 'surface', data: { sessionId: a, visible: true, rect: { x: 500, y: 80, width: 400, height: 500 } } })
  expect(views.getSnapshot().geometry).toMatchObject({ visible: true, bounds: { x: 600, y: 130, width: 400, height: 500 } })
  views.accept(notice(2, b, 'aigc-' + 'b'.repeat(48))); views.accept(notice(3, a)); expect(retained).toEqual([a, b])
  expect(views.getSnapshot().views.find(view => view.selected)?.reference).toBe(views.getSnapshot().views[0]?.reference)
  expect(views.accept(notice(2, b))).toBe(false)
  views.setScope(scope, 'lease-reconnected')
  expect(views.accept({ ...notice(1, a), lease: 'lease-reconnected' })).toBe(true)
  expect(retained).toEqual([a, b]); expect(released).toEqual([])
  expect(views.accept(notice(4, b))).toBe(false)
  views.setScope({ accountId: 'b', generation: 2 }, 'lease-b'); expect(released).toEqual([a, b]); expect(views.getSnapshot().geometry.visible).toBe(false)
  expect(views.accept(notice(4, a))).toBe(false)
})

it('queues bounded source references for the selected native draft without submitting them', () => {
  const scope = { accountId: 'a', generation: 1 }, views = new AigcViews(() => ({ release() {} }) as never)
  views.setScope(scope, 'lease')
  const sessionId = 'session-00000000-0000-4000-8000-000000000001'
  views.accept({ lease: 'lease', scope, revision: 1, kind: 'selection', data: { projectId: 'aigc-' + 'a'.repeat(48), workspaceId: 'project', sessionId } })
  const notice = { lease: 'lease', scope, revision: 1, kind: 'reference', data: { id: '00000000-0000-4000-8000-000000000002', sessionId, text: 'Canvas output reference' } }
  expect(views.accept(notice)).toBe(true)
  expect(Reflect.get(views.getSnapshot(), 'references')).toEqual([notice.data])
  expect(views.accept({ ...notice, data: { ...notice.data, sessionId: 'session-00000000-0000-4000-8000-000000000003' } })).toBe(false)
  const acknowledge = Reflect.get(views, 'acknowledgeReference') as (id: string) => void; acknowledge.call(views, notice.data.id)
  expect(Reflect.get(views.getSnapshot(), 'references')).toEqual([])
})

it('retains a native question owner separately from selected project and releases its overlay on settlement', () => {
  const scope = { accountId: 'a', generation: 1 }, retained: string[] = []
  const views = new AigcViews(id => { retained.push(id); return { release() {} } as never })
  views.setScope(scope, 'lease')
  const data = { id: '00000000-0000-4000-8000-000000000001', projectId: 'aigc-' + 'a'.repeat(48), workspaceId: 'helper', sessionId: 'session-00000000-0000-4000-8000-000000000002' }
  expect(views.accept({ lease: 'lease', scope, kind: 'interaction', data: { ...data, active: true } })).toBe(true)
  expect(Reflect.get(views.getSnapshot(), 'interactionSessionId')).toBe(data.sessionId)
  expect(views.getSnapshot().views[0]?.selected).toBe(false)
  expect(views.accept({ lease: 'lease', scope, kind: 'interaction', data: { ...data, active: false } })).toBe(true)
  expect(Reflect.get(views.getSnapshot(), 'interactionSessionId')).toBeUndefined()
  expect(retained).toEqual([data.sessionId])
})
