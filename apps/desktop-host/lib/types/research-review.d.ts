import type { HarnessResearchContextV1 } from '@studybuddy/contracts';
export interface ReviewFinding {
    severity: 'concern' | 'blocker';
    location: string;
    finding: string;
    evidence: string;
    fix: string;
}
export interface ReviewInput {
    operationId: string;
    modelRef: string | null;
    reasoningEffort: string | null;
    sourceSeq: number;
    sourceTurn: number;
    standingInstructions: string;
    snapshot: string;
}
export interface ReviewRecord {
    operationId: string;
    sourceSeq: number;
    sourceTurn: number;
    sourceSha256: string;
    state: 'reviewing' | 'completed' | 'clean' | 'stalled' | 'stalemate';
    nativeSessionId?: string;
    findings?: ReviewFinding[];
    error?: string;
}
interface Owner {
    current(context: HarnessResearchContextV1): boolean;
    run(input: ReviewInput): Promise<{
        text: string;
        nativeSessionId: string;
    }>;
    deliver(value: ReviewRecord): Promise<void>;
    persist?(value: ReviewRecord): Promise<void>;
}
export interface ReviewObservation {
    seq: number;
    turn: number;
    kind: 'boundary' | 'tool';
    toolCount?: number;
    userTurn: boolean;
    child?: boolean;
    snapshot: string;
}
/** One observed native event has one review identity; a transport/model failure remains stalled. */
export declare class NativeResearchReview {
    private readonly owner;
    private readonly context;
    private readonly instructions;
    private readonly settings;
    private readonly ledger;
    private readonly pending;
    private previousFindings;
    private repeats;
    constructor(owner: Owner, context: HarnessResearchContextV1, value: unknown, instructions: string);
    records(): ReviewRecord[];
    private current;
    observe(event: ReviewObservation): Promise<void>;
    private run;
}
export {};
//# sourceMappingURL=research-review.d.ts.map