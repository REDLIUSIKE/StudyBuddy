export interface VerifiedNativeRuntime {
    directory: string;
    companion: string;
    sourceHead: string;
    files: Readonly<Record<string, string>>;
    module: {
        moduleId: string;
        entry: 'index.html';
        files: Readonly<Record<string, string>>;
    };
}
/** Both companion launch and tool-page admission consume this exact manifest. */
export declare function verifyTrustedNativeRuntime(directory: string): Promise<VerifiedNativeRuntime>;
//# sourceMappingURL=trusted-native-runtime.d.ts.map