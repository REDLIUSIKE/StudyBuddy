import { randomUUID } from 'node:crypto'
import { parseHarnessCapabilityInvocationV1, parseHarnessCapabilityResultV1 } from '@studybuddy/contracts'
import type { HarnessCapabilityInvocationV1 } from '@studybuddy/contracts'
import type { CapabilityAdapter, CapabilityContext, CapabilityJson, CapabilityModuleDescription, CapabilityTarget, CapabilityToolDescriptor } from '../types.ts'
export interface CapabilityAdapterPort { invoke(request: HarnessCapabilityInvocationV1, signal: AbortSignal): Promise<unknown> }
/** Module-specific schemas remain owned by the domain. */
export function createRpcCapabilityAdapter(id: string, revision: string, port: CapabilityAdapterPort): CapabilityAdapter {
  const operations = new Map<string, CapabilityTarget>()
  const owner = (context: CapabilityContext, ref: string) => JSON.stringify([context.caller.scope.accountId, context.caller.callerSessionId, ref])
  async function invoke(context: CapabilityContext, operation: HarnessCapabilityInvocationV1['operation'], target: CapabilityTarget | null, input: CapabilityJson) {
    const request = parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: context.caller, operation, target, input })
    const result = parseHarnessCapabilityResultV1(await port.invoke(request, context.signal)); context.signal.throwIfAborted()
    if (result.operationRef && target) operations.set(owner(context, result.operationRef), { ...target })
    return result
  }
  return {
    id, revision,
    async describe(context) {
      const result = await invoke(context, 'catalog', null, { moduleId: id }), description = result.data as unknown as CapabilityModuleDescription
      if (!description || description.id !== id || description.revision !== revision) throw Error('CAPABILITY_MODULE_CHANGED')
      return description
    },
    async listProjects(context) { const result = await invoke(context, 'projects', null, { moduleId: id }); return (result.data as unknown as { projects: { target: CapabilityTarget; title: string }[] }).projects },
    async bind(context, input) {
      const result = await invoke(context, 'bind', null, { moduleId: id, ...input }), target = (result.data as unknown as { target: CapabilityTarget }).target
      if (!target || target.moduleId !== id) throw Error('CAPABILITY_TARGET_INVALID')
      return target
    },
    async tools(context, target) { const result = await invoke(context, 'catalog', target, { moduleId: id, action: 'tools' }); return (result.data as unknown as { tools: CapabilityToolDescriptor[] }).tools },
    execute: (context, target, tool, args) => invoke(context, 'execute', target, { tool, args }),
    async status(context, ref,authorizedTarget) { const target = authorizedTarget??operations.get(owner(context, ref)); if (!target||target.moduleId!==id) throw Error('CAPABILITY_OPERATION_NOT_BOUND'); return invoke(context, 'status', target, { operationRef: ref }) },
    async cancel(context, ref,authorizedTarget) { const target = authorizedTarget??operations.get(owner(context, ref)); if (!target||target.moduleId!==id) throw Error('CAPABILITY_OPERATION_NOT_BOUND'); return invoke(context, 'cancel', target, { operationRef: ref }) },
    async release(context, target) { await invoke(context, 'bind', null, { moduleId: id, action: 'release', projectRef: target.projectRef }) },
  }
}
