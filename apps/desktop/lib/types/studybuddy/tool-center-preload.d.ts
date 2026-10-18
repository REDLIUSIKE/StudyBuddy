import type { ToolsPageHost } from '@studybuddy/contracts';
interface ToolTransport {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (value: unknown) => void): () => void;
}
/** @param transport Private preload transport. @returns Fixed methods and UI-safe state; the lease stays inside this closure. */
export declare function createToolPageApi(transport: ToolTransport): ToolsPageHost;
/** Install only on the exact registered document's main frame. */
export declare function exposeToolCenter(): void;
export {};
//# sourceMappingURL=tool-center-preload.d.ts.map