/** Native child Sessions for existing node/settings assistants; domain/UI callbacks never drive a model loop. */
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, ModelSelection, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { adaptAigcTool } from './aigc-tool-adapter.ts'
import { aigcToolResultText } from './aigc-records.ts'
const descriptor = z.strictObject({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_:-]{0,127}$/), label: z.string().max(200).optional(), description: z.string().max(20000),
  parameters: z.record(z.string(), z.json()), executionMode: z.enum(['sequential', 'parallel']).optional(), promptGuidelines: z.array(z.string()).optional() })
const openSchema = z.strictObject({ id: z.uuid(), systemPrompt: z.string().max(100000), tools: z.array(descriptor).max(128) })
type Event = Record<string, unknown>
interface Call { resolve(value: unknown): void; reject(error: Error): void; detach(): void; update(value: unknown): void }
interface Run { id: string; complete: Promise<void>; paused: boolean; resume?: () => void; events: { cursor: number; event: Event }[]; cursor: number; acknowledged: number; delivered: number; bytes: number; overflow?: boolean; resultBytes: number; wake?: () => void; finished: boolean; toolResults: Event[] }
interface Temporary { projectId: string; parent: Agent; handle: Awaited<ReturnType<Context['agents']['create']>>; selection: ModelSelectionRef;
  runs: Set<string>; current?: Run; calls: Map<string, Call>; close: () => Promise<void> }

