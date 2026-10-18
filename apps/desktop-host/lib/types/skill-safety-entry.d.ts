/** Managed project/native Session creation. Entry never sends a message or prepares resources. */
import type { Context } from '@deepseek-ai/cordis';
import type { SkillSafetySessionRef } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import type { OwnedScope } from '@studybuddy/contracts';
/** Only existing native owners allocate data; retries use deterministic identities. */
export declare class SkillSafetyEntry {
    private readonly ctx;
    private readonly scope;
    private readonly pending;
    constructor(ctx: Context, scope: () => OwnedScope | undefined);
    /** Create/recover exactly one entry, then attach it to the retained feature project.
     * @param requestId - Stable accepted Labs entry id.
     * @returns The actual native identities, with no inference or scanner download. */
    beginSkillSafetySession(requestId: string): Promise<SkillSafetySessionRef>;
    private create;
}
//# sourceMappingURL=skill-safety-entry.d.ts.map