import type { CapabilityAdapter } from './types.ts';
/** Contributions are explicit module adapters; removal invalidates all consumers. */
export declare class CapabilityRegistry {
    private readonly entries;
    private readonly listeners;
    register(adapter: CapabilityAdapter): () => Promise<void>;
    get(id: string, revision?: string): CapabilityAdapter;
    ids(): readonly string[];
    onRemove(listener: (id: string) => void | Promise<void>): () => void;
}
//# sourceMappingURL=registry.d.ts.map