import type { NativeBuiltinPrivateOperationMap } from '@studybuddy/contracts';
/** Main-only operation allowlist, separate from every renderer method. */
export declare const BUILTIN_PRIVATE_METHODS: readonly ["prepareBuiltinSource", "resumeBuiltinSource", "getBuiltinSourceMaterial", "acknowledgeBuiltinCatalog", "listBuiltinReadiness", "revokeBuiltinSource", "prepareBuiltinKeyRequest", "acknowledgeBuiltinLocalValidation", "getNativeBuiltinCatalog", "getBuiltinSourceDetail", "refreshBuiltinBalance"];
/** Parse only the DTO selected by the privileged method.
 * @param method - Closed Main-owned private capability.
 * @param value - Untrusted native process response.
 * @returns The matching parsed result, containing private material only for private methods. */
export declare function parseBuiltinResult<K extends keyof NativeBuiltinPrivateOperationMap>(method: K, value: unknown): NativeBuiltinPrivateOperationMap[K]['result'];
//# sourceMappingURL=builtin-contracts.d.ts.map