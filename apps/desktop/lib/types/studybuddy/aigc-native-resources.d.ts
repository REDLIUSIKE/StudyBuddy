import { z } from 'zod';
import type { ResearchSharedIntegrity } from './research-shared-integrity-types.ts';
import type { AigcLaunchResources } from './aigc-types.ts';
export interface AigcNativePin {
    manifestSha256: string;
    sourceCommit: string;
    sourceDigest: string;
    lockDigest: string;
}
/** Select the prepared resource and matching identity for the current application mode.
 * @param options - Main-owned locations and separately reviewed resource pins.
 * @returns The selected directory and pin, including an unprepared null identity. */
export declare function resolveAigcResourceLocation(options: {
    packaged: boolean;
    appDirectory: string;
    resourcesDirectory: string;
    productionPin: AigcNativePin | null;
    developmentPin: AigcNativePin | null;
}): {
    directory: string;
    pin: AigcNativePin | null;
};
export declare const AIGC_MEDIA_BYTES: readonly [{
    readonly path: "bin/ffmpeg.exe";
    readonly size: 82797568;
    readonly sha256: "04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00";
}, {
    readonly path: "bin/ffprobe.exe";
    readonly size: 82668032;
    readonly sha256: "3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4";
}];
declare const manifestSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<2>;
    kind: z.ZodLiteral<"studybuddy-aigc-plugin">;
    profile: z.ZodLiteral<"studybuddy-aigc">;
    platform: z.ZodString;
    arch: z.ZodString;
    entry: z.ZodLiteral<"server/domain.js">;
    staticEntry: z.ZodLiteral<"web/index.html">;
    upstream: z.ZodObject<{
        repository: z.ZodLiteral<"https://github.com/HBAI-Ltd/Toonflow-app.git">;
        commit: z.ZodString;
    }, z.core.$strict>;
    sourceCommit: z.ZodString;
    sourceDigest: z.ZodString;
    lockDigest: z.ZodString;
    sharedRuntime: z.ZodObject<{
        nodeVersion: z.ZodLiteral<"24.21.0">;
        payloadDigest: z.ZodString;
        nodeSha256: z.ZodString;
        dshVersion: z.ZodString;
        dshEntrySha256: z.ZodString;
        hostPluginSha256: z.ZodString;
        integrity: z.ZodUnknown;
    }, z.core.$strict>;
    build: z.ZodObject<{
        assemblerSha256: z.ZodString;
        sourceBuildSha256: z.ZodString;
        domainClosureSha256: z.ZodString;
    }, z.core.$strict>;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        size: z.ZodNumber;
        sha256: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AigcNativeManifest = Omit<z.infer<typeof manifestSchema>, 'sharedRuntime'> & {
    sharedRuntime: Omit<z.infer<typeof manifestSchema>['sharedRuntime'], 'integrity'> & {
        integrity: ResearchSharedIntegrity;
    };
};
export declare function parseAigcNativeManifest(value: unknown, pin: AigcNativePin): AigcNativeManifest;
export declare function verifyAigcNativeFiles(directory: string, pin: AigcNativePin): Promise<AigcNativeManifest>;
export declare function loadAigcNativeResources(directory: string, pin: AigcNativePin, roots: {
    primaryRuntimeDirectory: string;
    dshDirectory: string;
    workspaceDirectory?: string;
}): Promise<AigcLaunchResources>;
export {};
//# sourceMappingURL=aigc-native-resources.d.ts.map