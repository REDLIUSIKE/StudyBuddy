// @vitest-environment jsdom
/** Loader/Gateway facade, real project storage and policy, and keyless draft navigation. */
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, onTestFinished, vi } from 'vitest'
import { createClientTest } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/vitest.ts'
import { ClientRoster } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/roster.ts'
import { makeTranslate, TestSessions } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ClientWorkspaceModel, WorkspaceController } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ProjectRequestId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import SessionStore from '../../../core/session/src/index.ts'
import Storage from '../../../storage/storage/src/index.ts'
import { DomainFacility } from '../../../storage/storage-domain/src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import WorkspaceRegistry from '../../../workspace/workspace/src/index.ts'
import SandboxPolicyService from '../../../sandbox/sandbox-policy/src/index.ts'
import HostWorkspaceController from '../../../api/workspace-controller/src/index.ts'
import { workspaceView } from '../../../api/workspace-controller/src/feed.ts'
import { SessionCommandController } from '../../../api/session-controller/src/commands.ts'
import type { ApiSessionAgentController } from '../../../api/session-controller/src/agent.ts'
import { validateStoredEvents } from '../../../session/session-persistence/src/index.ts'
import { InputHub } from '../../ui-conversation/src/client/input/hub.ts'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { zh as conversationZh } from '../../ui-conversation/src/client/locales.ts'
import { en, zh } from '../src/client/locales.ts'
import { UiWorkspaceService } from '../src/client/navigation.ts'

const it = createClientTest({ roster: ClientRoster.of([
  { name: '@deepseek-ai/dsh-client-connection', inject: [], immediately: true },
  { name: '@deepseek-ai/dsh-typert-registry', inject: [], immediately: true },
  { name: '@deepseek-ai/dsh-api-gateway', inject: ['@deepseek-ai/dsh-typert-registry', '@deepseek-ai/dsh-client-connection'], immediately: true },
  { name: '@deepseek-ai/dsh-api-remotes', inject: ['@deepseek-ai/dsh-api-gateway'], immediately: true },
]) })
it('creates a multi-source project, clears the draft target, and starts another ordinary chat without a model call', async ({ mock, start }) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-project-integration-')))
  const host = new Context()
  const ui = new Context()
  let disposeSessions = async () => {}
  onTestFinished(async () => { await disposeSessions(); await ui.fiber.dispose(); await host.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  // Keep the server service explicit in this fixture's mixed client/host realm.
  let serverSessions!: SessionStore
  await host.plugin(ctx => { serverSessions = new SessionStore(ctx) })
  await host.plugin(Storage)
  host.storage.backend.register('memory', new MemoryStorageBackend(new MemoryMediaPool()))
  const domain = new DomainFacility(host, { backend: 'memory', routes: {} })
  host.storage.mount('domain', domain)
  host.provide('storageDomain', domain)
  host.provide('sessionPersistence', { list: async () => [] } as never)
  await host.plugin(WorkspaceRegistry)
  await host.plugin(SessionProjectionRegistry)
  await host.plugin(SandboxPolicyService, { mode: 'read-only' })
  host.provide('typert', { lookups: { configure: () => () => {} }, contexts: { configureHost: () => () => {} } } as never)
  const projects = new HostWorkspaceController(host, { documentsDirectory: root })
  mock.remote.workspace.registerSource.mockImplementation(async request => ({ ok: true, value: await projects.registerSource(request) }))
  mock.remote.workspace.createProject.mockImplementation(async request => ({ ok: true, value: await projects.createProject(request) }))
  mock.remote.workspace.prepareChat.mockImplementation(async request => ({ ok: true, value: await projects.prepareChat(request) }))
  const client = await start()
  const model = new ClientWorkspaceModel(client.ctx.remote.workspace)
  model.replaceBaseline({ items: [], archivedSessionIds: [], pinnedSessionIds: [] })
  const workspaces = new WorkspaceController(ui, model)
  await mkdir(join(root, 'first')); await mkdir(join(root, 'second'))
  const first = await workspaces.registerSource({ path: join(root, 'first') })
  const second = await workspaces.registerSource({ path: join(root, 'second') })
  const project = await workspaces.createProject({ requestId: crypto.randomUUID() as ProjectRequestId, title: '研究资料', sourceIds: [first.sourceId, second.sourceId] })
  // Keyless creation needs only these public agent-controller operations.
  const commands = new SessionCommandController(host, {
    ensureSession: async (id: SessionId, cwd: string) => ({ id, session: serverSessions.get(id) ?? serverSessions.create(id, { meta: { cwd } }) }),
    presetForSession: () => undefined,
  } as unknown as ApiSessionAgentController, root)
  const sessions = new TestSessions(async operation => { await operation() }, ui)
  disposeSessions = () => sessions.disposeScopes()
  ui.provide('sessions', sessions)
  sessions.stubCreate(async request => {
    const result = await commands.create(request ?? {})
    if (!sessions.list.getSnapshot().ids.includes(result.sessionId)) {
      const active = serverSessions.get(result.sessionId)!
      validateStoredEvents(active.header, [...active.snapshotEvents()])
      await sessions.add({ id: result.sessionId, summary: { blank: true, ...(active.header.cwd === undefined ? {} : { cwd: active.header.cwd }) }, snapshot: { blank: true } })
    }
    model.replaceBaseline({ items: host.workspaceRegistry.list().map(workspaceView), archivedSessionIds: [], pinnedSessionIds: [] })
    return result.sessionId
  })
  const locale = new LocaleRuntime(ui); locale.setLocale('zh'); locale.register('workspace', { en, zh }); ui.provide('locale', locale)
  const layout = new LayoutController({ selectPanel: () => {}, retainMainPanels: () => {}, setSidebar: () => {}, toggleSidebar: () => {}, collapseSidebar: () => {}, setViewportWidth: () => {}, setRightbar: () => {}, openRightbar: () => {}, closeRightbar: () => {} }, () => true, createSnapshotStore({ activePanelId: null }))
  ui.provide('layout', layout)
  ui.effect(() => () => { layout.dispose() })
  const hub = new InputHub(ui, makeTranslate(conversationZh, {}))
  ui.provide('conversation', { input: hub })
  const notice = vi.fn()
  const navigation = new UiWorkspaceService(ui, client.ctx.remote.directoryPicker, workspaces, sessions, { pinSessionOrder: () => {} }, notice)
  await navigation.openChatTarget(project.workspaceId)
  const original = sessions.list.getSnapshot().ids[0]!
  const originalInput = hub.shell(original)
  originalInput.setDraft('继续我的研究')
  expect(host.sandboxPolicy.resolve({ session: serverSessions.get(original)! })).toMatchObject({ mode: 'read-only', additionalWorkspaceRoots: [second.path] })
  await navigation.openChatTarget(null)
  const ordinary = sessions.list.getSnapshot().ids.at(-1)!
  expect(hub.shell(ordinary).draftSnapshot.text).toBe('继续我的研究')
  expect(originalInput.draftSnapshot.text).toBe('')
  expect(host.workspaceRegistry.get(project.workspaceId)?.sessionIds).toEqual([original])
  navigation.startSession()
  await vi.waitFor(() => { expect(sessions.list.getSnapshot().ids).toHaveLength(3) })
  const next = sessions.list.getSnapshot().ids.at(-1)!
  expect(serverSessions.get(next)?.header.cwd).not.toBe(serverSessions.get(ordinary)?.header.cwd)
  expect(mock.log.requests('workspace/createProject')).toHaveLength(1)
  expect(mock.log.requests('workspace/prepareChat')).toHaveLength(2)
  expect(notice).not.toHaveBeenCalled()
})
