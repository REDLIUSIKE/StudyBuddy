import { parseChangesReviewAddress } from "../changes.js";
/** The tab kind this package owns. */
export const CHANGES_REVIEW_KIND = 'changes-review';
/** This implementation's identity in the tab system, and the key its body registers under. */
export const CHANGES_REVIEW_ID = '@deepseek-ai/dsh-client-ui-deliverables';
/**
 * The review type's registry definition.
 * @param t - namespace-bound translate, read fresh on every title call.
 * @returns the definition to register.
 */
export function changesReviewDefinition(t) {
    return {
        id: CHANGES_REVIEW_ID,
        kind: CHANGES_REVIEW_KIND,
        patterns: ['dsh-resource://changes-review/**'],
        priority: 'builtin',
        canOpen: address => parseChangesReviewAddress(address) !== undefined,
        title: (address) => {
            const turn = parseChangesReviewAddress(address)?.turn;
            return turn === undefined ? address : t('review.title', { turn: String(turn) });
        },
    };
}
//# sourceMappingURL=review-definition.js.map