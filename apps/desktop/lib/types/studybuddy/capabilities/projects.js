const key = (caller, target) => JSON.stringify([caller.scope, caller.hostGeneration, caller.callerSessionId, caller.workspaceId, target]);
/** Resolves only domain-owned documents; this service never widens native filesystem roots. */
export class CapabilityProjects {
    grants;
    authorize;
    ports = new Map();
    links = new Map();
    constructor(grants, authorize) {
        this.grants = grants;
        this.authorize = authorize;
    }
    register(port) {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(port.id) || !/^[a-f0-9]{64}$/.test(port.revision) || this.ports.has(port.id))
            throw Error('CAPABILITY_MODULE_INVALID');
        this.ports.set(port.id, port);
        return () => { if (this.ports.get(port.id) === port)
            this.ports.delete(port.id); for (const [id, link] of this.links)
            if (link.port === port) {
                this.grants.drop(link.ref);
                this.links.delete(id);
            } };
    }
    ids() { return [...this.ports.keys()]; }
    port(moduleId) { const port = this.ports.get(moduleId); if (!port)
        throw Error('CAPABILITY_MODULE_UNAVAILABLE'); return port; }
    async bind(caller, moduleId, input, signal) {
        signal.throwIfAborted();
        const port = this.port(moduleId);
        await this.authorize(caller, input.action === 'create' ? 'write' : 'read', input.action === 'attach' ? { moduleId, projectRef: input.projectRef } : null);
        signal.throwIfAborted();
        const project = await (input.action === 'create' ? port.create(caller, input.title, signal) : port.resolve(caller, input.projectRef, signal));
        signal.throwIfAborted();
        if (this.port(moduleId) !== port || project.target.moduleId !== moduleId || input.action === 'attach' && project.target.projectRef !== input.projectRef)
            throw Error('CAPABILITY_PROJECT_INVALID');
        await this.authorize(caller, 'read', project.target);
        signal.throwIfAborted();
        const id = key(caller, project.target), old = this.links.get(id);
        if (old)
            this.grants.drop(old.ref);
        this.links.set(id, { ref: this.grants.issue(caller, project.target, ['read', 'execute', 'import', 'status', 'cancel']), port });
        return structuredClone(project.target);
    }
    async assert(caller, target, operation) {
        const link = this.links.get(key(caller, target));
        if (!link)
            throw Error('CAPABILITY_PROJECT_NOT_BOUND');
        const admitted = this.grants.assert(link.ref, caller, operation);
        if (this.port(target.moduleId) !== link.port)
            throw Error('CAPABILITY_MODULE_CHANGED');
        await this.authorize(caller, ['execute', 'import'].includes(operation) ? 'write' : 'read', admitted);
        return { port: link.port, target: admitted };
    }
    async release(caller, target) {
        const id = key(caller, target), link = this.links.get(id);
        if (!link)
            throw Error('CAPABILITY_PROJECT_NOT_BOUND');
        this.grants.drop(link.ref);
        this.links.delete(id);
        await link.port.release(caller, target);
    }
    revoke() { this.grants.revoke(); this.links.clear(); }
}
//# sourceMappingURL=projects.js.map