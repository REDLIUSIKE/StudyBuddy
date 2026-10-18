/** Main-admitted project directories own real native Workspaces and Sessions. */
import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { parseNativeBuiltinHostContextV1 } from '@studybuddy/contracts'
import type { HarnessResearchContextV1, NativeBuiltinHostContextV1 } from '@studybuddy/contracts'
import type { ResearchProjectBinding } from './research-session-execution.ts'

export interface ResearchProjectAdmission extends NativeBuiltinHostContextV1 { projectId: string; sessionId: string; lease: string; root: string }
const equal = (a: NativeBuiltinHostContextV1 | null, b: NativeBuiltinHostContextV1) => !!a && a.hostGeneration === b.hostGeneration && a.scope.accountId === b.scope.accountId && a.scope.generation === b.scope.generation

/** Validate private bind requests; a public page cannot supply one. */
export function parseResearchProjectAdmission(value: unknown): ResearchProjectAdmission {
  if (!value || typeof value !== 'object') throw Error('HARNESS_RESEARCH_PROJECT_INVALID')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== 6 || Object.keys(row).some(key => !['scope', 'hostGeneration', 'projectId', 'sessionId', 'lease', 'root'].includes(key)) ||
    typeof row.projectId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.projectId) ||
    typeof row.sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/.test(row.sessionId) ||
    typeof row.lease !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.lease) ||
    typeof row.root !== 'string' || !isAbsolute(row.root)) throw Error('HARNESS_RESEARCH_PROJECT_INVALID')
  return { ...parseNativeBuiltinHostContextV1({ scope: row.scope, hostGeneration: row.hostGeneration }),
    projectId: row.projectId, sessionId: row.sessionId, lease: row.lease, root: row.root }
}
async function canonical(value: string): Promise<string> {
  let current = resolve(value)
  for (;;) {
    if ((await lstat(current)).isSymbolicLink()) throw Error('HARNESS_RESEARCH_PATH_DENIED')
    const parent = dirname(current); if (parent === current) break; current = parent
  }
  if (!(await lstat(value)).isDirectory()) throw Error('HARNESS_RESEARCH_PATH_DENIED')
  return realpath(value)
}

