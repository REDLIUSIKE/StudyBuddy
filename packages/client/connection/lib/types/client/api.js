/** Browser-safe Connection protocol and shared application value exports. */
export { RpcId, transportError } from "../rpc.js";
/**
 * Return the business result carried by an RPC response.
 * @param response - RPC response to unwrap.
 * @returns the response's business result.
 */
export function resultOf(response) {
    return response.result;
}
//# sourceMappingURL=api.js.map