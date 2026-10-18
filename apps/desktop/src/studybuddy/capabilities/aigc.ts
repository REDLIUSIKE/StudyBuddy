import { createHash, randomUUID } from 'node:crypto'
import { extname, join, relative, isAbsolute } from 'node:path'
import { readdir, mkdir, writeFile, rm } from 'node:fs/promises'
import { parseHarnessCapabilityResultV1 } from '@studybuddy/contracts'
import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, HarnessCapabilityJsonV1 as Json, HarnessCapabilityArtifactV1 as Artifact, HarnessAigcContextV1 } from '@studybuddy/contracts'
import type { AigcBridge } from '../aigc-bridge.ts'
import type { AigcDomainRuntime } from '../aigc-domain-runtime.ts'
import { assertAigcPath } from '../aigc-resources.ts'
import type { CapabilityDomainPort, CapabilityProject } from './projects.ts'
import type { CapabilityCanvasViews,CanvasLease } from './views.ts'
import { AIGC_CAPABILITY_REVISION } from '../../../../../integrations/toonflow/apps/server/src/embedded/capability-contract.mjs'
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('AIGC_RESPONSE_INVALID'); return value as Record<string, unknown> }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const owner = (caller: Caller, ref: string) => JSON.stringify([caller.scope, caller.hostGeneration, caller.workspaceId ?? caller.callerSessionId, ref])
const reads = new Set(['read', 'ls', 'getCanvas', 'findCanvasNodes', 'getCanvasNodes', 'getCanvasEdges', 'getNodeTools', 'getDocument'])
const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.vtt': 'text/vtt' }
interface NodeOperation {caller:Caller;target:Target;directory:string;canvasId:string;nodeId:string;generationId:string;lease:CanvasLease;releaseCaller():Promise<void>;result?:ReturnType<typeof parseHarnessCapabilityResultV1>;closed?:Promise<void>}
interface Options {
  runtime: AigcDomainRuntime; bridge: AigcBridge; views: CapabilityCanvasViews
  associated(caller: Caller, target: Target): Promise<boolean>
  artifact(caller: Caller, target: Target, file: string, mime: string): Promise<Artifact>
  retainSource?(caller:Caller):()=>void
}
/** Live domain tools keep their source descriptor hashes; native Sessions never inherit the target cwd. */
export class AigcCapabilityPort implements CapabilityDomainPort {
  readonly id = 'aigc'
  readonly revision = AIGC_CAPABILITY_REVISION
  private readonly created = new Set<string>()
  private readonly operations=new Map<string,NodeOperation>()
  constructor(private readonly options: Options) {}
  async describe(): Promise<Json> { return { id: this.id, revision: this.revision, label: 'AIGC 创作', artifactSchemas: { 'media-v1': { type: 'object', properties: { moduleId: { type:'string',const: this.id } }, required: ['moduleId'], additionalProperties: true } } } }
  async directory(caller: Caller, target: Target, signal: AbortSignal): Promise<string> {
    const row = record(await this.options.runtime.invoke(caller.scope, { operation: 'capability-project', action: 'resolve', projectRef: target.projectRef }, signal))
    if (row.projectRef !== target.projectRef || typeof row.directory !== 'string') throw Error('AIGC_PROJECT_INVALID')
    return this.options.bridge.project(caller.scope, row.directory)
  }
  private async admitted(caller: Caller, target: Target): Promise<void> {
    if (!this.created.has(owner(caller, target.projectRef))&&!this.options.bridge.isEditorOwner(caller,target.projectRef) && !await this.options.associated(caller, target)) throw Error('CAPABILITY_PROJECT_NOT_AUTHORIZED')
  }
  async list(caller: Caller, signal: AbortSignal): Promise<CapabilityProject[]> {
    const data = record(await this.options.runtime.invoke(caller.scope, { operation: 'capability-project', action: 'list' }, signal))
    if (!Array.isArray(data.projects)) throw Error('AIGC_RESPONSE_INVALID')
    const projects: CapabilityProject[] = []
    for (const value of data.projects) {
      const row = record(value), target = { moduleId: this.id, projectRef: String(row.projectRef) }
      if (typeof row.projectRef !== 'string' || typeof row.title !== 'string') throw Error('AIGC_RESPONSE_INVALID')
      if (this.created.has(owner(caller, target.projectRef))||this.options.bridge.isEditorOwner(caller,target.projectRef) || await this.options.associated(caller, target)) projects.push({ target, title: row.title })
    }
    return projects
  }
  async create(caller: Caller, title: string, signal: AbortSignal): Promise<CapabilityProject> {
    const row = record(await this.options.runtime.invoke(caller.scope, { operation: 'capability-project', action: 'create', title }, signal))
    if (typeof row.projectRef !== 'string' || typeof row.title !== 'string') throw Error('AIGC_PROJECT_INVALID')
    this.created.add(owner(caller, row.projectRef))
    return this.resolve(caller, row.projectRef, signal)
  }
  async resolve(caller: Caller, ref: string, signal: AbortSignal): Promise<CapabilityProject> {
    const target = { moduleId: this.id, projectRef: ref }; await this.admitted(caller, target)
    const directory = await this.directory(caller, target, signal)
    await this.options.bridge.bind(caller.scope, directory, undefined, false)
    return { target, title: directory.split(/[\\/]/).at(-1) ?? ref }
  }
  private async binding(caller: Caller, target: Target, signal: AbortSignal): Promise<{ directory: string; context: HarnessAigcContextV1 }> {
    await this.admitted(caller, target); const directory = await this.directory(caller, target, signal)
    const context = await this.options.bridge.bind(caller.scope, directory, undefined, false); return { directory, context }
  }
  private async catalog(caller: Caller, target: Target, signal: AbortSignal) {
    const { context } = await this.binding(caller, target, signal), lease = await this.options.views.acquire(caller, target)
    try {
      const data = record(await this.options.bridge.invokeCapability(caller, context, 'catalog', {}, (scope, input, signal) => this.options.runtime.invoke(scope, input, signal), signal))
      if (!Array.isArray(data.tools)) throw Error('AIGC_RESPONSE_INVALID')
      return data.tools.map(record)
    } finally { await lease.release() }
  }
  async tools(caller: Caller, target: Target, signal: AbortSignal): Promise<Json> {
    const catalog = await this.catalog(caller, target, signal)
    const tools: Array<Record<string,unknown>> = catalog.map(tool => ({ name: tool.name, description: [tool.description, ...(Array.isArray(tool.promptGuidelines) ? tool.promptGuidelines : [])].join('\n'), parameters: tool.parameters,inputValidation:'domain',
      revision: digest(tool), effect: reads.has(String(tool.name)) ? 'read' : /(?:nodeTools|node:|generate|runNode|singleAgent)/i.test(String(tool.name)) ? 'generation' : 'write',
      output: { type: 'object', properties: { content: { type: 'array', items: { type: 'object', additionalProperties: true } }, details: {} }, required: ['content', 'details'], additionalProperties: false } }))
    tools.push({ name: 'assets', description: 'List completed local media artifacts in this creative document. Returned artifactRef values can be imported into another bound module.', parameters: { type: 'object', properties: {}, additionalProperties: false }, revision: this.revision, effect: 'read', output: { type: 'object', properties: { assets: { type: 'array', items: { type: 'object', additionalProperties: true } } }, required: ['assets'], additionalProperties: false } })
    return tools as unknown as Json
  }
  async execute(caller: Caller, target: Target, tool: string, args: Json, signal: AbortSignal) {
    const { directory, context } = await this.binding(caller, target, signal)
    const lease = await this.options.views.acquire(caller, target)
    let retained=false
    try {
      if (tool === 'assets') {
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw Error('AIGC_ARGUMENTS_INVALID')
        const artifacts: Artifact[] = []
        const walk = async (folder: string, depth: number) => {
          if (depth > 8 || artifacts.length >= 1000) throw Error('AIGC_ASSET_LIST_LIMIT')
          await assertAigcPath(folder)
          for (const entry of await readdir(folder, { withFileTypes: true })) {
            signal.throwIfAborted(); if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
            const file = join(folder, entry.name)
            if (entry.isDirectory()) await walk(file, depth + 1)
            else if (entry.isFile() && mimeTypes[extname(file).toLowerCase()]) artifacts.push(await this.options.artifact(caller, target, file, mimeTypes[extname(file).toLowerCase()]!))
          }
        }
        await walk(directory, 0)
        return { data: { assets: artifacts as unknown as Json }, artifacts, operationRef: null }
      }
      const catalog = await this.catalog(caller, target, signal), descriptor = catalog.find(row => row.name === tool)
      if (!descriptor || typeof descriptor.schemaSha256 !== 'string') throw Error('AIGC_TOOL_UNAVAILABLE')
      const state = await lease.state()
      const hold=this.options.bridge.retainCapabilityCaller(caller,context),releaseSource=this.options.retainSource?.(caller)
      try{
        const data = await this.options.bridge.invokeCapability(caller, context, 'execute', { name: tool, arguments: args, schemaSha256: descriptor.schemaSha256, canvasId: state.canvasId, expectedRevision: state.revision },
          (scope, input, signal) => this.options.runtime.invoke(scope, input, signal), signal)
        const details=record(data).details,request=args&&typeof args==='object'&&!Array.isArray(args)?args:null
        if(tool==='nodeTools'&&details&&typeof details==='object'&&'status'in details&&details.status==='generating'&&'generationId'in details&&typeof details.generationId==='string'&&typeof request?.nodeId==='string'){
          if(this.operations.size>=2048)throw Error('AIGC_OPERATION_LIMIT')
          const operationRef='aigc-node:'+digest([caller.scope,caller.callerSessionId,caller.toolCallId,target,details.generationId])
          this.operations.set(operationRef,{caller:structuredClone(caller),target:structuredClone(target),directory,canvasId:state.canvasId,nodeId:request.nodeId,generationId:details.generationId,lease,releaseCaller:async()=>{try{await hold.release()}finally{releaseSource?.()}}});retained=true
          return parseHarnessCapabilityResultV1({data,artifacts:[],operationRef})
        }
        const artifacts:Artifact[]=[]
        if(Array.isArray(details))for(const output of details){if(output&&typeof output==='object'&&'path'in output&&typeof output.path==='string'&&'mimeType'in output&&typeof output.mimeType==='string'){
          const file=join(directory,output.path),back=relative(directory,file);if(!back||isAbsolute(back)||back==='..'||back.startsWith('../')||back.startsWith('..\\'))throw Error('AIGC_ARTIFACT_INVALID');artifacts.push(await this.options.artifact(caller,target,file,output.mimeType))
        }}
        return parseHarnessCapabilityResultV1({ data, artifacts, operationRef: null })
      }finally{if(!retained){try{await hold.release()}finally{releaseSource?.()}}}
    } finally { if(!retained)await lease.release() }
  }
  private operation(caller:Caller,target:Target,ref:string){
    const row=this.operations.get(ref)
    if(!row)throw Error('CAPABILITY_OUTCOME_UNKNOWN:'+ref)
    if(JSON.stringify([row.caller.scope,row.caller.hostGeneration,row.caller.callerSessionId,row.target])!==JSON.stringify([caller.scope,caller.hostGeneration,caller.callerSessionId,target]))throw Error('CAPABILITY_OPERATION_NOT_AUTHORIZED')
    return row
  }
  private finish(row:NodeOperation){return row.closed??=Promise.resolve().then(async()=>{try{await row.lease.release()}finally{await row.releaseCaller()}})}
  async status(caller:Caller,target:Target,ref:string,signal:AbortSignal){
    const row=this.operation(caller,target,ref);if(row.result)return row.result
    try{
    if(!row.lease.controller.command)throw Error('AIGC_CONTROLLER_OPERATION_UNAVAILABLE')
    const status=record(await row.lease.controller.command('generationStatus',{canvasId:row.canvasId,nodeId:row.nodeId,generationId:row.generationId},signal))
    if(status.generationId!==row.generationId)throw Error('CAPABILITY_OUTCOME_UNKNOWN:'+ref)
    if(status.status==='running')return parseHarnessCapabilityResultV1({data:{state:'in_progress'},artifacts:[],operationRef:ref})
    if(!['succeeded','failed'].includes(String(status.status)))throw Error('CAPABILITY_OUTCOME_UNKNOWN:'+ref)
    const artifacts:Artifact[]=[]
    if(status.status==='succeeded'){
      const outputs=record(status.outputs)
      for(const output of Object.values(outputs)){
        if(!output||typeof output!=='object'||!('value'in output)||!output.value||typeof output.value!=='object'||!('url'in output.value)||typeof output.value.url!=='string')continue
        const file=join(row.directory,output.value.url),back=relative(row.directory,file),mime=mimeTypes[extname(file).toLowerCase()]
        if(!mime||!back||isAbsolute(back)||back==='..'||back.startsWith('../')||back.startsWith('..\\'))throw Error('AIGC_ARTIFACT_INVALID')
        artifacts.push(await this.options.artifact(caller,target,file,mime))
      }
      if(!artifacts.length)throw Error('AIGC_OUTPUT_MISSING')
    }
    await row.lease.controller.flush?.();row.result=parseHarnessCapabilityResultV1({data:{state:status.status==='succeeded'?'completed':'failed',generationId:row.generationId,...(typeof status.error==='string'?{error:status.error}:{})},artifacts,operationRef:ref});await this.finish(row);return row.result
    }catch(error){
      // Aborting one status reader does not cancel a still-running generation. A later owned poll can reconcile it.
      if(signal.aborted)throw error
      const message=error instanceof Error?error.message:'AIGC_OPERATION_UNCONFIRMED'
      row.result=parseHarnessCapabilityResultV1({data:{state:/AIGC_OUTPUT_MISSING|AIGC_ARTIFACT_INVALID|CAPABILITY_CONTENT_/.test(message)?'failed':'unknown',generationId:row.generationId,error:message},artifacts:[],operationRef:ref})
      await this.finish(row);return row.result
    }
  }
  async cancel(caller:Caller,target:Target,ref:string,signal:AbortSignal){const row=this.operation(caller,target,ref);if(row.result)return row.result;if(!row.lease.controller.command)throw Error('AIGC_CONTROLLER_OPERATION_UNAVAILABLE');await row.lease.controller.command('cancelGeneration',{canvasId:row.canvasId,nodeId:row.nodeId,generationId:row.generationId},signal);return this.status(caller,target,ref,signal)}
  async revoke(){const rows=[...this.operations.values()];this.operations.clear();this.created.clear();await Promise.allSettled(rows.map(row=>this.finish(row)))}
  async release(caller:Caller,target:Target):Promise<void>{
    const rows=[...this.operations.entries()].filter(([,row])=>JSON.stringify([row.caller.scope,row.caller.hostGeneration,row.caller.callerSessionId,row.target])===JSON.stringify([caller.scope,caller.hostGeneration,caller.callerSessionId,target]))
    await Promise.allSettled(rows.map(async([ref,row])=>{try{if(!row.result)await this.cancel(caller,target,ref,AbortSignal.timeout(5000))}finally{await this.finish(row)}}))
  }
  async import(caller: Caller, target: Target, source: Artifact, bytes: Buffer, signal: AbortSignal): Promise<Artifact> {
    const { directory } = await this.binding(caller, target, signal), extension = Object.entries(mimeTypes).find(([, mime]) => mime === source.mime)?.[0]
    if (!extension) throw Error('AIGC_IMPORT_UNSUPPORTED')
    const relativeSource = '.studybuddy-capability-import/' + randomUUID() + '.tmp', file = join(directory, relativeSource)
    await assertAigcPath(file); await mkdir(join(directory, '.studybuddy-capability-import'), { recursive: true }); await assertAigcPath(file)
    try {
      await writeFile(file, bytes, { flag: 'wx', mode: 0o600 }); signal.throwIfAborted()
      const row = record(await this.options.runtime.invoke(caller.scope, { operation: 'capability-import', directory, relativeSource, name: source.artifactRef + extension, bytes: bytes.length, sha256: source.sha256, mime: source.mime }, signal))
      if (typeof row.relativePath !== 'string' || row.sha256 !== source.sha256) throw Error('AIGC_IMPORT_INVALID')
      const path = join(directory, row.relativePath), back = relative(directory, path); if (isAbsolute(back) || back.startsWith('..')) throw Error('AIGC_IMPORT_INVALID')
      return this.options.artifact(caller, target, path, source.mime)
    } finally { await assertAigcPath(file); await rm(file, { force: true }) }
  }
}
