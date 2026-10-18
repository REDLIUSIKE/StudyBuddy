/** Provider factory (unavailable). */
export declare const createProvider: (...args: never[]) => never;
/** Model-list factory (unavailable). */
export declare const createModels: (...args: never[]) => never;
/** Thinking-level catalog (unavailable). */
export declare const getSupportedThinkingLevels: (...args: never[]) => never;
/** Context-overflow predicate (unavailable). */
export declare const isContextOverflow: (...args: never[]) => never;
/** Collection of every builtin provider (unavailable). */
export declare const builtinModels: (...args: never[]) => never;
/**
 * Installed catalog providers, read while `llm-pi-ai` activates. `llm-pi-ai`
 * registers the whole catalog as configurable the moment it mounts and rejects
 * an empty registration, so these carry pi-ai's ids instead of being an empty
 * list. Each has the api-key auth marker the adapter filters on, and no
 * models, so every request path lands on a loud symbol above.
 * @returns one entry per builtin provider.
 */
export declare function builtinProviders(): unknown[];
/**
 * Models of one installed catalog provider.
 * @returns no models.
 */
export declare function getBuiltinModels(): unknown[];
/**
 * Models of every type of one installed catalog provider.
 * @returns no models.
 */
export declare function getAllBuiltinModels(): unknown[];
/** Anthropic messages API binding (unavailable). */
export declare const anthropicMessagesApi: (...args: never[]) => never;
/** OpenAI completions API binding (unavailable). */
export declare const openAICompletionsApi: (...args: never[]) => never;
/** OpenAI responses API binding (unavailable). */
export declare const openAIResponsesApi: (...args: never[]) => never;
/** CommonJS interop marker: the worker loader hands `default` to default imports. */
export declare const __esModule = true;
/** CommonJS default export: the members `require()` hands a caller of this module. */
declare const _default: {
    createProvider: (...args: never[]) => never;
    createModels: (...args: never[]) => never;
    getSupportedThinkingLevels: (...args: never[]) => never;
    isContextOverflow: (...args: never[]) => never;
    builtinModels: (...args: never[]) => never;
    builtinProviders: typeof builtinProviders;
    getBuiltinModels: typeof getBuiltinModels;
    getAllBuiltinModels: typeof getAllBuiltinModels;
    anthropicMessagesApi: (...args: never[]) => never;
    openAICompletionsApi: (...args: never[]) => never;
    openAIResponsesApi: (...args: never[]) => never;
};
export default _default;
//# sourceMappingURL=pi-ai.d.ts.map