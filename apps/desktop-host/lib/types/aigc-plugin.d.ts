/** Account domain provider and lifecycle consumer loaded only by a sealed dsh profile. */
import { Context } from '@deepseek-ai/cordis';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';
export declare const Config: z.ZodObject<{
    domainEntry: z.ZodString;
    resourceDirectory: z.ZodString;
    staticDirectory: z.ZodString;
}, z.core.$strict>;
export type Config = z.infer<typeof Config>;
export declare const inject: string[];
export declare function mountAigcPlugin(ctx: Context, config: Config, input: Readable, output: Writable): Promise<void>;
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=aigc-plugin.d.ts.map