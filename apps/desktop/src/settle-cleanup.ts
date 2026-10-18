/** Wait for every owned cleanup to settle before propagating a failure. */
export async function settleCleanup(operations: readonly (PromiseLike<unknown> | void)[]): Promise<void> {
  const results = await Promise.allSettled(operations)
  const failure = results.find(result => result.status === 'rejected')
  if (failure !== undefined) throw failure.reason
}
