import { createHash, randomUUID } from 'node:crypto';
import { assertObjectJsonSchema, assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { parseHarnessCapabilityInvocationV1, parseHarnessCapabilityResultV1 } from '@studybuddy/contracts';
import { capabilityContext } from "./context.js";
import { CapabilityJobs } from "./jobs.js";
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$' };
const targetSchema = { type: 'object', properties: { moduleId: id, projectRef: id }, required: ['moduleId', 'projectRef'], additionalProperties: false };
function output(data) {
    return { type: 'object', properties: { data, artifacts: { type: 'array', items: { type: 'object', additionalProperties: true } }, operationRef: { oneOf: [{ type: 'string' }, { type: 'null' }] } }, required: ['data', 'artifacts', 'operationRef'], additionalProperties: false };
}
const canonical = (data) => parseHarnessCapabilityResultV1({ data, artifacts: [], operationRef: null });
function descriptorHash(value) {
    if (!/^[A-Za-z][A-Za-z0-9_:-]{0,127}$/.test(value.name) || !['read', 'write', 'generation'].includes(value.effect) || typeof value.description !== 'string')
        throw Error('CAPABILITY_TOOL_INVALID');
    if (value.revision !== undefined && !/^[a-f0-9]{64}$/.test(value.revision))
        throw Error('CAPABILITY_TOOL_INVALID');
    if (value.inputValidation === 'domain') {
        if (value.parameters.type !== 'object' || !JSON.stringify(value.parameters))
            throw Error('CAPABILITY_TOOL_INVALID');
    }
    else {
        if (value.inputValidation !== undefined)
            throw Error('CAPABILITY_TOOL_INVALID');
        assertObjectJsonSchema(value.parameters);
    }
    assertSupportedJsonSchema(value.output);
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
/** Native tools bind an explicit module document to the actual invoking Agent. */
export class CapabilityTools {
    ctx;
    registry;
    store;
    policy;
    options;
    mounts = new Map();
    admissions = new Map();
    ownedAgents = new WeakSet();
    accepting = true;
    lifetime = new AbortController();
    active = new Set();
    remove = [];
    jobs;
    constructor(ctx, registry, store, policy, options) {
        this.ctx = ctx;
        this.registry = registry;
        this.store = store;
        this.policy = policy;
        this.options = options;
        this.jobs = new CapabilityJobs(ctx, registry, store, context => this.assert(context));
        this.remove.push(registry.onRemove(async (moduleId) => { for (const agent of this.mounts.keys())
            this.unmount(agent, moduleId); await this.jobs.withdrawModule(moduleId); await this.releaseAdmissions(row => row.target.moduleId === moduleId); }));
        this.remove.push(ctx.tools.register(this.tracked(this.projectTool())), ctx.tools.register(this.tracked(this.importTool())));
    }
    tracked(definition) {
        return { ...definition, execute: (input, exec) => {
                const work = Promise.resolve().then(() => {
                    if (validateJsonSchemaValue(definition.parameters, input, 'arguments').length)
                        throw Error('CAPABILITY_TOOL_ARGUMENTS_INVALID');
                    return definition.execute(input, exec);
                });
                this.active.add(work);
                void work.then(() => { this.active.delete(work); }, () => { this.active.delete(work); });
                return work;
            } };
    }
    permits(agent, name) {
        if (name === 'creative_project' || name === 'creative_import')
            return true;
        return [...(this.mounts.get(agent)?.values() ?? [])].some(mount => !mount.controller.signal.aborted && mount.names.has(name));
    }
    async revoke() { this.accepting = false; for (const agent of this.mounts.keys())
        for (const moduleId of this.mounts.get(agent)?.keys() ?? [])
            this.unmount(agent, moduleId); await this.jobs.close(); await Promise.allSettled([...this.active]); await this.releaseAdmissions(() => true, false); }
    resume() { if (this.lifetime.signal.aborted)
        throw Error('CAPABILITY_SCOPE_REVOKED'); this.accepting = true; }
    ownAdmission(context, target, adapter) {
        let rows = this.admissions.get(context.agent);
        if (!rows) {
            rows = new Map();
            this.admissions.set(context.agent, rows);
        }
        rows.set(JSON.stringify(target), { context: { ...context, signal: new AbortController().signal }, target: { ...target }, adapter });
        if (!this.ownedAgents.has(context.agent)) {
            this.ownedAgents.add(context.agent);
            context.agent.ctx.effect(() => async () => { for (const id of this.mounts.get(context.agent)?.keys() ?? [])
                this.unmount(context.agent, id); await this.jobs.withdrawAgent(context.agent); await this.releaseAdmissions(row => row.context.agent === context.agent); }, 'capabilities.agent');
        }
    }
    async releaseAdmissions(predicate, strict = true) {
        const released = [];
        for (const [agent, rows] of this.admissions) {
            for (const [id, row] of rows)
                if (predicate(row)) {
                    rows.delete(id);
                    released.push(row);
                }
            if (!rows.size)
                this.admissions.delete(agent);
        }
        const results = await Promise.allSettled(released.map(row => row.adapter.release({ ...row.context, signal: AbortSignal.timeout(5000) }, row.target))), failed = results.find(row => row.status === 'rejected');
        if (strict && failed?.status === 'rejected')
            throw failed.reason;
    }
    context(exec) {
        if (!this.accepting)
            throw Error('CAPABILITY_SCOPE_REVOKED');
        const owner = this.options.owner();
        if (!owner)
            throw Error('CAPABILITY_SCOPE_UNAVAILABLE');
        return capabilityContext(this.ctx, owner, { ...exec, signal: AbortSignal.any([exec.signal, this.lifetime.signal]) });
    }
    identity(context) { return JSON.stringify([context.caller.scope, context.caller.hostGeneration]); }
    assert(context) {
        context.signal.throwIfAborted();
        const owner = this.options.owner();
        if (!owner || this.identity(context) !== JSON.stringify([owner.scope, owner.hostGeneration]) || this.ctx.agents.get(context.agent.id) !== context.agent)
            throw Error('CAPABILITY_SCOPE_REVOKED');
    }
    async validateArtifacts(context, target, artifacts) {
        if (!artifacts.length)
            return;
        const adapter = this.registry.get(target.moduleId), description = await adapter.describe(context);
        this.assert(context);
        this.registry.get(adapter.id, description.revision);
        for (const artifact of artifacts) {
            if (artifact.moduleId !== adapter.id || !Object.hasOwn(description.artifactSchemas, artifact.schemaRef))
                throw Error('CAPABILITY_ARTIFACT_SCHEMA_UNAVAILABLE');
            const schema = description.artifactSchemas[artifact.schemaRef];
            assertSupportedJsonSchema(schema);
            if (validateJsonSchemaValue(schema, artifact, 'artifact').length)
                throw Error('CAPABILITY_ARTIFACT_INVALID');
        }
    }
    projectTool() {
        return {
            name: 'creative_project', description: 'Find available creative capabilities and create or attach an editable document for this conversation. List modules first when needed. Binding supplies that module\'s tools; keep working in the current conversation.',
            parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list-modules', 'list-projects', 'create', 'attach', 'release', 'status', 'cancel', 'deliver', 'open'] }, moduleId: id, title: { type: 'string', minLength: 1, maxLength: 160 }, projectRef: id, operationRef: id, artifactRef: id }, required: ['action'], additionalProperties: false },
            output: { schema: output({}), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }], presentationMeta: (_args, value) => parseHarnessCapabilityResultV1(value).data },
            execute: async (input, exec) => {
                const args = input;
                const context = this.context(exec);
                await this.policy.authorize(context, ['create', 'cancel', 'deliver'].includes(args.action) ? 'write' : 'read', null, input);
                this.assert(context);
                if (args.action === 'status' || args.action === 'cancel') {
                    if (!args.operationRef)
                        throw Error('CAPABILITY_OPERATION_REQUIRED');
                    return this.jobs.reconcile(context, args.operationRef, args.action === 'cancel');
                }
                if (args.action === 'deliver') {
                    if (!args.artifactRef)
                        throw Error('CAPABILITY_ARTIFACT_REQUIRED');
                    if (!this.ctx.tools.get('present', context.agent)) {
                        await this.options.prepareDelivery?.(context.agent);
                        this.assert(context);
                    }
                    const directory = this.ctx.get('workingDirectory'), present = this.ctx.tools.get('present', context.agent);
                    if (!directory || !present)
                        throw Error('CAPABILITY_NATIVE_DELIVERY_UNAVAILABLE');
                    const cwd = await directory.ensure(context.agent, context.signal), request = parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: context.caller, operation: 'bind', target: null, input: { action: 'deliver', artifactRef: args.artifactRef, directory: cwd } });
                    const result = parseHarnessCapabilityResultV1(await this.options.port.invoke(request, context.signal));
                    this.assert(context);
                    const files = result.data?.files;
                    if (!Array.isArray(files) || files.some(file => !file || typeof file !== 'object' || Object.keys(file).join(',') !== 'path' || typeof file.path !== 'string'))
                        throw Error('CAPABILITY_DELIVERY_INVALID');
                    await present.execute({ files }, exec);
                    this.assert(context);
                    return result;
                }
                if (args.action === 'list-modules') {
                    const descriptions = [];
                    for (const moduleId of this.registry.ids()) {
                        const adapter = this.registry.get(moduleId), description = await adapter.describe(context);
                        this.assert(context);
                        this.registry.get(moduleId, adapter.revision);
                        if (description.id !== adapter.id || description.revision !== adapter.revision)
                            throw Error('CAPABILITY_MODULE_CHANGED');
                        descriptions.push(description);
                    }
                    return canonical({ modules: descriptions });
                }
                if (!args.moduleId)
                    throw Error('CAPABILITY_MODULE_REQUIRED');
                const adapter = this.registry.get(args.moduleId), revision = adapter.revision;
                if (args.action === 'open') {
                    if (!args.projectRef)
                        throw Error('CAPABILITY_TARGET_REQUIRED');
                    const target = await adapter.bind(context, { action: 'attach', projectRef: args.projectRef });
                    this.assert(context);
                    return parseHarnessCapabilityResultV1(await this.options.port.invoke(parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: context.caller, operation: 'bind', target: null, input: { action: 'open', moduleId: target.moduleId, projectRef: target.projectRef } }), context.signal));
                }
                if (args.action === 'list-projects') {
                    const projects = await adapter.listProjects(context);
                    this.assert(context);
                    this.registry.get(adapter.id, revision);
                    return canonical({ projects: projects });
                }
                if (args.action === 'release') {
                    const mount = this.mounts.get(context.agent)?.get(adapter.id);
                    if (!mount || mount.target.projectRef !== args.projectRef || mount.identity !== this.identity(context))
                        throw Error('CAPABILITY_PROJECT_NOT_BOUND');
                    this.unmount(context.agent, adapter.id);
                    await this.jobs.withdrawTarget(context.agent, mount.target);
                    await this.releaseAdmissions(row => row.context.agent === context.agent && JSON.stringify(row.target) === JSON.stringify(mount.target));
                    this.assert(context);
                    return canonical({ released: true });
                }
                if (args.action !== 'create' && args.action !== 'attach')
                    throw Error('CAPABILITY_ACTION_INVALID');
                if (args.action === 'create' && !args.title || args.action === 'attach' && !args.projectRef)
                    throw Error('CAPABILITY_TARGET_REQUIRED');
                const target = await adapter.bind(context, args.action === 'create' ? { action: 'create', title: args.title } : { action: 'attach', projectRef: args.projectRef });
                this.assert(context);
                this.registry.get(adapter.id, revision);
                if (target.moduleId !== adapter.id || validateJsonSchemaValue(targetSchema, target, 'target').length)
                    throw Error('CAPABILITY_TARGET_INVALID');
                this.ownAdmission(context, target, adapter);
                // The domain binding has committed even if loading its editor/tool catalogue later fails.
                await this.store.link(context.caller, target, null);
                this.assert(context);
                const names = await this.mount(context, target, revision);
                const action = parseHarnessCapabilityResultV1(await this.options.port.invoke(parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: context.caller, operation: 'bind', target: null, input: { action: 'project-action', moduleId: target.moduleId, projectRef: target.projectRef } }), context.signal));
                this.assert(context);
                const projectAction = action.data && typeof action.data === 'object' && !Array.isArray(action.data) ? action.data.projectAction ?? null : null;
                return canonical({ target, tools: names, projectAction });
            },
        };
    }
    importTool() {
        return {
            name: 'creative_import', description: 'Import one authorized completed artifact into a bound creative document. Reuses its original bytes without generating or charging for another asset.',
            parameters: { type: 'object', properties: { target: targetSchema, artifactRef: id }, required: ['target', 'artifactRef'], additionalProperties: false },
            output: { schema: output({}), render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
            execute: async (input, exec) => {
                const args = input, context = this.context(exec);
                await this.policy.authorize(context, 'write', args.target, input);
                this.assert(context);
                const mount = this.mounts.get(context.agent)?.get(args.target.moduleId);
                if (!mount || mount.identity !== this.identity(context) || mount.target.projectRef !== args.target.projectRef)
                    throw Error('CAPABILITY_PROJECT_NOT_BOUND');
                const request = parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), caller: context.caller, operation: 'import', target: args.target, input: { artifactRef: args.artifactRef } });
                const result = parseHarnessCapabilityResultV1(await this.options.port.invoke(request, context.signal));
                this.assert(context);
                await this.validateArtifacts(context, args.target, result.artifacts);
                for (const artifact of result.artifacts)
                    await this.store.recordArtifact(context.caller, artifact);
                this.assert(context);
                return result;
            },
        };
    }
    async mount(context, target, revision) {
        const adapter = this.registry.get(target.moduleId, revision), description = await adapter.describe(context);
        this.assert(context);
        if (description.id !== adapter.id || description.revision !== revision)
            throw Error('CAPABILITY_MODULE_CHANGED');
        for (const schema of Object.values(description.artifactSchemas))
            assertSupportedJsonSchema(schema);
        const catalog = await adapter.tools(context, target);
        this.assert(context);
        this.registry.get(target.moduleId, revision);
        const hashes = new Map(), names = new Set();
        for (const descriptor of catalog) {
            const name = 'creative_' + target.moduleId + '_' + descriptor.name;
            if (name.length > 128 || names.has(name))
                throw Error('CAPABILITY_TOOL_INVALID');
            names.add(name);
            hashes.set(descriptor.name, descriptorHash(descriptor));
        }
        this.unmount(context.agent, target.moduleId);
        let mounts = this.mounts.get(context.agent);
        if (!mounts) {
            mounts = new Map();
            this.mounts.set(context.agent, mounts);
        }
        target = structuredClone(target);
        const mount = { target, identity: this.identity(context), controller: new AbortController(), remove: [], names };
        mounts.set(target.moduleId, mount);
        try {
            for (const descriptor of catalog) {
                const name = 'creative_' + target.moduleId + '_' + descriptor.name, expected = hashes.get(descriptor.name);
                mount.remove.push(context.agent.ctx.tools.register(this.tracked({
                    name, description: descriptor.description, parameters: structuredClone(descriptor.parameters),
                    output: { schema: output(structuredClone(descriptor.output)), render: (_args, value) => {
                            const result = parseHarnessCapabilityResultV1(value);
                            if (!adapter.presentResult)
                                return [{ type: 'text', text: JSON.stringify(result) }];
                            return [...adapter.presentResult(result), ...(result.artifacts.length || result.operationRef ? [{ type: 'text', text: JSON.stringify({ artifacts: result.artifacts, operationRef: result.operationRef }) }] : [])];
                        } },
                    execute: async (input, exec) => {
                        const current = this.context(exec);
                        const call = { ...current, signal: AbortSignal.any([current.signal, mount.controller.signal]) };
                        if (call.agent !== context.agent || mount.identity !== this.identity(call) || !this.ctx.tools.get('creative_project', call.agent))
                            throw Error('CAPABILITY_SCOPE_REVOKED');
                        const provider = this.registry.get(target.moduleId, revision);
                        await this.policy.authorize(call, descriptor.effect, target, input);
                        this.assert(call);
                        const latest = (await provider.tools(call, target)).find(tool => tool.name === descriptor.name);
                        if (!latest || descriptorHash(latest) !== expected)
                            throw Error('CAPABILITY_TOOL_CONTRACT_CHANGED');
                        if (validateJsonSchemaValue(latest.parameters, input, 'arguments').length)
                            throw Error('CAPABILITY_TOOL_ARGUMENTS_INVALID');
                        this.assert(call);
                        const result = parseHarnessCapabilityResultV1(await provider.execute(call, target, descriptor.name, input));
                        this.assert(call);
                        this.registry.get(target.moduleId, revision);
                        if (validateJsonSchemaValue(latest.output, result.data, 'data').length)
                            throw Error('CAPABILITY_TOOL_RESULT_INVALID');
                        await this.validateArtifacts(call, target, result.artifacts);
                        await this.store.link(call.caller, target, result.operationRef);
                        if (result.operationRef)
                            this.jobs.track(call, target, result.operationRef);
                        for (const artifact of result.artifacts)
                            await this.store.recordArtifact(call.caller, artifact);
                        this.assert(call);
                        return result;
                    },
                })));
            }
        }
        catch (error) {
            this.unmount(context.agent, target.moduleId);
            throw error;
        }
        return [...names];
    }
    unmount(agent, moduleId) {
        const mounts = this.mounts.get(agent), mount = mounts?.get(moduleId);
        if (!mount)
            return;
        mounts.delete(moduleId);
        mount.controller.abort();
        for (const remove of mount.remove.reverse())
            remove();
        if (!mounts.size)
            this.mounts.delete(agent);
    }
    async close() {
        await this.revoke();
        this.lifetime.abort();
        for (const [agent, mounts] of this.mounts)
            for (const moduleId of mounts.keys())
                this.unmount(agent, moduleId);
        for (const remove of this.remove.splice(0).reverse())
            remove();
        await Promise.allSettled([...this.active]);
    }
}
//# sourceMappingURL=tools.js.map