import { expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SidebarSessionSurfaces } from '../src/client/session-surfaces.ts'

it('selects the active embedded Session without changing the ordinary Conversation selection', () => {
  const panel = createSnapshotStore<string | null>(null), normal = createSnapshotStore<SessionId | undefined>('chat' as SessionId)
  const video = createSnapshotStore<SessionId | undefined>('video-a' as SessionId)
  const owner = new SidebarSessionSurfaces(panel, normal)
  const remove = owner.register('studybuddy.video', video)
  expect(owner.source.getSnapshot()).toBe('chat')
  panel.set('studybuddy.video')
  expect(owner.source.getSnapshot()).toBe('video-a')
  video.set('video-b' as SessionId)
  expect(owner.source.getSnapshot()).toBe('video-b')
  expect(normal.getSnapshot()).toBe('chat')
  panel.set('studybuddy.tools')
  expect(owner.source.getSnapshot()).toBeUndefined()
  video.set('hidden-project' as SessionId)
  expect(owner.source.getSnapshot()).toBeUndefined()
  panel.set(null)
  expect(owner.source.getSnapshot()).toBe('chat')
  panel.set('studybuddy.video'); remove()
  expect(owner.source.getSnapshot()).toBeUndefined()
  owner.dispose()
  video.set('late-project' as SessionId); panel.set(null)
  expect(owner.source.getSnapshot()).toBeUndefined()
})

it('clears revoked project Sessions and refuses duplicate panel owners', () => {
  const panel = createSnapshotStore<string | null>('studybuddy.video'), normal = createSnapshotStore<SessionId | undefined>(undefined)
  const video = createSnapshotStore<SessionId | undefined>('video' as SessionId)
  const owner = new SidebarSessionSurfaces(panel, normal)
  owner.register('studybuddy.video', video)
  expect(() => owner.register('studybuddy.video', normal)).toThrow('Sidebar Session surface already registered')
  video.set(undefined)
  expect(owner.source.getSnapshot()).toBeUndefined()
  owner.dispose()
})
