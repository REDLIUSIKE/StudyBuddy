import { Context } from '@deepseek-ai/cordis';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';
/** Main supplies only verified compiled resources; secrets arrive through private stdin. */
export declare const Config: z.ZodObject<{
    domainEntry: z.ZodString;
    staticDirectory: z.ZodString;
}, z.core.$strict>;
export type Config = z.infer<typeof Config>;
export declare const inject: string[];
/** Mount the profile's service/provider/consumer with owned private transport.
 * @param ctx - Cordis profile context.
 * @param config - Verified module/static paths.
 * @param input - Main's private commands and native results.
 * @param output - Correlated replies, native requests and readiness.
 * @returns Initialization; disposal awaits domain and transport quiescence. */
export declare function mountVideoPlugin(ctx: Context, config: Config, input: Readable, output: Writable): Promise<void>;
/** Profile entry; the ordinary dsh launcher owns these stdio streams. */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=video-editing-plugin.d.ts.map