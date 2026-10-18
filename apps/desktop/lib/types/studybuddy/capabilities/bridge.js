import { createHash } from 'node:crypto';
import { parseHarnessCapabilityInvocationV1, parseHarnessCapabilityResultV1 } from '@studybuddy/contracts';
const object = (value) => { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('CAPABILITY_INPUT_INVALID'); return value; };
function fields(value, allowed) { const row = object(value); if (Object.keys(row).some(key => !allowed.includes(key)))
    throw Error('CAPABILITY_INPUT_INVALID'); return row; }
function text(value, max = 192) { if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw Error('CAPABILITY_INPUT_INVALID'); return value; }
const result = (data) => parseHarnessCapabilityResultV1({ data, artifacts: [], operationRef: null });
/** Private Host IPC only. Guests cannot mint grants or select caller identity. */
export class CapabilityMainBridge {
    options;
    identity;
    requests = new Map();
    constructor(options) {
        this.options = options;
    }
    assert(caller, host = caller.hostGeneration) {
        const owner = this.options.owner();
        if (!owner || owner.hostGeneration !== host || host !== caller.hostGeneration || JSON.stringify(owner.scope) !== JSON.stringify(caller.scope))
            throw Error('CAPABILITY_SCOPE_REVOKED');
        const identity = JSON.stringify(owner);
        if (this.identity !== identity) {
            this.requests.clear();
            this.options.projects.revoke();
            this.identity = identity;
        }
    }
    async handle(value, hostGeneration, signal) {
        const request = parseHarnessCapabilityInvocationV1(value);
        this.assert(request.caller, hostGeneration);
        signal.throwIfAborted();
        const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex'), old = this.requests.get(request.rpcId);
        if (old && old.hash !== hash)
            throw Error('CAPABILITY_RPC_CONFLICT');
        if (!old && this.requests.size >= 8192)
            throw Error('CAPABILITY_RPC_LIMIT');
        const promise = old?.promise ?? this.dispatch(request, signal).then(value => {
            this.assert(request.caller, hostGeneration);
            signal.throwIfAborted();
            return parseHarnessCapabilityResultV1(value);
        });
        if (!old)
            this.requests.set(request.rpcId, { hash, promise });
        try {
            const reply = await promise;
            this.assert(request.caller, hostGeneration);
            signal.throwIfAborted();
            return structuredClone(reply);
        }
        finally {
            // Read observations are safe to repeat and must not consume the mutation deduplication budget.
            if (['catalog', 'projects', 'status'].includes(request.operation) && this.requests.get(request.rpcId)?.promise === promise)
                this.requests.delete(request.rpcId);
        }
    }
    async dispatch(request, signal) {
        const { caller, target, operation } = request;
        if (operation === 'catalog' || operation === 'projects') {
            if (operation === 'projects' && object(request.input).action === 'restore-origin') {
                if (Object.keys(object(request.input)).join(',') !== 'action' || !this.options.restoreOrigin)
                    throw Error('CAPABILITY_INPUT_INVALID');
                return result({ restored: await this.options.restoreOrigin(caller, signal) });
            }
            const input = fields(request.input, ['moduleId', 'action']), moduleId = text(input.moduleId), port = this.options.projects.port(moduleId);
            if (operation === 'projects')
                return result({ projects: await port.list(caller, signal) });
            if (input.action === 'tools') {
                if (!target)
                    throw Error('CAPABILITY_TARGET_REQUIRED');
                await this.options.projects.assert(caller, target, 'read');
                return result({ tools: await port.tools(caller, target, signal) });
            }
            return result(await port.describe(caller, signal));
        }
        if (operation === 'bind') {
            const input = fields(request.input, ['moduleId', 'action', 'title', 'projectRef', 'artifactRef', 'directory']);
            if (input.action === 'deliver') {
                if (!this.options.deliver || Object.keys(input).sort().join(',') !== 'action,artifactRef,directory')
                    throw Error('CAPABILITY_INPUT_INVALID');
                return result({ files: [await this.options.deliver(caller, text(input.artifactRef), text(input.directory, 32768), signal)] });
            }
            const moduleId = text(input.moduleId);
            if (input.action === 'project-action') {
                if (!this.options.projectAction || Object.keys(input).sort().join(',') !== 'action,moduleId,projectRef')
                    throw Error('CAPABILITY_INPUT_INVALID');
                return result({ projectAction: await this.options.projectAction(caller, { moduleId, projectRef: text(input.projectRef) }, signal) });
            }
            if (input.action === 'open') {
                if (!this.options.open)
                    throw Error('CAPABILITY_OPEN_UNAVAILABLE');
                await this.options.open(caller, { moduleId, projectRef: text(input.projectRef) }, signal);
                return result({ opened: true });
            }
            if (input.action === 'release') {
                await this.options.projects.release(caller, { moduleId, projectRef: text(input.projectRef) });
                return result({ released: true });
            }
            const bind = input.action === 'create' ? { action: 'create', title: text(input.title, 160) } : input.action === 'attach' ? { action: 'attach', projectRef: text(input.projectRef) } : null;
            if (!bind)
                throw Error('CAPABILITY_INPUT_INVALID');
            return result({ target: await this.options.projects.bind(caller, moduleId, bind, signal) });
        }
        if (!target)
            throw Error('CAPABILITY_TARGET_REQUIRED');
        const { port } = await this.options.projects.assert(caller, target, operation);
        if (operation === 'import') {
            const input = fields(request.input, ['artifactRef']);
            const artifact = await this.options.import(caller, text(input.artifactRef), target, signal);
            const metadata = await this.options.importMetadata?.(caller, target, artifact) ?? {};
            return { data: { imported: artifact.artifactRef, ...object(metadata) }, artifacts: [artifact], operationRef: null };
        }
        if (operation === 'execute') {
            const input = fields(request.input, ['tool', 'args']);
            return port.execute(caller, target, text(input.tool, 128), input.args, signal);
        }
        const input = fields(request.input, ['operationRef']), ref = text(input.operationRef);
        return operation === 'status' ? port.status(caller, target, ref, signal) : port.cancel(caller, target, ref, signal);
    }
    revoke() { this.requests.clear(); this.options.projects.revoke(); this.identity = undefined; }
}
//# sourceMappingURL=bridge.js.map