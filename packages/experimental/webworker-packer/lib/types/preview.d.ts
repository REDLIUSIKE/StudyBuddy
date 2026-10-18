/** Node-side Session preparation for browser Preview data overlays. */
import { type ImageTree, type PackOverlayResult } from './pack.ts';
/**
 * Pack Preview data with strictly validated current Session successors prepared in Node.
 * Committed source bytes remain in the overlay; only the newest canonical raw generation
 * of each Session is restored. Future, malformed, and unsupported selected data refuse the pack.
 * @param trees - Ordered source trees under the Preview's home and workspace mounts.
 * @returns Deterministic overlay containing unchanged inputs and final current successors.
 */
export declare function packPreviewFixture(trees: readonly ImageTree[]): PackOverlayResult;
//# sourceMappingURL=preview.d.ts.map