import { randomUUID } from 'node:crypto'
import type { HarnessCapabilityCallerV1, HarnessCapabilityTargetV1, OwnedScope } from '@studybuddy/contracts'
export type CapabilityGrantOperation = 'read' | 'execute' | 'import' | 'status' | 'cancel'
const identity = (caller: HarnessCapabilityCallerV1) => JSON.stringify([caller.scope, caller.hostGeneration, caller.callerSessionId, caller.workspaceId])
/** Ephemeral Main-only authority. Persisted project references never serialize these grants. */
export class CapabilityGrantStore {
  private readonly rows = new Map<string, { identity: string; accountId: string; target: HarnessCapabilityTargetV1; operations: Set<CapabilityGrantOperation> }>()
  issue(caller: HarnessCapabilityCallerV1, target: HarnessCapabilityTargetV1, operations: readonly CapabilityGrantOperation[]): string {
    const ref = randomUUID()
    this.rows.set(ref, { identity: identity(caller), accountId: caller.scope.accountId, target: structuredClone(target), operations: new Set(operations) })
    return ref
  }
  assert(ref: string, caller: HarnessCapabilityCallerV1, operation: CapabilityGrantOperation): HarnessCapabilityTargetV1 {
    const row = this.rows.get(ref)
    if (!row || row.identity !== identity(caller) || !row.operations.has(operation)) throw Error('CAPABILITY_GRANT_REVOKED')
    return structuredClone(row.target)
  }
  drop(ref: string): void { this.rows.delete(ref) }
  revoke(owner?: OwnedScope): void { for (const [ref, row] of this.rows) if (!owner || row.accountId === owner.accountId) this.rows.delete(ref) }
}
