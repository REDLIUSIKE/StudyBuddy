/** Wait for every owned cleanup to settle before propagating a failure. */
export async function settleCleanup(operations) {
    const results = await Promise.allSettled(operations);
    const failure = results.find(result => result.status === 'rejected');
    if (failure !== undefined)
        throw failure.reason;
}
//# sourceMappingURL=settle-cleanup.js.map