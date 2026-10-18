import type { SkillSafetyActor, SkillSafetyCommand, SkillSafetyOperationRecord, SkillSafetyRequestId, SkillSafetyResult } from '@deepseek-ai/dsh-skill-safety-assistant/types';
/** Private directory, current scope admission and configurable record bounds. */
export interface SkillSafetyJournalOptions {
    root: string;
    isCurrentScope: (actor: SkillSafetyActor) => boolean;
    maxBytes?: number;
    maxRequests?: number;
}
/** Serializes durable reservations and actual outcomes, not conversation stages. */
export declare class SkillSafetyJournal {
    private readonly options;
    private readonly root;
    private readonly maxBytes;
    private readonly maxRequests;
    private tail;
    constructor(options: SkillSafetyJournalOptions);
    /**
     * Reserve an effect once or return its actual settled result.
     * @param actor - Current native account/session.
     * @param requestId - Stable caller identity.
     * @param operation - Exact closed operation.
     * @param argumentDigest - Digest derived from validated effective arguments.
     * @returns A new pending reservation or an immutable done result.
     * @throws {SkillSafetyError} for reused arguments, stale scope or uncertain effects.
     */
    reserve(actor: SkillSafetyActor, requestId: SkillSafetyRequestId, operation: SkillSafetyCommand['kind'], argumentDigest: string): Promise<SkillSafetyOperationRecord>;
    /**
     * Commit a real outcome; a settled result is immutable.
     * @param actor - Current native account/session.
     * @param requestId - Existing reservation.
     * @param result - Keyless actual result, decoded before durable publication.
     */
    settle(actor: SkillSafetyActor, requestId: SkillSafetyRequestId, result: SkillSafetyResult): Promise<void>;
    /**
     * Record an uncertain interrupted effect without granting a retry.
     * @param actor - Current native account/session.
     * @param requestId - Accepted reservation.
     */
    markUnknown(actor: SkillSafetyActor, requestId: SkillSafetyRequestId): Promise<void>;
    /**
     * Read without authorizing or replaying effects.
     * @param actor - Current native account/session.
     * @param requestId - Existing request identity.
     * @returns Validated record or undefined in this session's private document.
     */
    read(actor: SkillSafetyActor, requestId: SkillSafetyRequestId): Promise<SkillSafetyOperationRecord | undefined>;
    private existing;
    private assertScope;
    private assertGeneration;
    private pathFor;
    private ensureRoot;
    private load;
    private update;
    private publish;
}
//# sourceMappingURL=skill-safety-journal.d.ts.map