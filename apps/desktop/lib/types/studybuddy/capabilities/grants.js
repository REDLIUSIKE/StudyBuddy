import { randomUUID } from 'node:crypto';
const identity = (caller) => JSON.stringify([caller.scope, caller.hostGeneration, caller.callerSessionId, caller.workspaceId]);
/** Ephemeral Main-only authority. Persisted project references never serialize these grants. */
export class CapabilityGrantStore {
    rows = new Map();
    issue(caller, target, operations) {
        const ref = randomUUID();
        this.rows.set(ref, { identity: identity(caller), accountId: caller.scope.accountId, target: structuredClone(target), operations: new Set(operations) });
        return ref;
    }
    assert(ref, caller, operation) {
        const row = this.rows.get(ref);
        if (!row || row.identity !== identity(caller) || !row.operations.has(operation))
            throw Error('CAPABILITY_GRANT_REVOKED');
        return structuredClone(row.target);
    }
    drop(ref) { this.rows.delete(ref); }
    revoke(owner) { for (const [ref, row] of this.rows)
        if (!owner || row.accountId === owner.accountId)
            this.rows.delete(ref); }
}
//# sourceMappingURL=grants.js.map