import type { HarnessCapabilityCallerV1, HarnessCapabilityTargetV1, OwnedScope } from '@studybuddy/contracts';
export type CapabilityGrantOperation = 'read' | 'execute' | 'import' | 'status' | 'cancel';
/** Ephemeral Main-only authority. Persisted project references never serialize these grants. */
export declare class CapabilityGrantStore {
    private readonly rows;
    issue(caller: HarnessCapabilityCallerV1, target: HarnessCapabilityTargetV1, operations: readonly CapabilityGrantOperation[]): string;
    assert(ref: string, caller: HarnessCapabilityCallerV1, operation: CapabilityGrantOperation): HarnessCapabilityTargetV1;
    drop(ref: string): void;
    revoke(owner?: OwnedScope): void;
}
//# sourceMappingURL=grants.d.ts.map