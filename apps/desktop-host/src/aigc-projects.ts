/** Real native Workspace/Session admission, independently owned by the AIGC account scope. */
import { createHash } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { parseHarnessAigcContextV1, parseNativeBuiltinHostContextV1 } from '@studybuddy/contracts'
import type { HarnessAigcContextV1, NativeBuiltinHostContextV1 } from '@studybuddy/contracts'

export interface AigcProjectBinding extends HarnessAigcContextV1 { readonly authorizedRoot: string }
interface Admission extends NativeBuiltinHostContextV1 { projectId: string; sessionId: string; lease: string; root: string }
export interface AigcProjectPorts {
  workspace(root: string): Promise<string>
  sessionDirectory(sessionId: string): string | undefined
  createSession(sessionId: string, workspaceId: string): Promise<void>
  stopSessions(rootIds: ReadonlySet<string>): Promise<void>
  owns(rootId: string, candidateId: string): boolean
}
const equal = (a: NativeBuiltinHostContextV1 | null, b: NativeBuiltinHostContextV1) => !!a && a.hostGeneration === b.hostGeneration && a.scope.accountId === b.scope.accountId && a.scope.generation === b.scope.generation
async function canonical(path: string): Promise<string> {
  for (let current = resolve(path);;) {
    if ((await lstat(current)).isSymbolicLink()) throw Error('AIGC_PATH_DENIED')
    const parent = dirname(current); if (parent === current) break; current = parent
  }
  if (!(await lstat(path)).isDirectory()) throw Error('AIGC_PATH_DENIED')
  return realpath(path)
}
function admission(value: unknown): Admission {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 6 || Object.keys(value).some(key => !['scope', 'hostGeneration', 'projectId', 'sessionId', 'lease', 'root'].includes(key))) throw Error('AIGC_PROJECT_INVALID')
  const owner = parseNativeBuiltinHostContextV1({ scope: Reflect.get(value, 'scope'), hostGeneration: Reflect.get(value, 'hostGeneration') })
  const context = parseHarnessAigcContextV1({ ...owner, projectId: Reflect.get(value, 'projectId'), sessionId: Reflect.get(value, 'sessionId'), lease: Reflect.get(value, 'lease'), workspaceId: 'pending' })
  const root: unknown = Reflect.get(value, 'root')
  if (typeof root !== 'string' || !isAbsolute(root)) throw Error('AIGC_PROJECT_INVALID')
  return { ...owner, projectId: context.projectId, sessionId: context.sessionId, lease: context.lease, root }
}

