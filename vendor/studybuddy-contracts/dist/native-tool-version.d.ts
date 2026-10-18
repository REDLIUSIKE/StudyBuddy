/** Syntax only. Eligibility remains the exact manually reviewed adapter rule. */
export declare function parseExactNativeToolVersion(value: unknown): Readonly<{
    version: string;
    prerelease: boolean;
}>;
export declare function compareExactNativeToolVersions(a: string, b: string): number;
