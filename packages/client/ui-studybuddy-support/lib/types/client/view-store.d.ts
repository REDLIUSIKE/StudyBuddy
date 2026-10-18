import type { SupportLogRange } from '@studybuddy/contracts';
interface Draft {
    mode: 'logs' | 'issue';
    range: SupportLogRange;
    title: string;
    description: string;
}
/** Declare support form fields and their complete mutation API. @returns One registration store definition. */
export declare function createSupportViewStore(): import("@deepseek-ai/dsh-client-store").EngineStoreHandle<Draft, {
    setMode: (d: Draft, mode: Draft["mode"]) => void;
    setRange: (d: Draft, range: SupportLogRange) => void;
    setTitle: (d: Draft, title: string) => void;
    setDescription: (d: Draft, description: string) => void;
    reset: (d: Draft) => void;
}>;
export {};
//# sourceMappingURL=view-store.d.ts.map