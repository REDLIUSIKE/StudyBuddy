import type { ResearchLaunchResources } from './research-types.ts';
/** Create or revalidate the immutable account/resource-specific research profile.
 * @param accountDirectory - Existing account research root, separate from its projects.
 * @param resources - Verified executable and domain paths supplied by Main.
 * @returns Dedicated Harness home for this exact resource digest. */
export declare function prepareResearchProfile(accountDirectory: string, resources: ResearchLaunchResources): Promise<string>;
//# sourceMappingURL=research-profile.d.ts.map