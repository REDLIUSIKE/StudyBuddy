import type { Branded } from '@deepseek-ai/dsh-brand';
import type { NativeBuiltinHostContextV1, ToolSearchRequestV1 } from '@studybuddy/contracts';
export type SearchRpcId = Branded<'StudyBuddySearchRpcId'>;
export interface SearchInvocation {
    readonly rpcId: SearchRpcId;
    readonly context: NativeBuiltinHostContextV1;
    readonly request: ToolSearchRequestV1;
}
/** The only Main/Host parser; public renderer transports cannot invoke it. */
export declare function parseSearchInvocation(value: unknown): SearchInvocation;
//# sourceMappingURL=wire.d.ts.map