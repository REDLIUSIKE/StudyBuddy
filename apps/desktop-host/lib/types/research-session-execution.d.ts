import type { Context } from '@deepseek-ai/cordis';
import type { HarnessResearchContextV1 } from '@studybuddy/contracts';
import type { NativeResearchExecution } from './research-host.ts';
type HelperKind = 'methods-draft' | 'next-experiments' | 'latex-assist';
export interface ResearchProjectBinding extends HarnessResearchContextV1 {
    readonly authorizedRoots: readonly string[];
}
export interface NativeResearchSessionOptions {
    /** Main-owned admission, including the exact account generation and public lease. */
    readonly binding: (context: HarnessResearchContextV1) => ResearchProjectBinding | undefined;
    /** Reviewed helper ceilings; deployment configuration, not a model catalog. */
    readonly helperMaxTokens: Readonly<Record<HelperKind, number>>;
}
export declare function createNativeResearchExecution(ctx: Context, options: NativeResearchSessionOptions): NativeResearchExecution;
export {};
//# sourceMappingURL=research-session-execution.d.ts.map