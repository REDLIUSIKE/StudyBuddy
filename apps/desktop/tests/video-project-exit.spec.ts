import { expect, it, vi } from 'vitest'
import { StudyBuddyVideo } from '../src/studybuddy/video.ts'
import { VIDEO_IPC } from '../src/studybuddy/video-types.ts'

it('explicitly exits active project work before acknowledging the library, rather than retaining its task lease', async () => {
  const scope = { accountId: 'account', generation: 1 }
  let finish!: () => void
  const closeProject = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  const releaseView = vi.fn(async () => {})
  const send = vi.fn()
  const video = new StudyBuddyVideo({
    auth: { scope: () => scope }, runtime: { ensure: async () => ({ editorOrigin: 'http://127.0.0.1:3333' }) },
    bridge: { closeProject, releaseView },
  } as never)
  const state = video as unknown as {
    guests: { checkedGuest: () => unknown }
    selected: Map<number, { projectId: string; sessionId: string; projectEpoch: number }>
    requestedProjects: Map<number, string | null>
  }
  state.guests.checkedGuest = () => ({ lease: { scope, lease: 'lease' } })
  state.requestedProjects.set(7, 'project')
  state.selected.set(7, { projectId: 'project', sessionId: 'session', projectEpoch: 1 })
  const handlers = new Map<string, (event: unknown, action: unknown) => Promise<unknown>>()
  video.register({ handle: (name: string, handler: never) => handlers.set(name, handler) } as never, () => {}, () => {})
  const event = { sender: { id: 7, hostWebContents: { isDestroyed: () => false, send } }, senderFrame: { url: 'http://127.0.0.1:3333/projects/project' } }
  let acknowledged = false
  const invoke = handlers.get(VIDEO_IPC.guestAction)
  if (!invoke) throw new Error('Video action handler not mounted')
  const closing = invoke(event, { kind: 'project', projectId: null, projectEpoch: 2 }).then((result) => { acknowledged = true; return result })
  await vi.waitFor(() => { expect(closeProject).toHaveBeenCalledExactlyOnceWith(scope, 'project') })
  expect(releaseView).not.toHaveBeenCalled()
  expect(acknowledged).toBe(false)
  expect(state.selected.has(7)).toBe(false)
  expect(send).toHaveBeenCalledWith(VIDEO_IPC.action, expect.objectContaining({ kind: 'library', closedProjectId: 'project' }))
  finish()
  expect(await closing).toEqual({ ok: true, data: null })
  state.requestedProjects.set(7, 'project')
  closeProject.mockRejectedValueOnce(new Error('VIDEO_SCOPE_REVOKED'))
  expect(await invoke(event, { kind: 'project', projectId: null, projectEpoch: 3 })).toEqual({ ok: false, error: { code: 'VIDEO_SCOPE_REVOKED' } })
  expect(state.requestedProjects.get(7)).toBe('project')
})
