import type { ResearchLaunchResources, ResearchResourcePin, ResearchSharedRuntimeIdentity, ResearchSharedRuntimeRoots } from './research-types.ts';
/** Select separately prepared development and installed resource identities.
 * @param options - Main-owned application locations and reviewed pins.
 * @returns The resource directory and its matching pin, including an unprepared null pin. */
export declare function resolveResearchResourceLocation(options: {
    packaged: boolean;
    appDirectory: string;
    resourcesDirectory: string;
    productionPin: ResearchResourcePin | null;
    developmentPin: ResearchResourcePin | null;
}): {
    directory: string;
    pin: ResearchResourcePin | null;
};
/** Validate the shared installation without placing another executable in research resources.
 * @param expected - Shared runtime bytes frozen by the research build.
 * @param roots - Main-selected physical directories, readable by plain Node.
 * @returns Exact Node, dsh launcher and Host plugin paths. */
export declare function verifyResearchSharedRuntime(expected: ResearchSharedRuntimeIdentity, roots: ResearchSharedRuntimeRoots): Promise<{
    node: string;
    python: string;
    entry: string;
    plugin: string;
}>;
/** Resolve the pinned domain and shared installation.
 * @param directory - Main-selected research resource directory.
 * @param roots - Same shared installation as Desktop.
 * @param pin - Reviewed identity selected for this launch mode; defaults to installed resources.
 * @returns Verified launch paths. */
export declare function loadResearchResources(directory: string, roots: ResearchSharedRuntimeRoots, pin?: ResearchResourcePin | null): Promise<ResearchLaunchResources>;
//# sourceMappingURL=research-resource-identity.d.ts.map