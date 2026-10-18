import { z } from 'zod';
import type { ImageAttachmentRef, SaveImageAttachment } from '@deepseek-ai/dsh-attachment';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
export declare const AigcToolRecord: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    parameters: z.ZodRecord<z.ZodString, z.ZodJSONSchema>;
    promptGuidelines: z.ZodArray<z.ZodString>;
    executionMode: z.ZodEnum<{
        parallel: "parallel";
        sequential: "sequential";
    }>;
    schemaSha256: z.ZodString;
    plugin: z.ZodObject<{
        name: z.ZodString;
        revision: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>;
export type AigcToolRecord = z.infer<typeof AigcToolRecord>;
type StoreImages = (input: readonly SaveImageAttachment[]) => Promise<readonly ImageAttachmentRef[]>;
/** Normalize bytes once before the native tool result is recorded. Replays use only immutable references. */
export declare function normalizeAigcResult(value: unknown, storeImages?: StoreImages): Promise<JsonValue>;
export declare function renderAigcResult(value: JsonValue): ContentBlock[];
export declare function adaptAigcTool(value: unknown, invoke: (args: unknown, exec: ToolRunContext, tool: AigcToolRecord) => Promise<unknown>, storeImages?: StoreImages): ToolDefinition;
export {};
//# sourceMappingURL=aigc-tool-adapter.d.ts.map