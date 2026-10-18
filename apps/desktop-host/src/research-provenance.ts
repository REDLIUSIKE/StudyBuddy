/** Private execution observations accompany the admitted native tool pipeline. */
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionToken, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { ResearchProjectBinding } from './research-session-execution.ts'
import type { ResearchToolRpc } from './research-tool-rpc.ts'

interface Observation { binding: ResearchProjectBinding; executionId: string; startedAt: number; callId: string; begun: boolean; finished: boolean; finishInput?: object }

function outcome(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): object {
  if (result.isError) return { isError: true, outcome: result.error.info?.code === 'ABORTED' ? 'cancelled' : 'failed' }
  if (!['bash', 'pwsh', 'terminal_send'].includes(exec.name) || !result.value || typeof result.value !== 'object' || Array.isArray(result.value)) return { isError: false, outcome: 'completed' }
  const value = result.value
  const process = Object.fromEntries(['kind', 'exitCode', 'signal', 'timedOut', 'aborted', 'stopped', 'jobId'].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))
  if (value.kind !== 'foreground') return { isError: false, outcome: 'unknown', process }
  if (value.aborted === true) return { isError: true, outcome: 'cancelled', process }
  if (value.timedOut === true || typeof value.exitCode === 'number' && value.exitCode !== 0 || typeof value.signal === 'string') return { isError: true, outcome: 'failed', process }
  return { isError: false, outcome: value.exitCode === 0 ? 'completed' : 'unknown', process }
}

/** Bounded parameter preview; the digest binds complete parsed arguments without persisting content/media/credentials. */
function parameters(value: unknown): { arguments: unknown; argumentsTruncated: boolean; argumentsSha256: string } {
  const raw = JSON.stringify(value)
  let truncated = false
  const visit = (input: unknown, depth: number): unknown => {
    if (depth > 10) { truncated = true; return '[depth limited]' }
    if (typeof input === 'string') return input.replace(/\b(Bearer\s+)[A-Za-z0-9._-]+|((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, (_match, bearer: string | undefined, label: string | undefined) => { truncated = true; return `${bearer ?? label}[redacted]` })
    if (Array.isArray(input)) { if (input.length > 64) truncated = true; return input.slice(0, 64).map(item => visit(item, depth + 1)) }
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, item]) => {
      if (/(?:key|token|secret|password|authorization|cookie|credential|headers|environment|^env$|^content$|^body$|^data$|base64|^bytes$|^images?$|^audio$)/i.test(key)) { truncated = true; return [key, '[redacted]'] }
      return [key, visit(item, depth + 1)]
    }))
    return input
  }
  let safe = visit(value, 0)
  if (Buffer.byteLength(JSON.stringify(safe)) > 2048) {
    const row = safe && typeof safe === 'object' && !Array.isArray(safe) ? safe as Record<string, unknown> : {}
    safe = { ...Object.fromEntries(['path', 'file_path', 'filePath', 'file', 'command', 'text', 'cwd'].filter(key => typeof row[key] === 'string' && String(row[key]).length <= 1000).map(key => [key, row[key]])), truncated: true }; truncated = true
  }
  return { arguments: safe, argumentsTruncated: truncated, argumentsSha256: createHash('sha256').update(raw).digest('hex') }
}

