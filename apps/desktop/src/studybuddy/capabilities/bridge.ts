import { createHash } from 'node:crypto'
import { parseHarnessCapabilityInvocationV1, parseHarnessCapabilityResultV1 } from '@studybuddy/contracts'
import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, HarnessCapabilityResultV1 as Result, HarnessCapabilityInvocationV1 as Invocation, NativeBuiltinHostContextV1 } from '@studybuddy/contracts'
import type { CapabilityProjects } from './projects.ts'
interface Options {
  owner(): NativeBuiltinHostContextV1 | null
  projects: CapabilityProjects
  import(caller: Caller, ref: string, target: Target, signal: AbortSignal): Promise<Result['artifacts'][number]>
  importMetadata?(caller:Caller,target:Target,artifact:Result['artifacts'][number]):Promise<Invocation['input']>
  deliver?(caller:Caller,ref:string,directory:string,signal:AbortSignal):Promise<{path:string}>
  open?(caller:Caller,target:Target,signal:AbortSignal):Promise<void>
  projectAction?(caller:Caller,target:Target,signal:AbortSignal):Promise<{id:string}>
  restoreOrigin?(caller:Caller,signal:AbortSignal):Promise<boolean>
}
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('CAPABILITY_INPUT_INVALID'); return value as Record<string, unknown> }
function fields(value: unknown, allowed: string[]): Record<string, unknown> { const row = object(value); if (Object.keys(row).some(key => !allowed.includes(key))) throw Error('CAPABILITY_INPUT_INVALID'); return row }
function text(value: unknown, max = 192): string { if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('CAPABILITY_INPUT_INVALID'); return value }
const result = (data: unknown): Result => parseHarnessCapabilityResultV1({ data, artifacts: [], operationRef: null })
/** Private Host IPC only. Guests cannot mint grants or select caller identity. */
export class CapabilityMainBridge {
  private identity: string | undefined
  private readonly requests = new Map<string, { hash: string; promise: Promise<Result> }>()
  constructor(private readonly options: Options) {}
  assert(caller: Caller, host = caller.hostGeneration): void {
    const owner = this.options.owner()
    if (!owner || owner.hostGeneration !== host || host !== caller.hostGeneration || JSON.stringify(owner.scope) !== JSON.stringify(caller.scope)) throw Error('CAPABILITY_SCOPE_REVOKED')
    const identity = JSON.stringify(owner)
    if (this.identity !== identity) { this.requests.clear(); this.options.projects.revoke(); this.identity = identity }
  }
  async handle(value: unknown, hostGeneration: string, signal: AbortSignal): Promise<Result> {
    const request = parseHarnessCapabilityInvocationV1(value)
    this.assert(request.caller, hostGeneration); signal.throwIfAborted()
    const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex'), old = this.requests.get(request.rpcId)
    if (old && old.hash !== hash) throw Error('CAPABILITY_RPC_CONFLICT')
    if (!old && this.requests.size >= 8192) throw Error('CAPABILITY_RPC_LIMIT')
    const promise = old?.promise ?? this.dispatch(request, signal).then(value => {
      this.assert(request.caller, hostGeneration); signal.throwIfAborted(); return parseHarnessCapabilityResultV1(value)
    })
    if (!old) this.requests.set(request.rpcId, { hash, promise })
    try{const reply = await promise
      this.assert(request.caller, hostGeneration); signal.throwIfAborted(); return structuredClone(reply)
    }finally{
      // Read observations are safe to repeat and must not consume the mutation deduplication budget.
      if(['catalog','projects','status'].includes(request.operation)&&this.requests.get(request.rpcId)?.promise===promise)this.requests.delete(request.rpcId)
    }
  }
  private async dispatch(request: Invocation, signal: AbortSignal): Promise<Result> {
    const { caller, target, operation } = request
    if (operation === 'catalog' || operation === 'projects') {
      if(operation==='projects'&&object(request.input).action==='restore-origin'){if(Object.keys(object(request.input)).join(',')!=='action'||!this.options.restoreOrigin)throw Error('CAPABILITY_INPUT_INVALID');return result({restored:await this.options.restoreOrigin(caller,signal)})}
      const input = fields(request.input, ['moduleId', 'action']), moduleId = text(input.moduleId), port = this.options.projects.port(moduleId)
      if (operation === 'projects') return result({ projects: await port.list(caller, signal) })
      if (input.action === 'tools') {
        if (!target) throw Error('CAPABILITY_TARGET_REQUIRED')
        await this.options.projects.assert(caller, target, 'read')
        return result({ tools: await port.tools(caller, target, signal) })
      }
      return result(await port.describe(caller, signal))
    }
    if (operation === 'bind') {
      const input = fields(request.input, ['moduleId', 'action', 'title', 'projectRef','artifactRef','directory'])
      if(input.action==='deliver'){if(!this.options.deliver||Object.keys(input).sort().join(',')!=='action,artifactRef,directory')throw Error('CAPABILITY_INPUT_INVALID');return result({files:[await this.options.deliver(caller,text(input.artifactRef),text(input.directory,32768),signal)]})}
      const moduleId = text(input.moduleId)
      if(input.action==='project-action'){if(!this.options.projectAction||Object.keys(input).sort().join(',')!=='action,moduleId,projectRef')throw Error('CAPABILITY_INPUT_INVALID');return result({projectAction:await this.options.projectAction(caller,{moduleId,projectRef:text(input.projectRef)},signal)})}
      if(input.action==='open'){if(!this.options.open)throw Error('CAPABILITY_OPEN_UNAVAILABLE');await this.options.open(caller,{moduleId,projectRef:text(input.projectRef)},signal);return result({opened:true})}
      if (input.action === 'release') { await this.options.projects.release(caller, { moduleId, projectRef: text(input.projectRef) }); return result({ released: true }) }
      const bind = input.action === 'create' ? { action: 'create' as const, title: text(input.title, 160) } : input.action === 'attach' ? { action: 'attach' as const, projectRef: text(input.projectRef) } : null
      if (!bind) throw Error('CAPABILITY_INPUT_INVALID')
      return result({ target: await this.options.projects.bind(caller, moduleId, bind, signal) })
    }
    if (!target) throw Error('CAPABILITY_TARGET_REQUIRED')
    const { port } = await this.options.projects.assert(caller, target, operation)
    if (operation === 'import') {
      const input = fields(request.input, ['artifactRef'])
      const artifact = await this.options.import(caller, text(input.artifactRef), target, signal)
      const metadata=await this.options.importMetadata?.(caller,target,artifact)??{}
      return { data: { imported: artifact.artifactRef,...object(metadata) } as Invocation['input'], artifacts: [artifact], operationRef: null }
    }
    if (operation === 'execute') {
      const input = fields(request.input, ['tool', 'args'])
      return port.execute(caller, target, text(input.tool, 128), input.args as Invocation['input'], signal)
    }
    const input = fields(request.input, ['operationRef']), ref = text(input.operationRef)
    return operation === 'status' ? port.status(caller, target, ref, signal) : port.cancel(caller, target, ref, signal)
  }
  revoke(): void { this.requests.clear(); this.options.projects.revoke(); this.identity = undefined }
}
