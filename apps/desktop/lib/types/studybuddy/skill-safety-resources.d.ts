import { z } from 'zod';
declare const file: z.ZodObject<{
    path: z.ZodString;
    sha256: z.ZodString;
    size: z.ZodNumber;
}, z.core.$strict>;
/** Fixed upstream identity and complete regular-file witnesses; shared Python is not copied twice. */
export declare const scannerResourceSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    target: z.ZodLiteral<"win32-x64">;
    pythonVersion: z.ZodLiteral<"3.12.14">;
    upstream: z.ZodObject<{
        repository: z.ZodLiteral<"https://github.com/cisco-ai-defense/skill-scanner">;
        version: z.ZodLiteral<"2.2.2">;
        commit: z.ZodLiteral<"ef5cfee8d15fe207e09d808ccb5be4b9ae6d321a">;
    }, z.core.$strict>;
    lockDigest: z.ZodString;
    configDigest: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        sha256: z.ZodString;
        size: z.ZodNumber;
    }, z.core.$strict>>;
    runtimeFiles: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        sha256: z.ZodString;
        size: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type SkillScannerResourceManifest = z.infer<typeof scannerResourceSchema>;
/**
 * Verify complete scanner resources and the selected shared Python bytes before process creation.
 * @param directory - Fixed cache/build directory selected by its owner, never a tool argument.
 * @param runtimeDirectory - Independently selected existing primary runtime, never downloaded here.
 * @param expectedManifestSha256 - Digest from the trusted client descriptor or build generator.
 * @returns Exact resource identity; unknown files and filesystem links are rejected.
 * @throws For untrusted manifest bytes, missing resources, links or changed interpreter bytes.
 */
export declare function verifySkillScannerResources(directory: string, runtimeDirectory: string, expectedManifestSha256: string): Promise<SkillScannerResourceManifest>;
/** Reject Windows aliases, links' escape paths and alternate streams. @param path - Archive/manifest relative filename. */
export declare function validateSkillScannerRelativePath(path: string): void;
/** Check ancestors without following links. @param path - Owner-selected path. @param allowMissing - Permit not-yet-created descendants. */
export declare function verifySkillScannerDirectoryPath(path: string, allowMissing?: boolean): Promise<void>;
/** Collect regular-file witnesses for build generation without following links. */
export declare function listScannerResourceFiles(directory: string, exclude?: (path: string) => boolean): Promise<z.infer<typeof file>[]>;
export {};
//# sourceMappingURL=skill-safety-resources.d.ts.map