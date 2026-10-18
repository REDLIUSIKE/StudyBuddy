/** Main owns canonical projects and their additive native Session associations. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { aigcSubmit } from './aigc-actions.ts'
import { parseHarnessAigcContextV1 } from '@studybuddy/contracts'
import type { HarnessAigcContextV1, NativeBuiltinHostContextV1, OwnedScope, HarnessAigcToolInvocationV1, HarnessCapabilityCallerV1 } from '@studybuddy/contracts'
import { accountAigcDirectory } from './aigc-data.ts'
import { assertAigcPath } from './aigc-resources.ts'
import { AigcChatStore } from './aigc-chat-store.ts'
import type { AigcLegacySource, AigcChats } from './aigc-chat-store.ts'
import { listAigcHistory, readAigcHistory, aigcHistoryContext } from './aigc-history.ts'
import { z } from 'zod'
interface Options {
  userDataRoot: string
  isCurrent(scope: OwnedScope): boolean
  hostContext(scope: OwnedScope): NativeBuiltinHostContextV1
  command(action: 'scope' | 'bind' | 'tools' | 'project-close' | 'native' | 'cancel-native' | 'chat-title' | 'project-title' | 'submit' | 'records', data: unknown, signal?: AbortSignal): Promise<unknown>
  nativeModel?(scope: OwnedScope, providerId: string, modelId: string): Promise<{ provider: string; model: string; capabilityFlags: readonly string[] }>
  budget?(caller: HarnessCapabilityCallerV1, input: {requestId:string;modelId:string;fundingSource:'platform'|'user_api'}, signal:AbortSignal):Promise<unknown>
  releaseCaller?(scope:OwnedScope,grantRef:string):Promise<void>
}
interface Binding { root: string; context: HarnessAigcContextV1 }
export class AigcBridge {
  private identity = ''
  private lease = randomUUID()
  private store: AigcChatStore | undefined
  private ready: Promise<void> | undefined
  private readonly admitted = new Map<string, Binding>()
  private readonly pending = new Map<string, Promise<HarnessAigcContextV1>>()
  private readonly mounted=new Set<string>()
  private readonly callers = new Map<string, HarnessAigcContextV1>()
  private readonly temporary = new Map<string, { context: HarnessAigcContextV1; nativeSessionId: string; caller?: HarnessCapabilityCallerV1 }>()
  private readonly capabilityCallers = new Map<string, { context: HarnessAigcContextV1; caller: HarnessCapabilityCallerV1; grantRef:string;refs:number }>()
  private helperRoot: string | undefined
  private questionPresenter?: (context: HarnessAigcContextV1, signal: AbortSignal, cancel: () => void) => Promise<() => void>
  constructor(private readonly options: Options) {}
  setQuestionPresenter(presenter: (context: HarnessAigcContextV1, signal: AbortSignal, cancel: () => void) => Promise<() => void>): void { this.questionPresenter = presenter }
  private owner(scope: OwnedScope): NativeBuiltinHostContextV1 {
    if (!this.options.isCurrent(scope)) throw Error('AIGC_SCOPE_REVOKED')
    const owner = this.options.hostContext(scope)
    if (owner.scope.accountId !== scope.accountId || owner.scope.generation !== scope.generation) throw Error('AIGC_SCOPE_REVOKED')
    const identity = JSON.stringify(owner)
    if (this.identity !== identity) {
      this.identity = identity; this.lease = randomUUID(); this.admitted.clear(); this.pending.clear();this.mounted.clear(); this.ready = undefined
      this.callers.clear(); this.temporary.clear(); this.capabilityCallers.clear(); this.helperRoot = undefined
      this.store = new AigcChatStore(() => this.identity === identity && this.options.isCurrent(scope))
    }
    return owner
  }
  private assert(scope: OwnedScope, owner: NativeBuiltinHostContextV1) {
    if (!this.options.isCurrent(scope) || this.identity !== JSON.stringify(owner) || JSON.stringify(this.options.hostContext(scope)) !== this.identity) throw Error('AIGC_SCOPE_REVOKED')
  }
  async project(scope: OwnedScope, directory: string): Promise<string> {
    const owner = this.owner(scope)
    if (typeof directory !== 'string' || !isAbsolute(directory)) throw Error('AIGC_PROJECT_INVALID')
    await assertAigcPath(directory); const root = await realpath(directory)
    if (root !== directory || !(await lstat(root)).isDirectory()) throw Error('AIGC_PROJECT_INVALID')
    if (root !== this.helperRoot) {
      const configured = join(accountAigcDirectory(this.options.userDataRoot, scope.accountId), 'workspaces')
      await assertAigcPath(configured); const allowed = await realpath(configured)
      const offset = relative(allowed, root)
      if (!offset || isAbsolute(offset) || offset === '..' || offset.startsWith('..' + sep)) throw Error('AIGC_PROJECT_INVALID')
    }
    this.assert(scope, owner); return root
  }
  async chats(scope: OwnedScope, directory: string, operation: 'list' | 'create' | 'select' | 'close' = 'list', sessionId?: string, legacy?: AigcLegacySource): Promise<AigcChats> {
    const owner = this.owner(scope), root = await this.project(scope, directory), store = this.store!
    const result = await (operation === 'create' ? store.create(root, legacy) : operation === 'select' ? store.select(root, sessionId ?? '') : operation === 'close' ? store.close(root, sessionId ?? '') : store.get(root))
    this.assert(scope, owner); return result
  }
  async bind(scope: OwnedScope, directory: string, sessionId?: string, mountTools = true): Promise<HarnessAigcContextV1> {
    const owner = this.owner(scope), root = await this.project(scope, directory), chats = await this.chats(scope, root)
    this.assert(scope, owner)
    const id = sessionId ?? chats.selectedSessionId
    if (!chats.chats.some(chat => chat.sessionId === id)) throw Error('AIGC_CHAT_NOT_FOUND')
    const cached = this.pending.get(id); if (cached) return cached.then(async context => { this.assert(scope, owner);if(mountTools&&!this.mounted.has(id)){await this.options.command('tools',{context});this.assert(scope,owner);this.mounted.add(id)}return context })
    const work = (async () => {
      await (this.ready ??= this.options.command('scope', owner).then(() => {})); this.assert(scope, owner)
      const projectId = 'aigc-' + createHash('sha256').update(root).digest('hex').slice(0, 48)
      const raw = await this.options.command('bind', { ...owner, projectId, root, sessionId: id, lease: this.lease }); this.assert(scope, owner)
      if (!raw || typeof raw !== 'object') throw Error('AIGC_BINDING_INVALID')
      const context = parseHarnessAigcContextV1({ ...owner, projectId, sessionId: id, lease: this.lease, workspaceId: Reflect.get(raw, 'workspaceId') })
      if (['scope', 'hostGeneration', 'projectId', 'sessionId', 'lease', 'workspaceId'].some(key => JSON.stringify(Reflect.get(raw, key)) !== JSON.stringify(Reflect.get(context, key)))) throw Error('AIGC_BINDING_INVALID')
      this.admitted.set(id, { root, context })
      const legacy = chats.chats.find(chat => chat.sessionId === id)?.legacy
      const history = legacy ? await readAigcHistory(root, legacy.file) : undefined
      if (history && history.sha256 !== legacy!.sha256) throw Error('AIGC_HISTORY_CHANGED')
      try { if (mountTools) {await this.options.command('tools', { context, ...(history ? { historyContext: aigcHistoryContext(history) } : {}) });this.mounted.add(id)} this.assert(scope, owner) }
      catch (error) { this.admitted.delete(id); throw error }
      return context
    })().catch(error => { if (this.pending.get(id) === work) this.pending.delete(id); throw error })
    this.pending.set(id, work); return work
  }
  bound(scope: OwnedScope, value: HarnessAigcContextV1): Binding {
    const owner = this.owner(scope), context = parseHarnessAigcContextV1(value); this.assert(scope, owner)
    const binding = this.admitted.get(context.sessionId)
    if (!binding || JSON.stringify(binding.context) !== JSON.stringify(context)) throw Error('AIGC_SCOPE_REVOKED')
    return binding
  }
  isEditorOwner(caller:HarnessCapabilityCallerV1,projectRef:string):boolean{
    const binding=this.admitted.get(caller.callerSessionId)
    if(!binding||binding.context.projectId!==projectRef||binding.context.hostGeneration!==caller.hostGeneration||JSON.stringify(binding.context.scope)!==JSON.stringify(caller.scope))return false
    try{this.bound(caller.scope,binding.context);return true}catch{return false}
  }
  async restoreSource(caller:HarnessCapabilityCallerV1,directory:string):Promise<boolean>{
    if(!/(?:^|[\\/])studybuddy-aigc[\\/]accounts[\\/][a-f0-9]{64}[\\/]workspaces[\\/]/i.test(directory))return false
    const root=await this.project(caller.scope,directory),chats=await this.chats(caller.scope,root)
    if(!chats.chats.some(chat=>chat.sessionId===caller.callerSessionId))return false
    const context=await this.bind(caller.scope,root,caller.callerSessionId,true);return context.hostGeneration===caller.hostGeneration
  }
  async tool(request: HarnessAigcToolInvocationV1, invoke: (scope: OwnedScope, input: unknown, signal: AbortSignal) => Promise<unknown>, signal: AbortSignal): Promise<unknown> {
    const scope = request.context.scope, binding = this.bound(scope, request.context); signal.throwIfAborted()
    const caller = request.callerSessionId + ':' + request.toolCallId
    if (this.callers.has(caller)) throw Error('AIGC_CALL_CONFLICT')
    this.callers.set(caller, binding.context)
    try {
      const result = await invoke(scope, request.operation === 'state' ? { operation: 'state' } : { ...(request.input && typeof request.input === 'object' ? request.input : {}),
        operation: request.operation, directory: binding.root, sessionId: request.callerSessionId, ...(request.operation === 'execute' ? { callId: request.toolCallId } : {}) }, signal)
      this.bound(scope, request.context); signal.throwIfAborted(); return result
    } finally { this.callers.delete(caller) }
  }
  retainCapabilityCaller(caller:HarnessCapabilityCallerV1,context:HarnessAigcContextV1){
    const binding=this.bound(caller.scope,context),key=caller.callerSessionId+':'+caller.toolCallId
    if(context.hostGeneration!==caller.hostGeneration)throw Error('AIGC_SCOPE_REVOKED')
    let row=this.capabilityCallers.get(key)
    if(row&&(JSON.stringify(row.caller)!==JSON.stringify(caller)||JSON.stringify(row.context)!==JSON.stringify(context)))throw Error('AIGC_CALL_CONFLICT')
    if(!row){if(this.capabilityCallers.size>=2048)throw Error('AIGC_CALL_LIMIT');row={context:structuredClone(context),caller:structuredClone(caller),grantRef:randomUUID(),refs:0};this.capabilityCallers.set(key,row)}
    row.refs++;const held=row;let released=false
    return{origin:{sessionId:caller.callerSessionId,callId:caller.toolCallId,directory:binding.root,grantRef:row.grantRef},release:async()=>{if(released)return;released=true;if(--held.refs===0&&this.capabilityCallers.get(key)===held){this.capabilityCallers.delete(key);await this.options.releaseCaller?.(caller.scope,held.grantRef)}}}
  }
  private capabilitySource(scope:OwnedScope,value:unknown){
    const origin=z.strictObject({sessionId:z.string(),callId:z.string(),directory:z.string(),grantRef:z.uuid()}).parse(value),row=this.capabilityCallers.get(origin.sessionId+':'+origin.callId)
    if(!row||row.grantRef!==origin.grantRef||this.bound(scope,row.context).root!==origin.directory)throw Error('AIGC_CALL_UNAVAILABLE')
    return row
  }
  async budget(scope:OwnedScope,value:unknown,signal:AbortSignal):Promise<unknown>{
    const input=z.strictObject({requestId:z.uuid(),modelId:z.string().min(1),fundingSource:z.enum(['platform','user_api']),capabilityCaller:z.unknown()}).parse(value),source=this.capabilitySource(scope,input.capabilityCaller)
    if(!this.options.budget)throw Error('AIGC_BUDGET_UNAVAILABLE')
    signal.throwIfAborted();return this.options.budget(source.caller,{requestId:input.requestId,modelId:input.modelId,fundingSource:input.fundingSource},signal)
  }
  async invokeCapability(caller: HarnessCapabilityCallerV1, context: HarnessAigcContextV1, operation: HarnessAigcToolInvocationV1['operation'], input: unknown,
    invoke: (scope: OwnedScope, input: unknown, signal: AbortSignal) => Promise<unknown>, signal: AbortSignal): Promise<unknown> {
    this.bound(caller.scope, context)
    if (context.hostGeneration !== caller.hostGeneration) throw Error('AIGC_SCOPE_REVOKED')
    const hold=this.retainCapabilityCaller(caller,context)
    try { return await this.tool({ schemaVersion: 1, rpcId: randomUUID(), context, callerSessionId: caller.callerSessionId, toolCallId: caller.toolCallId, operation, input:operation==='execute'?{...(input as object),nativeCaller:hold.origin}:input }, invoke, signal) }
    finally { await hold.release() }
  }
  private async invokeNative(scope: OwnedScope, context: HarnessAigcContextV1, operation: 'question' | 'temporary', input: unknown, signal: AbortSignal, caller?: HarnessCapabilityCallerV1): Promise<unknown> {
    this.bound(scope, context); signal.throwIfAborted(); const operationId = randomUUID()
    const abort = () => { void this.options.command('cancel-native', { context, operationId }).catch(() => {}) }
    signal.addEventListener('abort', abort, { once: true })
    try { const result = await this.options.command('native', { context, operationId, operation, input, ...(caller ? { caller } : {}) }, signal); signal.throwIfAborted(); this.bound(scope, context); return result }
    finally { signal.removeEventListener('abort', abort) }
  }
  async question(scope: OwnedScope, input: unknown, signal: AbortSignal): Promise<unknown> {
    const call = z.strictObject({ directory: z.string(), sessionId: z.string(), callId: z.string(), question: z.unknown() }).parse(input)
    const root = await this.project(scope, call.directory)
    const temporary=[...this.temporary.values()].find(row=>row.nativeSessionId===call.sessionId),source=this.capabilityCallers.get(call.sessionId+':'+call.callId)
    const context = this.callers.get(call.sessionId + ':' + call.callId) ?? source?.context ?? temporary?.context
    if (!context || this.bound(scope, context).root !== root) throw Error('AIGC_CALL_UNAVAILABLE')
    const actual = source?.caller??temporary?.caller
    if (actual) return this.invokeNative(scope, context, 'question', { sessionId: actual.callerSessionId, callId: actual.toolCallId, question: call.question }, signal, actual)
    if (!this.questionPresenter) throw Error('AIGC_QUESTION_UNAVAILABLE')
    const controller = new AbortController(), lifetime = AbortSignal.any([signal, controller.signal])
    const hide = await this.questionPresenter(context, lifetime, () => { controller.abort(Error('AIGC_QUESTION_SURFACE_CLOSED')) })
    try { return await this.invokeNative(scope, context, 'question', { sessionId: call.sessionId, callId: call.callId, question: call.question }, lifetime) }
    finally { hide() }
  }
  async temporaryCommand(scope: OwnedScope, value: unknown, signal: AbortSignal): Promise<unknown> {
    const envelope = z.record(z.string(), z.unknown()).parse(value), { capabilityCaller, ...given } = envelope
    let source: { context: HarnessAigcContextV1; caller: HarnessCapabilityCallerV1 } | undefined
    if (capabilityCaller !== undefined) {
      source = this.capabilitySource(scope,capabilityCaller)
    }
    const input = z.looseObject({ action: z.enum(['open', 'start', 'poll', 'result', 'control']), id: z.uuid() }).parse(given)
    if (input.action === 'open') {
      const open = z.strictObject({ action: z.literal('open'), id: z.uuid(), directory: z.string().optional(), systemPrompt: z.string(), tools: z.array(z.unknown()) }).parse(input)
      let directory = open.directory ?? (source ? this.bound(scope, source.context).root : undefined)
      if (source && directory !== this.bound(scope, source.context).root) throw Error('AIGC_CALL_UNAVAILABLE')
      if (!directory) {
        this.owner(scope); directory = join(accountAigcDirectory(this.options.userDataRoot, scope.accountId), 'native-helpers')
        await assertAigcPath(directory); await mkdir(directory, { recursive: true }); directory = await realpath(directory); this.helperRoot = directory
      }
      const context = await this.bind(scope, directory, undefined, directory !== this.helperRoot)
      if (this.temporary.has(open.id) || this.temporary.size >= 32) throw Error('AIGC_TEMPORARY_CONFLICT')
      const result = await this.invokeNative(scope, context, 'temporary', { action: 'open', id: open.id, systemPrompt: open.systemPrompt, tools: open.tools }, signal, source?.caller)
      const row = z.strictObject({ sessionId: z.uuid(), nativeSessionId: z.string() }).parse(result)
      if (row.sessionId !== open.id || row.nativeSessionId !== 'session-' + open.id) throw Error('AIGC_TEMPORARY_INVALID')
      this.temporary.set(open.id, { context, nativeSessionId: row.nativeSessionId, ...(source ? { caller: source.caller } : {}) }); return { ...row, directory: this.bound(scope, context).root }
    }
    const row = this.temporary.get(input.id); if (!row) throw Error('AIGC_TEMPORARY_REVOKED')
    let request: unknown = input
    if (input.action === 'start') {
      const start = z.strictObject({ action: z.literal('start'), id: z.uuid(), runId: z.uuid(), providerId: z.string(), modelId: z.string(), thinkingLevel: z.string().optional(), prompt: z.string(), references: z.array(z.unknown()) }).parse(input)
      if (!this.options.nativeModel) throw Error('AIGC_MODEL_UNAVAILABLE')
      const model = await this.options.nativeModel(scope, start.providerId, start.modelId)
      for (const ref of start.references) {
        const kind = ref && typeof ref === 'object' && 'dataType' in ref ? ref.dataType : undefined
        if (kind !== 'STRING' && !(kind === 'IMAGE' && model.capabilityFlags.includes('image_in'))) throw Error('AIGC_CAPABILITY_UNAVAILABLE')
      }
      request = { action: 'start', id: start.id, runId: start.runId, selection: { provider: model.provider, model: model.model,
        ...(start.thinkingLevel && start.thinkingLevel !== 'off' ? { reasoningEffort: start.thinkingLevel } : {}) }, prompt: start.prompt, references: start.references }
    }
    const result = await this.invokeNative(scope, row.context, 'temporary', request, signal, row.caller)
    if (input.action === 'control' && input.control === 'close') this.temporary.delete(input.id)
    return result
  }
  async archive(scope: OwnedScope, directory: string, file?: string, continueChat = false): Promise<unknown> {
    const root = await this.project(scope, directory), owner = this.owner(scope)
    if (!file) { const list = await listAigcHistory(root); this.assert(scope, owner); return list }
    const history = await readAigcHistory(root, file); this.assert(scope, owner)
    if (!continueChat) return history
    await this.chats(scope, root, 'create', undefined, { file: history.file, sha256: history.sha256 })
    return this.bind(scope, root)
  }
  async rename(scope: OwnedScope, directory: string, sessionId: string, name: string): Promise<AigcChats> {
    const context = await this.bind(scope, directory, sessionId), owner = this.owner(scope)
    await this.options.command('chat-title', { context, title: name }); this.assert(scope, owner)
    const value = await this.store!.rename(directory, sessionId, name); this.assert(scope, owner); return value
  }
  async projectTitle(scope: OwnedScope, directory: string, name: string): Promise<unknown> {
    const context = await this.bind(scope, directory), owner = this.owner(scope)
    const result = await this.options.command('project-title', { context, title: name }); this.assert(scope, owner); return result
  }
  async submit(scope: OwnedScope, value: unknown): Promise<unknown> {
    const input = aigcSubmit.parse(value), context = await this.bind(scope, input.directory, input.sessionId), binding = this.bound(scope, context)
    if (!this.options.nativeModel) throw Error('AIGC_MODEL_UNAVAILABLE')
    const model = await this.options.nativeModel(scope, input.providerId, input.modelId), content: object[] = []
    if (input.prompt.trim()) content.push({ type: 'text', text: input.prompt })
    let bytes = 0
    for (const item of input.attachments) {
      const target = resolve(binding.root, item.path), offset = relative(binding.root, target)
      if (!offset || isAbsolute(offset) || offset === '..' || offset.startsWith('..' + sep) || item.path.includes('\0')) throw Error('AIGC_REFERENCE_INVALID')
      await assertAigcPath(target)
      if (await realpath(target) !== target || !(await lstat(target)).isFile()) throw Error('AIGC_REFERENCE_INVALID')
      if (/^image\/(?:png|jpeg|webp|gif)$/.test(item.mimeType)) {
        if (!model.capabilityFlags.includes('image_in')) throw Error('AIGC_CAPABILITY_UNAVAILABLE')
        const size = (await lstat(target)).size; bytes += size
        if (bytes > 20 * 1024 * 1024) throw Error('AIGC_REFERENCE_TOO_LARGE')
        const image = await readFile(target); if (image.length !== size) throw Error('AIGC_REFERENCE_CHANGED')
        content.push({ type: 'image', mediaType: item.mimeType, data: image.toString('base64'), name: item.name })
      } else content.push({ type: 'text', text: `用户附加的项目文件：${JSON.stringify({ name: item.name, path: offset.split(sep).join('/') })}\n请使用当前工作区的读取工具查看。` })
    }
    if (!content.length) throw Error('AIGC_PROMPT_EMPTY')
    this.bound(scope, context)
    return this.options.command('submit', { context, requestId: input.requestId, selection: { provider: model.provider, model: model.model,
      ...(input.reasoningEffort && input.reasoningEffort !== 'off' ? { reasoningEffort: input.reasoningEffort } : {}) }, content })
  }
  async records(scope: OwnedScope, directory: string, sessionId: string): Promise<unknown> {
    const context = await this.bind(scope, directory, sessionId), result = await this.options.command('records', { context })
    this.bound(scope, context); return result
  }
  async revoke(): Promise<void> {
    this.identity = ''; this.admitted.clear(); this.pending.clear();this.mounted.clear(); this.store = undefined; this.ready = undefined
    this.callers.clear(); this.temporary.clear(); this.capabilityCallers.clear(); this.helperRoot = undefined
    await this.options.command('scope', null)
  }
}
