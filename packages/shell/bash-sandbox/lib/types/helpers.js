import { matchesSignature } from '@deepseek-ai/dsh-sandbox';
export { isRunnerSpawnFailure, classifyRunnerFailure, matchesSignature } from '@deepseek-ai/dsh-sandbox';
/**
 * Classify a failed run against the selected backend's denial dialect.
 * @param result - settled foreground run.
 * @param signatures - case-insensitive denial substrings from the active wrap.
 * @returns whether the failed run matches that denial dialect.
 */
export function classifyDenial(result, signatures) {
    return matchesSignature(result.exitCode, result.stderr.text, signatures);
}
//# sourceMappingURL=helpers.js.map