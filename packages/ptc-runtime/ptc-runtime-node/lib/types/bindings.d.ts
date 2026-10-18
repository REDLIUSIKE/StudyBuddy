import type { PtcBindingNamespace, PtcRunRequest } from '@deepseek-ai/dsh-ptc-runtime';
/**
 * Reject unusable namespaces before starting a process.
 * @param request - Host-owned binding declarations.
 * @returns Namespaces keyed by their declared global.
 */
export declare function validateBindings(request: PtcRunRequest): Map<string, PtcBindingNamespace>;
//# sourceMappingURL=bindings.d.ts.map