export class NativeAigcTemporary {
  private readonly sessions = new Map<string, Temporary>()
  private readonly opening = new Set<string>()
  constructor(private readonly ctx: Context, private readonly current: (projectId: string) => boolean) {}
  ownsSession(id: string): boolean { return this.opening.has(id) || [...this.sessions.values()].some(row => row.handle.agent.id === id) }
  inProject(id: string, projectId: string): boolean { return this.sessions.get(id)?.projectId === projectId && this.current(projectId) }
  private row(id: string): Temporary { const row = this.sessions.get(id); if (!row || !this.current(row.projectId)) throw Error('AIGC_TEMPORARY_REVOKED'); return row }
  private emit(row: Temporary, event: Event) {
    const run = row.current; if (!run || run.finished) return
    if (run.overflow && !['error', 'done', 'status'].includes(String(event.type))) return
    const bytes = Buffer.byteLength(JSON.stringify(event))
    const last = run.events.at(-1)
    // Never mutate an event already returned to a poller, even before its acknowledgement.
    if ((event.type === 'text' || event.type === 'thinking') && last && last.cursor > run.delivered && last.event.type === event.type && last.event.blockId === event.blockId && run.bytes + bytes < 24 * 1024 * 1024) {
      const before = Buffer.byteLength(JSON.stringify(last.event)); last.event.delta = String(last.event.delta) + String(event.delta)
      run.bytes += Buffer.byteLength(JSON.stringify(last.event)) - before; return
    }
    if (run.bytes + bytes > 24 * 1024 * 1024 || run.events.length >= 16000) {
      // Terminal state must always fit and settle; throwing here also breaks the finally path.
      if (!run.overflow) {
        run.overflow = true; run.events = []; run.bytes = 0
        this.emit(row, { type: 'error', message: 'AIGC_EVENT_BACKPRESSURE' }); row.handle.agent.cancel({ kind: 'parent' })
      }
      return
    }
    run.events.push({ cursor: ++run.cursor, event }); run.bytes += bytes; run.wake?.(); delete run.wake
  }
  async open(parent: Agent, projectId: string, value: unknown): Promise<{ sessionId: string; nativeSessionId: string }> {
    const input = openSchema.parse(value), id = input.id, nativeId = 'session-' + id
    if (!this.current(projectId) || this.sessions.size >= 32 || this.sessions.has(id) || this.opening.has(nativeId)) throw Error('AIGC_TEMPORARY_CONFLICT')
    if (new Set(input.tools.map(tool => tool.name)).size !== input.tools.length) throw Error('AIGC_TOOL_CONTRACT_INVALID')
    const selection: ModelSelectionRef = { current: undefined, assembled: undefined }
    let row: Temporary | undefined
    this.opening.add(nativeId)
    try {
      const handle = await this.ctx.agents.create({ sessionId: SessionId(nativeId), parentAgent: parent,
        meta: { parentSession: parent.id, origin: 'subagent', ...(parent.session.header.cwd ? { cwd: parent.session.header.cwd } : {}) }, agentOptions: {},
        setup: agentCtx => {
          installModelSelection(agentCtx, selection, { requireSelection: true })
          agentCtx.systemPrompt.section({ name: 'studybuddy-aigc-temporary', order: 0, complete: true, interpolate: false, text: input.systemPrompt })
          for (const tool of input.tools) agentCtx.tools.register(adaptAigcTool({ name: tool.name, description: tool.description, parameters: tool.parameters, promptGuidelines: tool.promptGuidelines ?? [], executionMode: tool.executionMode ?? 'sequential',
            schemaSha256: createHash('sha256').update(JSON.stringify(tool.parameters)).digest('hex'), plugin: { name: 'temporary', revision: createHash('sha256').update(JSON.stringify(tool)).digest('hex') } },
          async (args, exec) => {
            if (!row || !this.current(projectId)) throw Error('AIGC_TEMPORARY_REVOKED')
            await this.gate(row, exec.signal)
            const callId = randomUUID()
            this.emit(row, { type: 'tool', blockId: exec.callId, tool: { id: exec.callId, name: tool.name, args, status: 'running' } })
            exec.signal.throwIfAborted()
            const result = await new Promise<unknown>((resolve, reject) => {
              const abort = () => { exec.signal.removeEventListener('abort', abort); if (row?.calls.delete(callId)) reject(Error('AIGC_OPERATION_CANCELLED')) }
              exec.signal.addEventListener('abort', abort, { once: true })
              row!.calls.set(callId, { resolve, reject, detach: () => { exec.signal.removeEventListener('abort', abort) },
                update: value => { const result = aigcToolResultText(value); if (Buffer.byteLength(result) > 1024 * 1024) throw Error('AIGC_TOOL_UPDATE_TOO_LARGE');
                  this.emit(row!, { type: 'tool', blockId: exec.callId, tool: { id: exec.callId, name: tool.name, args, status: 'running', result } }) } })
              this.emit(row!, { type: 'clientTool', callId, toolCallId: exec.callId, name: tool.name, args })
              if (exec.signal.aborted) abort()
            })
            if (!this.current(projectId)) throw Error('AIGC_TEMPORARY_REVOKED')
            const event = { type: 'toolResult', id: exec.callId, name: tool.name, result }, run = row.current!
            const resultBytes = Buffer.byteLength(JSON.stringify(event))
            if (run.resultBytes + resultBytes > 8 * 1024 * 1024) throw Error('AIGC_TOOL_RESULT_TOO_LARGE')
            run.resultBytes += resultBytes; run.toolResults.push(event)
            this.emit(row, event); this.emit(row, { type: 'tool', blockId: exec.callId, tool: { id: exec.callId, name: tool.name, args, status: 'success', result: aigcToolResultText(result) } })
            return result
          }, images => this.ctx.attachments.saveImages(images)))
          agentCtx.tools.guard(exec => input.tools.some(tool => tool.name === exec.name) ? undefined : 'AIGC_TEMPORARY_TOOL_NOT_ALLOWED')
          agentCtx.tools.presentAs('native')
          agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
            const assembled = await next()
            return { ...assembled, contexts: [], tools: assembled.tools.filter(tool => input.tools.some(item => item.name === tool.name)) }
          }, { prepend: true })
          agentCtx.on('agent/pre-step', async ({ step, signal }, next) => { if (!row) throw Error('AIGC_TEMPORARY_REVOKED'); await this.gate(row, signal); return step > 40 ? { kind: 'reject' } : next() }, { prepend: true })
          agentCtx.on('agent/request-error', async (_failure, next) => { await next(); return undefined }, { prepend: true })
          agentCtx.on('agent/assistant-stream', ({ frame }) => {
            if (!row || frame.type !== 'chunk') return
            const chunk = frame.chunk
            if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') this.emit(row, { type: chunk.type === 'text-delta' ? 'text' : 'thinking', blockId: `${frame.attemptId}:${chunk.index}`, delta: chunk.text })
          })
        } })
      row = { projectId, parent, handle, selection, runs: new Set(), calls: new Map(), close: async () => {
        handle.agent.cancel({ kind: 'parent' }); row!.current?.resume?.();
        for (const call of row!.calls.values()) { call.detach(); call.reject(Error('AIGC_TEMPORARY_REVOKED')) } row!.calls.clear()
        await handle.agent.whenIdle(); await row!.current?.complete; await handle.dispose()
      } }
      if (!this.current(projectId)) { await row.close(); throw Error('AIGC_TEMPORARY_REVOKED') }
      this.sessions.set(id, row); return { sessionId: id, nativeSessionId: handle.agent.id }
    } finally { this.opening.delete(nativeId) }
  }
  private async gate(row: Temporary, signal: AbortSignal) {
    const run = row.current; if (!run) throw Error('AIGC_RUN_UNAVAILABLE'); signal.throwIfAborted()
    if (!run.paused) return
    this.emit(row, { type: 'status', status: 'paused' })
    await new Promise<void>((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(Error('AIGC_OPERATION_CANCELLED')) }
      run.resume = () => { signal.removeEventListener('abort', abort); resolve() }; signal.addEventListener('abort', abort, { once: true })
    }); signal.throwIfAborted()
  }
  async start(id: string, runId: string, selection: ModelSelection, content: ContentBlock[]): Promise<void> {
    const row = this.row(id); z.uuid().parse(runId)
    if (row.runs.has(runId)) throw Error('AIGC_RUN_ALREADY_USED')
    if (row.current && !row.current.finished) throw Error('AIGC_RUN_IN_PROGRESS')
    row.runs.add(runId); row.selection.current = { ...selection }
    const settled = Promise.withResolvers<void>(), run: Run = { id: runId, complete: settled.promise, paused: false, events: [], cursor: 0, acknowledged: 0, delivered: 0, bytes: 0, resultBytes: 0, finished: false, toolResults: [] }; row.current = run
    const before = row.handle.agent.session.snapshotEvents().length
    this.emit(row, { type: 'status', status: 'running' })
    row.handle.agent.followup(createUserMessage({ content, source: { kind: 'user' } }))
    void (async () => {
      try {
        await row.handle.agent.whenIdle()
        const events = row.handle.agent.session.snapshotEvents().slice(before), terminal = events.findLast(event => event.type === 'turn/end'), message = events.findLast(event => event.type === 'assistant/message')
        if (run.overflow) throw Error('AIGC_EVENT_BACKPRESSURE')
        if (!this.current(row.projectId) || !terminal || terminal.type !== 'turn/end' || terminal.data.reason.kind !== 'completed' || !message || message.type !== 'assistant/message' || message.data.interrupted) throw Error('AIGC_NATIVE_RUN_INCOMPLETE')
        const text = message.data.message.content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('\n')
        this.emit(row, { type: 'complete', text, toolResults: run.toolResults.map(({ id, name, result }) => ({ id, name, result })) })
      } catch (error) { this.emit(row, { type: 'error', message: error instanceof Error ? error.message : 'AIGC_NATIVE_RUN_FAILED' }) }
      finally {
        this.emit(row, { type: 'status', status: 'idle' }); this.emit(row, { type: 'done' }); run.finished = true; run.wake?.(); delete run.wake; settled.resolve()
      }
    })()
  }
  async poll(id: string, runId: string, cursor: number, signal: AbortSignal): Promise<{ cursor: number; events: Event[]; finished: boolean }> {
    const row = this.row(id), run = row.current
    if (!run || run.id !== runId || !Number.isSafeInteger(cursor) || cursor < run.acknowledged || cursor > run.cursor) throw Error('AIGC_EVENT_CURSOR_INVALID')
    signal.throwIfAborted()
    run.events = run.events.filter(event => event.cursor > cursor); run.acknowledged = cursor; run.bytes = run.events.reduce((bytes, row) => bytes + Buffer.byteLength(JSON.stringify(row.event)), 0)
    if (!run.events.length && !run.finished) await new Promise<void>((resolve, reject) => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); if (run.wake === finish) delete run.wake; resolve() }
      const abort = () => { clearTimeout(timer); if (run.wake === finish) delete run.wake; reject(Error('AIGC_OPERATION_CANCELLED')) }
      const timer = setTimeout(finish, 25000); run.wake = finish; signal.addEventListener('abort', abort, { once: true })
    })
    signal.throwIfAborted(); this.row(id)
    run.delivered = run.cursor
    return { cursor: run.cursor, events: run.events.map(row => row.event), finished: run.finished }
  }
  toolResult(id: string, callId: string, value: unknown): void {
    const row = this.row(id), call = row.calls.get(callId)
    if (!call) throw Error('AIGC_TOOL_CALLBACK_EXPIRED')
    const input = z.strictObject({ result: z.json().optional(), error: z.string().max(20000).optional(), partial: z.boolean().optional() }).parse(value)
    if (input.partial) { if (input.result === undefined) throw Error('AIGC_TOOL_RESULT_INVALID'); call.update(input.result); return }
    row.calls.delete(callId); call.detach()
    if (input.error !== undefined) call.reject(Error(input.error)); else if (input.result !== undefined) call.resolve(input.result); else call.reject(Error('AIGC_TOOL_RESULT_INVALID'))
  }
  async control(id: string, action: 'pause' | 'resume' | 'stop' | 'close', runId?: string): Promise<{ status: string }> {
    const row = this.row(id), run = row.current
    if (action === 'close') { this.sessions.delete(id); await row.close(); return { status: 'idle' } }
    if (!run || run.finished) return { status: 'idle' }
    if (run.id !== runId) throw Error('AIGC_RUN_CONFLICT')
    if (action === 'pause') { run.paused = true; this.emit(row, { type: 'status', status: 'pausing' }); return { status: 'pausing' } }
    run.paused = false; run.resume?.(); delete run.resume
    if (action === 'stop') { row.handle.agent.cancel({ kind: 'parent' }); await run.complete; return { status: 'idle' } }
    this.emit(row, { type: 'status', status: 'running' }); return { status: 'running' }
  }
  async close(projectId?: string): Promise<void> {
    const rows = [...this.sessions].filter(([, row]) => !projectId || row.projectId === projectId)
    for (const [id] of rows) this.sessions.delete(id)
    await Promise.all(rows.map(([, row]) => row.close()))
  }
}
