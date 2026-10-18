/** Replay-only foreign tool presentation; reading records never dispatches or reconstructs a tool. */
import type { Agent } from '@deepseek-ai/dsh-agent';
/** The original Vue cards consume text blocks, whose first line may be business JSON. */
export declare function aigcToolResultText(value: unknown): string;
export declare function nativeAigcRecords(agent: Agent): {
    id: string;
    name: string;
    args: unknown;
    status: string;
    result?: string;
    nativeSessionId: string;
}[];
//# sourceMappingURL=aigc-records.d.ts.map