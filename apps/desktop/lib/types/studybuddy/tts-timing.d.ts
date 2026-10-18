/** Normalized display timing from MiniMax's documented millisecond word fields; never billing usage. */
import { z } from 'zod';
export declare const TtsTimingSchema: z.ZodObject<{
    durationMs: z.ZodNumber;
    words: z.ZodArray<z.ZodObject<{
        token: z.ZodString;
        startMs: z.ZodNumber;
        endMs: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type TtsTiming = z.infer<typeof TtsTimingSchema>;
/** Accept only a subtitle-segment array with actual word timing, preserving source millisecond precision.
 * @param value - Downloaded subtitle JSON; no URL or credentials are retained.
 * @param durationMs - Supplier audio_length in milliseconds, used only to bound display timing.
 * @returns Normalized display words, without prices, usage or inferred timestamps.
 */
export declare function parseMiniMaxTtsTiming(value: unknown, durationMs: number): TtsTiming;
//# sourceMappingURL=tts-timing.d.ts.map