/** Verify the prepared source inventory against the identity compiled into this client.
 * @param directory - Canonical development or packaged AIGC resource directory.
 * @returns Private process launch paths after all byte checks pass. */
export declare function loadAigcResources(directory: string): Promise<{
    directory: string;
    bun: string;
    entry: string;
}>;
//# sourceMappingURL=aigc-resource-identity.d.ts.map