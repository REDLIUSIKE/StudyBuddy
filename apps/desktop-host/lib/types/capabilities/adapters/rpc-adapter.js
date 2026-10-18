import { randomUUID } from 'node:crypto';
import { parseHarnessCapabilityInvocationV1, parseHarnessCapabilityResultV1 } from '@studybuddy/contracts';
/** Module-specific schemas remain owned by the domain. */
export function createRpcCapabilityAdapter(id, revision, port) {
    const operations = new Map();
    const owner = (context, ref) => JSON.stringify([context.caller.scope.accountId, context.caller.callerSessionId, ref]);
    async function invoke(context, operation, target, input) {
        const request = parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: context.caller, operation, target, input });
        const result = parseHarnessCapabilityResultV1(await port.invoke(request, context.signal));
        context.signal.throwIfAborted();
        if (result.operationRef && target)
            operations.set(owner(context, result.operationRef), { ...target });
        return result;
    }
    return {
        id, revision,
        async describe(context) {
            const result = await invoke(context, 'catalog', null, { moduleId: id }), description = result.data;
            if (!description || description.id !== id || description.revision !== revision)
                throw Error('CAPABILITY_MODULE_CHANGED');
            return description;
        },
        async listProjects(context) { const result = await invoke(context, 'projects', null, { moduleId: id }); return result.data.projects; },
        async bind(context, input) {
            const result = await invoke(context, 'bind', null, { moduleId: id, ...input }), target = result.data.target;
            if (!target || target.moduleId !== id)
                throw Error('CAPABILITY_TARGET_INVALID');
            return target;
        },
        async tools(context, target) { const result = await invoke(context, 'catalog', target, { moduleId: id, action: 'tools' }); return result.data.tools; },
        execute: (context, target, tool, args) => invoke(context, 'execute', target, { tool, args }),
        async status(context, ref, authorizedTarget) { const target = authorizedTarget ?? operations.get(owner(context, ref)); if (!target || target.moduleId !== id)
            throw Error('CAPABILITY_OPERATION_NOT_BOUND'); return invoke(context, 'status', target, { operationRef: ref }); },
        async cancel(context, ref, authorizedTarget) { const target = authorizedTarget ?? operations.get(owner(context, ref)); if (!target || target.moduleId !== id)
            throw Error('CAPABILITY_OPERATION_NOT_BOUND'); return invoke(context, 'cancel', target, { operationRef: ref }); },
        async release(context, target) { await invoke(context, 'bind', null, { moduleId: id, action: 'release', projectRef: target.projectRef }); },
    };
}
//# sourceMappingURL=rpc-adapter.js.map