/**
 * Name one temporary review within its browser lifetime and Session.
 * @param sessionId - Session displaying the review.
 * @param requestKey - Browser-unique pending request identity.
 * @returns the address used to focus or reopen its preview.
 */
export function reviewPreviewAddress(sessionId, requestKey) {
    return `dsh-resource://plan-review/${encodeURIComponent(sessionId)}/${encodeURIComponent(requestKey)}`;
}
/**
 * Recognize temporary plan navigation without interpreting it as logged history.
 * @param address - Saved or caller-supplied navigation address.
 * @returns whether the address identifies a temporary review preview.
 */
export function isReviewPreviewAddress(address) {
    return /^dsh-resource:\/\/plan-review\/[^/?#]+\/[^/?#]+$/.test(address);
}
//# sourceMappingURL=review-preview.js.map