export class NativeAigcProjects {
  private scope: NativeBuiltinHostContextV1 | null = null
  private epoch = 0
  private cleanup = Promise.resolve()
  private readonly bindings = new Map<string, AigcProjectBinding>()
  private readonly pending = new Map<string, { signature: string; promise: Promise<AigcProjectBinding> }>()
  private readonly workspaces = new Map<string, Promise<string>>()
  constructor(private readonly ports: AigcProjectPorts, private readonly hostGeneration: string) {}
  matchesScope(value: unknown): boolean { return value === null ? this.scope === null : equal(this.scope, parseNativeBuiltinHostContextV1(value)) }
  setScope(value: unknown): Promise<void> {
    const next = value === null ? null : parseNativeBuiltinHostContextV1(value)
    if (next && next.hostGeneration !== this.hostGeneration) throw Error('AIGC_SCOPE_REVOKED')
    if (next ? equal(this.scope, next) : this.scope === null) return this.cleanup
    const roots = new Set(this.bindings.keys())
    ++this.epoch; this.scope = next; this.bindings.clear(); this.pending.clear(); this.workspaces.clear()
    return this.cleanup = Promise.all([this.cleanup, this.ports.stopSessions(roots)]).then(() => {})
  }
  binding = (context: HarnessAigcContextV1): AigcProjectBinding | undefined => {
    const row = this.bindings.get(context.sessionId)
    return row && equal(this.scope, context) && row.projectId === context.projectId && row.workspaceId === context.workspaceId && row.lease === context.lease ? row : undefined
  }
  owningBinding(sessionId: string): AigcProjectBinding | undefined {
    return [...this.bindings.values()].find(row => this.binding(row) && this.ports.owns(row.sessionId, sessionId) && this.ports.sessionDirectory(sessionId) === row.authorizedRoot)
  }
  project(projectId: string): AigcProjectBinding | undefined { return [...this.bindings.values()].find(row => row.projectId === projectId && this.binding(row)) }
  private assert(input: NativeBuiltinHostContextV1, epoch: number) { if (epoch !== this.epoch || !equal(this.scope, input)) throw Error('AIGC_SCOPE_REVOKED') }
  async bind(value: unknown): Promise<AigcProjectBinding> {
    const input = admission(value), epoch = this.epoch; this.assert(input, epoch)
    const previous = this.bindings.get(input.sessionId)
    if (previous) {
      if (previous.projectId !== input.projectId || previous.lease !== input.lease || previous.authorizedRoot !== input.root) throw Error('AIGC_BINDING_CONFLICT')
      return previous
    }
    const signature = JSON.stringify(input), pending = this.pending.get(input.sessionId)
    if (pending) { if (pending.signature !== signature) throw Error('AIGC_BINDING_CONFLICT'); return pending.promise }
    const promise = this.create(input, epoch).finally(() => { if (this.pending.get(input.sessionId)?.promise === promise) this.pending.delete(input.sessionId) })
    this.pending.set(input.sessionId, { signature, promise }); return promise
  }
  private async create(input: Admission, epoch: number): Promise<AigcProjectBinding> {
    await this.cleanup; this.assert(input, epoch)
    const root = await canonical(input.root); this.assert(input, epoch)
    if (root !== input.root || input.projectId !== 'aigc-' + createHash('sha256').update(root).digest('hex').slice(0, 48)) throw Error('AIGC_BINDING_CONFLICT')
    let workspace = this.workspaces.get(root)
    if (!workspace) {
      workspace = this.ports.workspace(root); this.workspaces.set(root, workspace)
      void workspace.catch(() => { if (this.workspaces.get(root) === workspace) this.workspaces.delete(root) })
    }
    const workspaceId = await workspace; this.assert(input, epoch)
    const stored = this.ports.sessionDirectory(input.sessionId)
    if (stored !== undefined && stored !== root) throw Error('AIGC_SESSION_CONFLICT')
    await this.ports.createSession(input.sessionId, workspaceId); this.assert(input, epoch)
    if (this.ports.sessionDirectory(input.sessionId) !== root || await canonical(root) !== root) throw Error('AIGC_SESSION_CONFLICT')
    this.assert(input, epoch)
    const binding: AigcProjectBinding = Object.freeze({ scope: Object.freeze({ ...input.scope }), hostGeneration: input.hostGeneration,
      projectId: input.projectId, workspaceId, sessionId: input.sessionId, lease: input.lease, authorizedRoot: root })
    this.bindings.set(input.sessionId, binding); return binding
  }
  async close(projectId: string): Promise<void> {
    const roots = new Set([...this.bindings.values()].filter(row => row.projectId === projectId).map(row => row.sessionId))
    for (const id of roots) this.bindings.delete(id)
    await this.ports.stopSessions(roots)
  }
}

/** Adapt existing native services; no model request or separate Session manager is created here. */
export function createNativeAigcProjects(ctx: Context, hostGeneration: string): NativeAigcProjects {
  const owned = (roots: ReadonlySet<string>) => {
    const live = ctx.agents.list(), result = live.filter(agent => roots.has(agent.id))
    for (let index = 0; index < result.length; index++) for (const agent of live) if (!result.includes(agent) && ctx.agents.isOwnedBy(agent.id, result[index]!)) result.push(agent)
    return result
  }
  return new NativeAigcProjects({
    workspace: async root => (await ctx.workspaceRegistry.resolveByPath(root) ?? await ctx.workspaceRegistry.create(root)).id,
    sessionDirectory: id => ctx.sessions.get(SessionId(id))?.header.cwd,
    createSession: async (sessionId, workspaceId) => { await ctx.sessionController.create({ sessionId: SessionId(sessionId), workspaceId: WorkspaceId(workspaceId) }) },
    stopSessions: async ids => { const agents = owned(ids); for (const agent of agents) agent.cancel({ kind: 'parent' }); await Promise.all(agents.map(agent => agent.whenIdle())) },
    owns: (rootId, candidateId) => owned(new Set([rootId])).some(agent => agent.id === candidateId),
  }, hostGeneration)
}
