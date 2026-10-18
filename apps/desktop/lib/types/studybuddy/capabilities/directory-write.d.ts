/** Bind the write to directory objects, rather than a path checked before an asynchronous write. */
export declare function withCapabilityOutputDirectory<T>(directory: string, action: (protectedDirectory: string) => Promise<T>, nativeModuleAnchor?: string): Promise<T>;
//# sourceMappingURL=directory-write.d.ts.map