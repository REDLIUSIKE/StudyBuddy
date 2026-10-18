/** Read a supplier subtitle artifact without forwarding any API credential or following redirects. */
import { HttpFetchProvider } from '@deepseek-ai/dsh-web-fetch-http';
/** Anonymous JSON download; the native web reader retains public-network/DNS/proxy policy.
 * @param value - Temporary subtitle URL from the authenticated supplier result.
 * @param signal - Current native request cancellation.
 * @param provider - Existing anonymous native fetch implementation; replaceable in keyless tests.
 * @returns Bounded decoded JSON only, without URL or headers.
 */
export declare function downloadMiniMaxTtsSubtitles(value: string, signal: AbortSignal, provider?: Pick<HttpFetchProvider, 'fetch'>): Promise<unknown>;
//# sourceMappingURL=tts-subtitle-download.d.ts.map