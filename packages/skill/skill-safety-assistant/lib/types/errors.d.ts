/** Structured feature failures; private exception causes are not presentation values. */
export type SkillSafetyErrorCode = 'SKILL_SAFETY_UNAVAILABLE' | 'SKILL_SAFETY_CANCELLED' | 'SKILL_SAFETY_STALE_SCOPE' | 'SKILL_SAFETY_REQUEST_CONFLICT' | 'SKILL_SAFETY_INVALID_STATE' | 'SKILL_SAFETY_JOURNAL_INVALID' | 'SKILL_SAFETY_JOB_NOT_FOUND' | 'SKILL_SAFETY_PROVIDER_EXISTS' | 'SKILL_SAFETY_JOURNAL_BUSY' | 'SKILL_SAFETY_JOURNAL_LIMIT' | 'SKILL_SAFETY_OUTCOME_UNKNOWN' | 'SKILL_SAFETY_SOURCE_CHANGED' | 'SKILL_SAFETY_SOURCE_UNSAFE' | 'SKILL_SAFETY_SOURCE_LIMIT' | 'SKILL_SAFETY_SOURCE_INVALID' | 'SKILL_SAFETY_CANDIDATE_NOT_FOUND' | 'SKILL_SAFETY_COMMAND_INVALID' | 'SKILL_SAFETY_INSTALL_NOT_ALLOWED' | 'SKILL_SAFETY_CONFIRMATION_REQUIRED' | 'SKILL_SAFETY_MODEL_CHANGED' | 'SKILL_SAFETY_MODEL_UNSUPPORTED' | 'SKILL_SAFETY_UPSTREAM_REJECTED' | 'SKILL_SAFETY_RESPONSE_INVALID' | 'SKILL_SAFETY_RESOURCE_INVALID' | 'SKILL_SAFETY_RESOURCE_DISK_SPACE' | 'SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED';
/** Validate a machine code received over the private channel; never inspect exception messages. */
export declare function parseSkillSafetyErrorCode(value: unknown): SkillSafetyErrorCode;
/** Failure code is stable; receiving UI owns localized copy and the safe next action. */
export declare class SkillSafetyError extends Error {
    /** Machine-readable failure identity. */
    readonly code: SkillSafetyErrorCode;
    constructor(code: SkillSafetyErrorCode, options?: ErrorOptions);
}
//# sourceMappingURL=errors.d.ts.map