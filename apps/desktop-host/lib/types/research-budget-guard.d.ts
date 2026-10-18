/** Private native model admission hook. A project cap never mutates the gateway wallet. */
import type { Context } from '@deepseek-ai/cordis';
export interface ResearchBudgetAdmission {
    sessionId: string;
    requestId: string;
    modelId: string;
    fundingSource: 'platform' | 'user_api';
}
export declare function installResearchBudgetGuard(ctx: Context, guard: (request: ResearchBudgetAdmission) => Promise<void>): () => void;
export declare function assertResearchModelBudget(ctx: Context, request: ResearchBudgetAdmission): Promise<void>;
//# sourceMappingURL=research-budget-guard.d.ts.map