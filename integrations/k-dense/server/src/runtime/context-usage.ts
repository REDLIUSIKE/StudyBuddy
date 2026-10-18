/** Exact Pi 1.0.0 usage projection, retained for legacy display only. */
import type { Usage } from '@earendil-works/pi-ai';
export function calculateContextTokens(usage: Usage): number {
  return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}
