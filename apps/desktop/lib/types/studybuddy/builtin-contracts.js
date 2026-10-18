/** Closed native/Main built-in result parsers; private operations never reach page IPC. */
import * as contracts from '@studybuddy/contracts';
/** Main-only operation allowlist, separate from every renderer method. */
export const BUILTIN_PRIVATE_METHODS = ['prepareBuiltinSource', 'resumeBuiltinSource', 'getBuiltinSourceMaterial',
    'acknowledgeBuiltinCatalog', 'listBuiltinReadiness', 'revokeBuiltinSource', 'prepareBuiltinKeyRequest',
    'acknowledgeBuiltinLocalValidation', 'getNativeBuiltinCatalog', 'getBuiltinSourceDetail',
    'refreshBuiltinBalance'];
/** Parse only the DTO selected by the privileged method.
 * @param method - Closed Main-owned private capability.
 * @param value - Untrusted native process response.
 * @returns The matching parsed result, containing private material only for private methods. */
export function parseBuiltinResult(method, value) {
    let result;
    switch (method) {
        case 'getNativeBuiltinCatalog':
            result = contracts.parseNativeBuiltinPublicCatalogV1(value);
            break;
        case 'getBuiltinSourceDetail':
            result = contracts.parseNativeBuiltinSourceDetailV1(value);
            break;
        case 'refreshBuiltinBalance':
            result = contracts.parseNativeBuiltinBalanceReceiptV1(value);
            break;
        case 'prepareBuiltinSource':
        case 'resumeBuiltinSource':
        case 'acknowledgeBuiltinCatalog':
        case 'acknowledgeBuiltinLocalValidation':
            result = contracts.parseNativeBuiltinReadinessV1(value);
            break;
        case 'getBuiltinSourceMaterial':
            result = contracts.parseNativeBuiltinPreparedSourceV1(value);
            break;
        case 'prepareBuiltinKeyRequest':
            result = contracts.parseNativeBuiltinFrozenRequestV1(value);
            break;
        case 'listBuiltinReadiness':
            if (!Array.isArray(value) || value.length > 256)
                throw new TypeError('BUILTIN_READINESS_INVALID');
            result = value.map(contracts.parseNativeBuiltinReadinessV1);
            break;
        case 'revokeBuiltinSource':
            if (value !== null && value !== undefined)
                throw new TypeError('BUILTIN_REVOKE_INVALID');
            result = undefined;
            break;
        default: throw new TypeError('NATIVE_OPERATION_DENIED');
    }
    return result;
}
//# sourceMappingURL=builtin-contracts.js.map