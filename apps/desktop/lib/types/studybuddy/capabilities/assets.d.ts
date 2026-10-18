import type { HarnessCapabilityArtifactV1 as Artifact, HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target } from '@studybuddy/contracts';
/** Reads admitted private paths only; rechecks junctions and file identity after the read. */
export declare function readCapabilityFile(path: string, artifact: Artifact): Promise<Buffer>;
export declare function createCapabilityFileArtifact(caller: Caller, target: Target, file: string, mime: string, roots: readonly string[], schemaRef?: string): Promise<Artifact>;
interface Source {
    caller: Caller;
    artifact: Artifact;
    read(signal: AbortSignal): Promise<Buffer>;
    readers: Set<string>;
}
interface Options {
    assert(caller: Caller): void;
    put(caller: Caller, target: Target, source: Artifact, bytes: Buffer, signal: AbortSignal): Promise<Artifact>;
}
/** Main keeps source authority and bytes private. Domain import coordinators own names and writes. */
export declare class CapabilityAssetTransfer {
    private readonly options;
    private readonly sources;
    private readonly imports;
    constructor(options: Options);
    register(caller: Caller, value: Artifact, read: Source['read']): void;
    /** Called by trusted project/source admission, never exposed as a model tool. */
    share(sourceCaller: Caller, artifactRef: string, recipient: Caller): void;
    import(caller: Caller, sourceRef: string, target: Target, signal?: AbortSignal): Promise<Artifact>;
    read(caller: Caller, ref: string, signal: AbortSignal): Promise<{
        artifact: Artifact;
        bytes: Buffer<ArrayBufferLike>;
    }>;
    revoke(): void;
}
export {};
//# sourceMappingURL=assets.d.ts.map