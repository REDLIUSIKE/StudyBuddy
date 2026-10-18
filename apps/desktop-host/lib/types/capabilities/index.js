import { CapabilityRegistry } from "./registry.js";
import { CapabilityAssociationStore } from "./associations.js";
import { CapabilityPolicy } from "./policy.js";
import { CapabilityTools } from "./tools.js";
export const name = 'studybuddy-capabilities';
export const inject = ['tools', 'agents', 'sessions', 'storageDomain', 'sandboxPolicy', 'systemPrompt'];
/** Mount the shared module contract once; adapters contribute independently. */
export function apply(ctx, options) {
    const registry = new CapabilityRegistry(), associations = new CapabilityAssociationStore(ctx);
    const policy = new CapabilityPolicy(ctx, options.authorize);
    const tools = new CapabilityTools(ctx, registry, associations, policy, options);
    ctx.provide('capabilities', { registry, associations, policy, tools });
    ctx.systemPrompt.context({ name: 'studybuddy-capabilities', order: 68, required: true, interpolate: false,
        text: 'Use creative_project to discover available creative modules and create or attach an editable document. Its returned tools work in this conversation. Use creative_import to transfer a completed authorized artifact between modules without regenerating it. Keep the original request ID when an outcome is unknown. Treat returned document references as handles; use the admitted module tools for edits and preserve manual changes.' });
    ctx.effect(() => async () => { await tools.close(); await associations.close(); }, 'capabilities.tools');
}
//# sourceMappingURL=index.js.map