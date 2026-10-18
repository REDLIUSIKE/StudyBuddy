import type { StudyBuddyFetch } from './services.ts';
export type GrowthSaveStatus = 'saved' | 'cancelled' | 'failed';
/** Custom navigation is a narrow action, never a caller-controlled download URL or filename. */
export declare function parseGrowthSaveUrl(value: string): string | null;
/** The authoritative backend already validates access and the requested activity snapshot. */
export declare function downloadGrowthPng(version: string, accessToken: string, fetcher: StudyBuddyFetch): Promise<Buffer>;
/** Stage and fsync first; synchronous no-clobber commit cannot interleave an account replacement. */
export declare function persistGrowthPng(target: string, bytes: Buffer, stillOwner: () => boolean): Promise<void>;
//# sourceMappingURL=growth-image.d.ts.map