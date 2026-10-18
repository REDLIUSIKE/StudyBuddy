import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, OwnedScope } from '@studybuddy/contracts';
interface Options {
    assert(caller: Caller): void;
    notify(caller: Caller, target: Target, id: string): void;
    open(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
}
/** A trusted shell action selects the existing page; the domain performs its original project transition. */
export declare class CapabilityProjectNavigation {
    private readonly options;
    private readonly pending;
    constructor(options: Options);
    open(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
    complete(id: string, scope: OwnedScope): Promise<void>;
    revoke(): void;
}
export {};
//# sourceMappingURL=navigation.d.ts.map