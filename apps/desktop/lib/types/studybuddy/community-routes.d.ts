/** Exact existing routes and ticket exchange; host_ui selects presentation only. */
import type { CommunityTarget } from './community-types.ts';
/** @param target Original business page. @param value Server-issued entry. @returns Validated fragment entry with Harness presentation. */
export declare function communityEntry(target: CommunityTarget, value: unknown): string;
/** A fresh profile ticket preserves the original campus setup and automatic return flow. */
export declare function communityCampusEntry(value: unknown): string;
/** @param target Owning page. @param value Navigation URL. @returns Whether navigation stays within its original business. */
export declare function communityNavigationAllowed(target: CommunityTarget, value: string): boolean;
/** @param value Original navigation intent. @returns The exact campus setup/return action, or null. */
export declare function communityProfileAction(value: string): 'open' | 'return' | null;
//# sourceMappingURL=community-routes.d.ts.map