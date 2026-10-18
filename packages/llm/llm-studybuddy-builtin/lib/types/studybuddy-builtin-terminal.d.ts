/** Observe exact provider terminal fields without deriving tokens from stream events. */
import type { NativeBuiltinTerminalUsageV1, NativeBuiltinUsageRecordV1, NativeProtocol } from '@studybuddy/contracts';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
/** Mutable observation owned only by a single private adapter dispatch. */
export interface BuiltinResponseFacts {
    providerResponseId: string | null;
    returnedModel: string | null;
    usage: NativeBuiltinTerminalUsageV1 | null;
    outcome: NativeBuiltinUsageRecordV1['outcome'];
}
/** Project provider-terminal aggregate counts; absent raw fields never become SDK zero defaults.
 * @param facts - Raw response observation from this exact private request.
 * @returns Disjoint known cache/input fields and the authoritative full-call total, or undefined. */
export declare function projectBuiltinTerminalUsage(facts: BuiltinResponseFacts): TokenUsage | undefined;
/** Wrap the provider fetch while leaving its exact response bytes available to the shipped SDK.
 * @param transport - The process-owned HTTP implementation.
 * @param protocol - Native-issued exact protocol.
 * @param facts - One request's private observation, never shared across requests.
 * @returns A no-redirect transport with a bounded incremental SSE observer. */
export declare function observeBuiltinTerminal(transport: typeof fetch, protocol: NativeProtocol, facts: BuiltinResponseFacts): typeof fetch;
//# sourceMappingURL=studybuddy-builtin-terminal.d.ts.map