/** Scope revocation fences creation, reattachment and all subsequent native actions. */
export class NativeResearchProjects {
  private scope: NativeBuiltinHostContextV1 | null = null
  private epoch = 0
  private cleanup: Promise<void> = Promise.resolve()
  private readonly bindings = new Map<string, ResearchProjectBinding>()
  private readonly pending = new Map<string, { signature: string; value: Promise<ResearchProjectBinding> }>()
  constructor(private readonly ctx: Context, private readonly hostGeneration: string) {}
  matchesScope(value: unknown): boolean { return value === null ? this.scope === null : equal(this.scope, parseNativeBuiltinHostContextV1(value)) }
  setScope(value: unknown): Promise<void> {
    const scope = value === null ? null : parseNativeBuiltinHostContextV1(value)
    if (scope && scope.hostGeneration !== this.hostGeneration) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    if (scope ? equal(this.scope, scope) : this.scope === null) return this.cleanup
    const roots = new Set([...this.bindings.values()].map(row => row.sessionId)), owned = this.ownedAgents(roots)
    ++this.epoch; this.scope = scope; this.bindings.clear(); this.pending.clear()
    for (const agent of owned) agent.cancel({ kind: 'parent' })
    this.cleanup = Promise.all([this.cleanup, ...owned.map(agent => agent.whenIdle())]).then(() => undefined)
    return this.cleanup
  }
  binding = (context: HarnessResearchContextV1): ResearchProjectBinding | undefined => {
    const row = this.bindings.get(context.sessionId)
    return row && equal(this.scope, context) && row.projectId === context.projectId && row.workspaceId === context.workspaceId && row.sessionId === context.sessionId && row.lease === context.lease ? row : undefined
  }
  bind(value: unknown): Promise<ResearchProjectBinding> {
    const input = parseResearchProjectAdmission(value), epoch = this.epoch
    this.assert(input, epoch)
    const previous = this.bindings.get(input.sessionId)
    if (previous) {
      if (previous.projectId !== input.projectId || previous.lease !== input.lease || previous.authorizedRoots[0] !== input.root) return Promise.reject(Error('HARNESS_RESEARCH_PROJECT_CONFLICT'))
      return Promise.resolve(previous)
    }
    const signature = JSON.stringify(input), pending = this.pending.get(input.sessionId)
    if (pending) return pending.signature === signature ? pending.value : Promise.reject(Error('HARNESS_RESEARCH_PROJECT_CONFLICT'))
    const request = this.create(input, epoch).finally(() => { if (this.pending.get(input.sessionId)?.value === request) this.pending.delete(input.sessionId) })
    this.pending.set(input.sessionId, { signature, value: request }); return request
  }
  private assert(value: NativeBuiltinHostContextV1, epoch: number): void {
    if (epoch !== this.epoch || !equal(this.scope, value)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
  }
  private async create(input: ResearchProjectAdmission, epoch: number): Promise<ResearchProjectBinding> {
    await this.cleanup; this.assert(input, epoch)
    const root = await canonical(input.root); this.assert(input, epoch)
    if (root !== input.root) throw Error('HARNESS_RESEARCH_PATH_DENIED')
    const existing = await this.ctx.workspaceRegistry.resolveByPath(root); this.assert(input, epoch)
    const workspace = existing ?? await this.ctx.workspaceRegistry.create(root); this.assert(input, epoch)
    const stored = this.ctx.sessions.get(SessionId(input.sessionId))
    if (stored && stored.header.cwd !== root) throw Error('HARNESS_RESEARCH_SESSION_CONFLICT')
    await this.ctx.sessionController.create({ sessionId: SessionId(input.sessionId), workspaceId: workspace.id }); this.assert(input, epoch)
    if (await canonical(input.root) !== root) throw Error('HARNESS_RESEARCH_PATH_DENIED')
    this.assert(input, epoch)
    const binding: ResearchProjectBinding = { scope: { ...input.scope }, hostGeneration: input.hostGeneration, projectId: input.projectId,
      workspaceId: workspace.id, sessionId: input.sessionId, lease: input.lease, authorizedRoots: Object.freeze([root]) }
    this.bindings.set(input.sessionId, binding); return binding
  }
  async close(projectId: string): Promise<void> {
    const rows = [...this.bindings.values()].filter(row => row.projectId === projectId)
    if (!rows.length) throw Error('HARNESS_RESEARCH_PROJECT_NOT_FOUND')
    for (const row of rows) this.bindings.delete(row.sessionId)
    const owned = this.ownedAgents(new Set(rows.map(row => row.sessionId)))
    for (const agent of owned) agent.cancel({ kind: 'user' })
    await Promise.all(owned.map(agent => agent.whenIdle()))
  }
  private ownedAgents(roots: ReadonlySet<string>) {
    const live = this.ctx.agents.list(), owned = live.filter(agent => roots.has(agent.id))
    for (let index = 0; index < owned.length; index++) for (const agent of live) if (!owned.includes(agent) && this.ctx.agents.isOwnedBy(agent.id, owned[index]!)) owned.push(agent)
    return owned
  }
  /** Resolve only an actually owned live native actor; cwd equality alone grants no budget membership. */
  owningBinding(sessionId:string):ResearchProjectBinding|undefined {
    for(const binding of this.bindings.values()) {
      if(!this.binding(binding))continue
      const agent=this.ownedAgents(new Set([binding.sessionId])).find(row=>row.id===sessionId)
      if(agent&&agent.session.header.cwd===binding.authorizedRoots[0])return binding
    }
    return undefined
  }
}
