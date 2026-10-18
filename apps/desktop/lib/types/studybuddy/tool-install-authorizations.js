import { BusinessFailure } from "./business-api.js";
const identity = (owner) => JSON.stringify([owner.lease, owner.scope, owner.moduleId]);
function canonical(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    const row = value;
    return ('{' +
        Object.keys(row)
            .sort()
            .map(key => JSON.stringify(key) + ':' + canonical(row[key]))
            .join(',') +
        '}');
}
const stale = () => new BusinessFailure('INSTALL_PLAN_STALE');
const unknownResultCodes = new Set(['NATIVE_RESULT_UNKNOWN', 'NATIVE_FRAME_INVALID', 'NATIVE_PROTOCOL_INVALID', 'NATIVE_RESPONSE_INVALID', 'NATIVE_RUNTIME_UNAVAILABLE']);
const unconfirmed = (error) => !!error && typeof error === 'object' && 'code' in error && unknownResultCodes.has(String(error.code));
const installationTargets = new Map([
    ['chatgptdesktop', 'codex'], ['codex', 'codex'], ['claude_code', 'claude_code'],
    ['hermes', 'hermes'], ['kimicode', 'kimicode'], ['openclaw', 'openclaw'], ['workbuddy', 'workbuddy'],
]);
/** A page never receives the private Rust authorizationId. Revocation retains journals. */
export class ToolInstallAuthorizations {
    native;
    grants = new Map();
    planning = new Set();
    uncertainPreparations = new Set();
    revoked = new Set();
    constructor(native) {
        this.native = native;
    }
    current(owner) {
        const key = identity(owner);
        if (this.revoked.has(key))
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        return key;
    }
    /** @param owner Current private view lease. @param toolId One admitted tool, never a page-selected component set.
     * @returns Public native evidence and exact issued plan, without the private authorization.
     */
    async prepare(owner, toolId) {
        const target = installationTargets.get(toolId);
        if (!target)
            throw new BusinessFailure('TOOL_OPERATION_DENIED');
        const response = await this.issue(owner, async () => {
            const prepared = await this.native.invoke(owner.scope, 'prepareToolInstallation', [toolId]);
            if (prepared.plan.selectedComponentIds.length !== 1 || prepared.plan.selectedComponentIds[0] !== target
                || prepared.inventory.inventoryId !== prepared.plan.inventoryId
                || prepared.inventory.catalogVersion !== prepared.plan.catalogVersion
                || prepared.authorizationId !== null && (prepared.plan.blockers.length > 0 || prepared.plan.items.some(item => item.action === 'blocked')))
                throw new BusinessFailure('NATIVE_RESPONSE_INVALID');
            return prepared;
        });
        return { inventory: structuredClone(response.inventory), plan: structuredClone(response.plan) };
    }
    async issue(owner, request) {
        const key = this.current(owner), prior = this.grants.get(key);
        if (this.planning.has(key))
            throw new BusinessFailure('INSTALL_PLAN_BUSY');
        if (this.uncertainPreparations.has(key))
            throw new BusinessFailure('NATIVE_RESULT_UNKNOWN');
        this.planning.add(key);
        try {
            if (prior?.attempted) {
                if (prior.writing)
                    throw new BusinessFailure('INSTALL_PLAN_BUSY');
                if (!prior.runId)
                    throw new BusinessFailure('NATIVE_RESULT_UNKNOWN');
                const run = await this.native.invoke(owner.scope, 'getInstallRun', [prior.runId]);
                this.current(owner);
                if (run.runId !== prior.runId || run.catalogVersion !== prior.plan.catalogVersion)
                    throw new BusinessFailure('NATIVE_RESULT_UNKNOWN');
                if (!['completed', 'failed', 'cancelled'].includes(run.phase))
                    throw new BusinessFailure('INSTALL_PLAN_BUSY');
            }
            let response;
            try {
                response = await request();
            }
            catch (error) {
                this.current(owner);
                if (unconfirmed(error))
                    this.uncertainPreparations.add(key);
                throw error;
            }
            this.current(owner);
            const plan = structuredClone(response.plan);
            if (response.authorizationId) {
                this.grants.set(key, {
                    owner: structuredClone(owner),
                    plan: structuredClone(plan),
                    authorizationId: response.authorizationId,
                    attempted: false,
                });
            }
            else {
                this.grants.delete(key);
            }
            return response;
        }
        finally {
            this.planning.delete(key);
        }
    }
    async recover(owner, grant) {
        this.current(owner);
        const active = await this.native.invoke(owner.scope, 'getActiveInstall', [grant.authorizationId]);
        this.current(owner);
        if (!active || canonical(active.plan) !== canonical(grant.plan))
            throw new BusinessFailure('NATIVE_RESULT_UNKNOWN');
        const run = await this.native.invoke(owner.scope, 'getInstallRun', [active.run.runId]);
        this.current(owner);
        if (run.runId !== active.run.runId || run.catalogVersion !== grant.plan.catalogVersion)
            throw new BusinessFailure('NATIVE_RESULT_UNKNOWN');
        grant.runId = run.runId;
        return { plan: structuredClone(grant.plan), run };
    }
    /** Original zero-argument UI readback can recover a lost start, including terminal journals. */
    async active(owner) {
        const key = this.current(owner), grant = this.grants.get(key);
        if (grant?.attempted && !grant.runId && !grant.writing)
            return this.recover(owner, grant);
        const active = await this.native.invoke(owner.scope, 'getActiveInstall', []);
        this.current(owner);
        return active;
    }
    async start(owner, plan) {
        const key = this.current(owner), grant = this.grants.get(key);
        if (this.planning.has(key))
            throw new BusinessFailure('INSTALL_PLAN_BUSY');
        if (!grant || canonical(grant.plan) !== canonical(plan))
            throw stale();
        if (grant.writing)
            return grant.writing;
        if (grant.runId) {
            const run = await this.native.invoke(owner.scope, 'getInstallRun', [grant.runId]);
            this.current(owner);
            return run;
        }
        if (grant.attempted) {
            return (await this.recover(owner, grant)).run;
        }
        grant.attempted = true;
        const writing = this.native
            .invoke(owner.scope, 'startInstall', [grant.authorizationId, structuredClone(grant.plan)])
            .then((run) => {
            this.current(owner);
            grant.runId = run.runId;
            return run;
        })
            .catch(async (error) => {
            this.current(owner);
            if (error && typeof error === 'object' && 'code' in error && error.code === 'INSTALL_PLAN_STALE') {
                const original = await this.native.invoke(owner.scope, 'getActiveInstall', [grant.authorizationId]);
                this.current(owner);
                if (!original)
                    this.grants.delete(key);
            }
            if (unconfirmed(error)) {
                try {
                    return (await this.recover(owner, grant)).run;
                }
                catch {
                    this.current(owner);
                    throw new BusinessFailure('NATIVE_RESULT_UNKNOWN');
                }
            }
            throw error;
        })
            .finally(() => {
            delete grant.writing;
        });
        grant.writing = writing;
        return writing;
    }
    revoke(owner) {
        const key = identity(owner);
        this.revoked.add(key);
        this.grants.delete(key);
    }
    revokeScope(scope) {
        for (const grant of this.grants.values()) {
            if (grant.owner.scope.accountId === scope.accountId && grant.owner.scope.generation === scope.generation)
                this.revoke(grant.owner);
        }
    }
}
//# sourceMappingURL=tool-install-authorizations.js.map