import type { Context } from '@deepseek-ai/cordis'
import { CapabilityRegistry } from './registry.ts'
import { CapabilityAssociationStore } from './associations.ts'
import { CapabilityPolicy } from './policy.ts'
import { CapabilityTools } from './tools.ts'
import type { CapabilityPluginOptions } from './types.ts'

export const name = 'studybuddy-capabilities'
export const inject = ['tools', 'agents', 'sessions', 'storageDomain', 'sandboxPolicy', 'systemPrompt']
export interface CapabilityServices { registry: CapabilityRegistry; associations: CapabilityAssociationStore; policy: CapabilityPolicy; tools:CapabilityTools;restoreOrigin?(agent:import('@deepseek-ai/dsh-agent').Agent):Promise<boolean> }
declare module '@deepseek-ai/cordis' { interface Context { capabilities: CapabilityServices } }

/** Mount the shared module contract once; adapters contribute independently. */
export function apply(ctx: Context, options: CapabilityPluginOptions): void {
  const registry = new CapabilityRegistry(), associations = new CapabilityAssociationStore(ctx)
  const policy = new CapabilityPolicy(ctx, options.authorize)
  const tools = new CapabilityTools(ctx, registry, associations, policy, options)
  ctx.provide('capabilities', { registry, associations, policy,tools })
  ctx.systemPrompt.context({ name: 'studybuddy-capabilities', order: 68, required: true, interpolate: false,
    text: 'Use creative_project to discover available creative modules and create or attach an editable document. Its returned tools work in this conversation. Use creative_import to transfer a completed authorized artifact between modules without regenerating it. Keep the original request ID when an outcome is unknown. Treat returned document references as handles; use the admitted module tools for edits and preserve manual changes.' })
  ctx.effect(() => async () => { await tools.close(); await associations.close() }, 'capabilities.tools')
}
