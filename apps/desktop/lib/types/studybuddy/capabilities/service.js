import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { assertVideoPath } from "../video-path.js";
import { CapabilityMainBridge } from "./bridge.js";
import { CapabilityProjects } from "./projects.js";
import { CapabilityGrantStore } from "./grants.js";
import { CapabilityAssetTransfer, createCapabilityFileArtifact, readCapabilityFile } from "./assets.js";
import { CapabilityCanvasViews } from "./views.js";
import { AigcCanvasControllers } from "./canvas-controller.js";
import { AigcCapabilityPort } from "./aigc.js";
import { VideoCapabilityPort } from "./video.js";
import { withCapabilityOutputDirectory } from "./directory-write.js";
import { accountVideoDirectory } from "../video-runtime.js";
/** Generic Main lifetime and artifact authority. Domain modules are registered by the composition below. */
export class CapabilityMainService {
    options;
    projects;
    assets;
    bridge;
    modules = new Map();
    locations = new Map();
    active = new Map();
    projectActions = new Map();
    constructor(options) {
        this.options = options;
        this.projects = new CapabilityProjects(new CapabilityGrantStore(), async (caller) => this.assert(caller));
        this.assets = new CapabilityAssetTransfer({ assert: caller => this.assert(caller), put: async (caller, target, source, bytes, signal) => {
                await this.projects.assert(caller, target, 'import');
                return this.module(target.moduleId).port.import(caller, target, source, bytes, signal);
            } });
        this.bridge = new CapabilityMainBridge({ owner: options.owner, projects: this.projects, import: (...args) => this.assets.import(...args), importMetadata: async (_caller, target, artifact) => {
                const location = this.locations.get(artifact.artifactRef);
                if (!location || JSON.stringify(location.target) !== JSON.stringify(target))
                    throw Error('CAPABILITY_ARTIFACT_NOT_FOUND');
                return { relativePath: location.relativePath };
            }, projectAction: async (caller, target, signal) => { this.assert(caller); signal.throwIfAborted(); await this.projects.assert(caller, target, 'read'); this.assert(caller); signal.throwIfAborted(); for (const [id, row] of this.projectActions)
                if (JSON.stringify(row) === JSON.stringify({ caller, target }))
                    return { id }; if (this.projectActions.size >= 2048)
                throw Error('CAPABILITY_ACTION_LIMIT'); const id = randomUUID(); this.projectActions.set(id, structuredClone({ caller, target })); return { id }; }, deliver: (...args) => this.deliver(...args), open: async (caller, target, signal) => { if (!options.open)
                throw Error('CAPABILITY_OPEN_UNAVAILABLE'); await this.projects.assert(caller, target, 'read'); await options.open(caller, target, signal); }, restoreOrigin: async (caller, signal) => { if (!options.destination)
                throw Error('CAPABILITY_ORIGIN_UNAVAILABLE'); const directory = await options.destination(caller, signal); for (const module of this.modules.values())
                if (await module.restore?.(caller, directory)) {
                    this.assert(caller);
                    return true;
                } return false; } });
    }
    assert(caller) { this.bridge.assert(caller); }
    module(id) { const module = this.modules.get(id); if (!module)
        throw Error('CAPABILITY_MODULE_UNAVAILABLE'); return module; }
    register(module) {
        if (this.modules.has(module.port.id))
            throw Error('CAPABILITY_MODULE_INVALID');
        const remove = this.projects.register(module.port);
        this.modules.set(module.port.id, module);
        return () => { remove(); if (this.modules.get(module.port.id) === module)
            this.modules.delete(module.port.id); };
    }
    ids = () => [...this.modules.keys()];
    async openAction(id, scope, signal) {
        const action = this.projectActions.get(id);
        if (!action || JSON.stringify(action.caller.scope) !== JSON.stringify(scope))
            throw Error('CAPABILITY_OPEN_NOT_AUTHORIZED');
        this.assert(action.caller);
        signal.throwIfAborted();
        await this.projects.assert(action.caller, action.target, 'read');
        if (!this.options.open)
            throw Error('CAPABILITY_OPEN_UNAVAILABLE');
        await this.options.open(action.caller, action.target, signal);
        this.assert(action.caller);
    }
    async prepareOpen(caller, target, signal) { await this.projects.assert(caller, target, 'read'); await this.module(target.moduleId).prepareOpen?.(caller, target, signal); }
    async openProject(caller, target, signal) { await this.projects.assert(caller, target, 'read'); const open = this.module(target.moduleId).open; if (!open)
        throw Error('CAPABILITY_OPEN_UNAVAILABLE'); await open(caller, target, signal); this.assert(caller); }
    async deliver(caller, ref, directory, signal) {
        this.assert(caller);
        if (!this.options.destination || directory !== await this.options.destination(caller, signal))
            throw Error('CAPABILITY_DESTINATION_DENIED');
        await assertVideoPath(directory);
        const { artifact, bytes } = await this.assets.read(caller, ref, signal);
        const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'text/vtt': '.vtt', 'application/zip': '.zip', 'text/plain': '.txt', 'text/html': '.html', 'application/json': '.json' }, extension = extensions[artifact.mime];
        if (!extension || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(ref))
            throw Error('CAPABILITY_DELIVERY_INVALID');
        const folder = join(directory, 'deliverables'), name = ref.replaceAll(':', '-') + extension, path = join(folder, name);
        return withCapabilityOutputDirectory(directory, async (protectedDirectory) => {
            await assertVideoPath(path);
            this.assert(caller);
            signal.throwIfAborted();
            try {
                await writeFile(join(protectedDirectory, name), bytes, { flag: 'wx', mode: 0o600 });
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    throw error;
            }
            await readCapabilityFile(path, artifact);
            this.assert(caller);
            signal.throwIfAborted();
            return { path };
        }, this.options.nativeModuleAnchor);
    }
    async artifact(caller, target, file, mime, schemaRef = 'media-v1') {
        this.assert(caller);
        await this.projects.assert(caller, target, 'read');
        const module = this.module(target.moduleId), root = await module.root(caller, target, new AbortController().signal);
        const artifact = await createCapabilityFileArtifact(caller, target, file, mime, [root, ...module.extraRoots?.(caller) ?? []], schemaRef);
        this.assert(caller);
        this.locations.set(artifact.artifactRef, { target: { ...target }, path: file, relativePath: relative(root, file).replaceAll('\\', '/') });
        this.assets.register(caller, artifact, async (signal) => { signal.throwIfAborted(); this.assert(caller); const bytes = await readCapabilityFile(file, artifact); this.assert(caller); signal.throwIfAborted(); return bytes; });
        return artifact;
    }
    async handle(request, signal) {
        const release = this.options.retainSource?.(request.caller);
        const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal]), work = this.bridge.handle(request, request.caller.hostGeneration, combined);
        this.active.set(controller, work);
        try {
            return await work;
        }
        finally {
            this.active.delete(controller);
            release?.();
        }
    }
    async revoke() {
        for (const controller of this.active.keys())
            controller.abort();
        this.bridge.revoke();
        this.assets.revoke();
        this.locations.clear();
        this.projectActions.clear();
        await Promise.allSettled([...this.active.values()]);
    }
}
/** First module registrations. Future modules contribute the same port/root contract. */
export function createStudyBuddyCapabilities(options) {
    const retainSource = (caller) => options.video?.bridge.retainSource(caller) ?? (() => { });
    const service = new CapabilityMainService({ ...options, retainSource });
    let views, controllers, aigc;
    if (options.aigc) {
        const native = options.aigc;
        controllers = new AigcCanvasControllers({ runtime: native.runtime, assert: caller => service.assert(caller), directory: (caller, target, signal) => aigc.directory(caller, target, signal), create: native.create, session: native.session });
        const factory = controllers;
        views = new CapabilityCanvasViews({ assert: caller => service.assert(caller), find: (...args) => factory.find(...args), create: (...args) => factory.create(...args) });
        aigc = new AigcCapabilityPort({ runtime: native.runtime, bridge: native.bridge, views, associated: options.associated, artifact: (...args) => service.artifact(...args), retainSource });
        const port = aigc;
        service.register({ port, root: (...args) => port.directory(...args), prepareOpen: async (caller, target) => { const lease = await views.acquire(caller, target), id = lease.controller.id; await lease.release(); await views.handoff(caller, target, id); }, open: (caller, target, signal) => factory.open(caller, target, signal), restore: (caller, directory) => native.bridge.restoreSource(caller, directory) });
    }
    if (options.video) {
        const native = options.video;
        const port = new VideoCapabilityPort({ ...native, userDataRoot: options.userDataRoot, associated: options.associated, artifact: (...args) => service.artifact(...args) });
        service.register({ port, root: async (caller, target) => { const binding = await native.bridge.retainTask(caller, target.projectRef); return binding.projectRoot; }, extraRoots: caller => [join(accountVideoDirectory(options.userDataRoot, caller.scope.accountId), 'capability-exports')], open: async (caller, target, signal) => { await native.bridge.invokeCapability(caller, target.projectRef, 'openProject', {}, signal); }, restore: (caller, directory) => native.bridge.restoreSource(caller, directory) });
    }
    return { service, async prepareCanvas(caller, projectRef, controllerRef) { if (!views)
            throw Error('AIGC_CANVAS_OWNER_UNAVAILABLE'); await views.handoff(caller, { moduleId: 'aigc', projectRef }, controllerRef); }, async revoke() { const results = await Promise.allSettled([service.revoke(), views?.revoke(), controllers?.close()]); await aigc?.revoke(); const failed = results.find(row => row.status === 'rejected'); if (failed?.status === 'rejected')
            throw failed.reason; } };
}
//# sourceMappingURL=service.js.map