import { brandString } from '@deepseek-ai/dsh-brand';
import { parseNativeBuiltinHostContextV1, parseToolSearchRequestV1 } from '@studybuddy/contracts';
/** The only Main/Host parser; public renderer transports cannot invoke it. */
export function parseSearchInvocation(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw Error('STUDYBUDDY_SEARCH_WIRE_INVALID');
    const row = value;
    if (Object.keys(row).sort().join(',') !== 'context,request,rpcId' || typeof row.rpcId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.rpcId))
        throw Error('STUDYBUDDY_SEARCH_WIRE_INVALID');
    return { rpcId: brandString(row.rpcId), context: parseNativeBuiltinHostContextV1(row.context), request: parseToolSearchRequestV1(row.request) };
}
//# sourceMappingURL=wire.js.map