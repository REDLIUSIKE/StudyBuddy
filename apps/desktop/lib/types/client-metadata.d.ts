/** Desktop client identity for one Platform account call. */
import type { AccountClientMetadata } from '@deepseek-ai/dsh-deepseek-account/types';
/**
 * Read the client build version inlined by the Desktop build.
 * @returns the version embedded in this application build.
 * @throws Error when the build carries no client version, instead of reporting a guessed one.
 */
export declare function desktopClientVersion(): string;
/**
 * Sample the Desktop client identity for one Platform request.
 * @param locale - current resolved Desktop language.
 * @returns this call's build version, the raw active language, and the UTC offset in whole seconds east.
 */
export declare function desktopClientMetadata(locale: string): AccountClientMetadata;
//# sourceMappingURL=client-metadata.d.ts.map