/** Reuse real tool execution; the observation RPC is never advertised to models or guests. */
export class NativeResearchProvenance {
  private readonly bindings = new Map<string, ResearchProjectBinding>()
  private readonly executions = new Map<ToolExecutionToken, Observation>()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly dispose: (() => void)[]
  private closed = false
  constructor(private readonly ctx: Context, private readonly rpc: Pick<ResearchToolRpc, 'invoke'>, private readonly current: (binding: ResearchProjectBinding) => boolean) {
    this.dispose = [
      ctx.on('tools/pre-execute', async (exec, next) => {
        const decision = await next(), binding = this.binding(exec.agent)
        if (binding && !this.current(binding)) return { kind: 'deny', reason: 'The research account or project is no longer admitted.' }
        return decision
      }, { prepend: true }),
      ctx.on('tools/execute', async (exec, next) => {
        const binding = this.binding(exec.agent)
        if (!binding) return next()
        if (!this.current(binding) || !exec.agent || exec.signal.aborted) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
        const actor = exec.agent
        const work = (async () => {
          const observation: Observation = { binding, executionId: randomUUID(), startedAt: Date.now(), callId: exec.callId, begun: false, finished: false }
          this.executions.set(exec.token, observation)
          const parent = exec.parent === undefined ? undefined : this.executions.get(exec.parent)
          await this.request(observation, { schemaVersion: 1, action: 'begin', executionId: observation.executionId, rootSessionId: binding.sessionId,
            actorSessionId: actor.id, parentSessionId: actor.id === binding.sessionId ? null : actor.session.header.parentSession ?? null,
            toolCallId: exec.callId, rootCallId: exec.rootCallId, parentToolCallId: parent?.callId ?? null, toolName: exec.name,
            ...parameters(exec.arguments), startedAt: observation.startedAt }, exec.signal)
          observation.begun = true
          if (!this.current(binding) || exec.signal.aborted) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
          const result = await next()
          await this.finish(exec, result, observation)
          return result
        })()
        this.pending.add(work)
        try { return await work } finally { this.pending.delete(work) }
      }, { prepend: true }),
      ctx.on('tools/result', (exec, result) => {
        const observation = this.executions.get(exec.token)
        if (!observation) return
        this.executions.delete(exec.token)
        if (observation.begun && !observation.finished && this.current(observation.binding)) {
          // Pipeline failures still terminate their prepared observation. The
          // caller cancellation has settled; observation uses its own signal.
          const pending = this.finish(exec, result, observation).catch(error => { this.ctx.logger.warn(error instanceof Error ? error.message : 'HARNESS_RESEARCH_OBSERVATION_UNAVAILABLE') })
          this.pending.add(pending); void pending.finally(() => this.pending.delete(pending))
        }
        return undefined
      }),
    ]
  }
  private binding(actor: Agent | undefined): ResearchProjectBinding | undefined {
    if (this.closed || !actor) return undefined
    for (const binding of this.bindings.values()) {
      const root = this.ctx.agents.get(SessionId(binding.sessionId))
      if (!root || !binding.authorizedRoots.includes(actor.session.header.cwd ?? '')) continue
      const live = this.ctx.agents.list(), queue = [root], seen = new Set([root.id])
      for (let index = 0; index < queue.length; index++) {
        if (queue[index]!.id === actor.id) return binding
        for (const candidate of live) if (!seen.has(candidate.id) && this.ctx.agents.isOwnedBy(candidate.id, queue[index]!)) { seen.add(candidate.id); queue.push(candidate) }
      }
    }
    return undefined
  }
  private async request(observation: Observation, input: object, signal: AbortSignal): Promise<void> {
    if (!this.current(observation.binding)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    const reply = await this.rpc.invoke(observation.binding, 'advanced', 'provenance:' + observation.executionId, { name: 'research_provenance', arguments: input }, signal)
    if (!this.current(observation.binding)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    if (!reply || typeof reply !== 'object' || !('observed' in reply) || reply.observed !== true || !('state' in reply) || !['prepared', 'finished', 'unknown'].includes(String(reply.state))) throw Error('HARNESS_RESEARCH_OBSERVATION_INVALID')
  }
  private async finish(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>, observation: Observation): Promise<void> {
    observation.finishInput ??= { schemaVersion: 1, action: 'finish', executionId: observation.executionId, endedAt: Date.now(), ...outcome(exec, result) }
    await this.request(observation, observation.finishInput, new AbortController().signal)
    observation.finished = true
  }
  /** @param binding - Privately admitted root/project. @param actor - Optional owned child; no additional observer is installed. */
  mount(binding: ResearchProjectBinding, actor?: Agent): void {
    if (this.closed || !this.current(binding)) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    const root = this.ctx.agents.get(SessionId(binding.sessionId))
    if (!root || !binding.authorizedRoots.includes(root.session.header.cwd ?? '')) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
    this.bindings.set(binding.sessionId, binding)
    if (actor && this.binding(actor) !== binding) throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
  }
  /** Withdraw observations first; keep pending local records uncertain if their owner was revoked.
   * @param projectId - One project to detach; omit to detach all projects without destroying the Host contribution.
   */
  async unmount(projectId?: string): Promise<void> {
    for (const [id, binding] of this.bindings) if (projectId === undefined || binding.projectId === projectId) this.bindings.delete(id)
    await Promise.allSettled([...this.pending])
    for (const [token, row] of this.executions) if (projectId === undefined || row.binding.projectId === projectId) this.executions.delete(token)
  }
  /** Dispose the Host contribution after project revocation; no observer survives Host shutdown. */
  async close(): Promise<void> {
    this.closed = true; for (const dispose of this.dispose.splice(0)) dispose()
    await this.unmount()
  }
}
