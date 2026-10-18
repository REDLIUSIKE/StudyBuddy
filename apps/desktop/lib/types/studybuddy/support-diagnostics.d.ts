import { type ClientLogEvent, type HarnessDiagnosticSource, type HarnessDiagnosticsBatch, type HarnessDiagnosticsImport, type OwnedScope } from '@studybuddy/contracts';
declare const events: readonly ["harness_started", "harness_authenticated", "harness_scope_revoked", "harness_bridge_failed", "harness_window_failed", "harness_host_started", "harness_host_terminated", "harness_update_failed", "harness_support_started", "harness_support_completed", "harness_support_failed", "harness_module_acquired", "harness_module_failed", "harness_module_released", "harness_previous_exit_unclean"];
type EventName = typeof events[number];
/** Only controlled event names, safe codes and bounded numeric facts are collected. */
export interface HarnessDiagnosticEvent {
    source: HarnessDiagnosticSource;
    eventName: EventName;
    outcome: ClientLogEvent['outcome'];
    errorCode?: string;
    durationMs?: number;
    fields?: Readonly<{
        attempt?: number;
        exitCode?: number;
        signalObserved?: boolean;
    }>;
}
/** Availability describes collected operational sources, not tool or model health. */
export interface DiagnosticCoverage {
    source: HarnessDiagnosticSource;
    state: 'present' | 'unavailable' | 'failed';
}
/** Trusted main-process dependencies; source readers return account-attributed operational records. */
export interface SupportDiagnosticsDeps {
    metadata: Readonly<Pick<ClientLogEvent, 'appVersion' | 'buildNumber' | 'platform' | 'architecture' | 'sessionId'>>;
    readScope(): OwnedScope | undefined;
    transport(scope: OwnedScope, batch: HarnessDiagnosticsBatch): Promise<HarnessDiagnosticsImport>;
    now?(): Date;
    readers?: Partial<Record<HarnessDiagnosticSource, () => Promise<readonly unknown[]>>>;
}
/** Main owns collection, import and revocation. Closing Settings does not dispose this owner. */
export interface SupportDiagnostics {
    record(event: HarnessDiagnosticEvent): void;
    collect(): Promise<void>;
    flush(): Promise<void>;
    coverage(): readonly DiagnosticCoverage[];
    revoke(): void;
    dispose(): void;
}
/** Create a bounded adapter over existing app-owned diagnostics.
 * @param deps Trusted metadata, current account and private native transport.
 * @returns A process-owned collector whose pending work is discarded on account revocation.
 */
export declare function createSupportDiagnostics(deps: SupportDiagnosticsDeps): SupportDiagnostics;
export {};
//# sourceMappingURL=support-diagnostics.d.ts.map