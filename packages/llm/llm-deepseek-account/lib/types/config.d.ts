/** Account providers expose protocol settings without an API-key reference. */
import { Config as ProtocolConfig } from '@deepseek-ai/dsh-llm-deepseek';
/** Account route configuration; authentication comes exclusively from the account service. */
export type Config = ProtocolConfig;
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
    baseURL: import("@deepseek-ai/schemastery").default<string, string, "volatile">;
    thinking: import("@deepseek-ai/schemastery").default<"enabled" | "disabled", "enabled" | "disabled", "volatile">;
    reasoningEffort: import("@deepseek-ai/schemastery").default<"off" | "low" | "high" | "max", "off" | "low" | "high" | "max", "volatile">;
    maxTokens: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    defaultContextWindow: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    models: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/dsh-llm-deepseek").DeepSeekCatalogModel[]>, NoInfer<import("@deepseek-ai/dsh-llm-deepseek").DeepSeekCatalogModel[]>, "volatile-defined">;
    streamIdleTimeoutMs: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    maxRequestFilesBytes: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    maxInlineRequestImageBytes: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    maxImagesPerRequest: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    imageOffloadByteQuantum: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    inlineImageOffloadByteQuantum: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    imageOffloadCountQuantum: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    filesApiTimeoutMs: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fileExpiresAfterSeconds: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fileRefreshMarginSeconds: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fileQuotaCleanupBatch: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    retryPolicy: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    baseURL: import("@deepseek-ai/schemastery").default<string, string, "volatile">;
    thinking: import("@deepseek-ai/schemastery").default<"enabled" | "disabled", "enabled" | "disabled", "volatile">;
    reasoningEffort: import("@deepseek-ai/schemastery").default<"off" | "low" | "high" | "max", "off" | "low" | "high" | "max", "volatile">;
    maxTokens: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    defaultContextWindow: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    models: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/dsh-llm-deepseek").DeepSeekCatalogModel[]>, NoInfer<import("@deepseek-ai/dsh-llm-deepseek").DeepSeekCatalogModel[]>, "volatile-defined">;
    streamIdleTimeoutMs: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    maxRequestFilesBytes: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    maxInlineRequestImageBytes: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    maxImagesPerRequest: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    imageOffloadByteQuantum: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    inlineImageOffloadByteQuantum: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    imageOffloadCountQuantum: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    filesApiTimeoutMs: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fileExpiresAfterSeconds: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fileRefreshMarginSeconds: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fileQuotaCleanupBatch: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    retryPolicy: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, "volatile">;
}>>, "plain">;
//# sourceMappingURL=config.d.ts.map