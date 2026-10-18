/**
 * Reject local, reserved and transition addresses at the actual socket lookup.
 * @param address - DNS-resolved numeric address, never an arbitrary hostname.
 * @returns Whether the fixed public-source host may use this address.
 */
export declare function isPublicSkillSourceAddress(address: string): boolean;
/**
 * Fetch a bounded anonymous response; redirects remain the source owner's decision.
 * @param url - Fixed skills.sh or GitHub API HTTPS location.
 * @param signal - Acquisition deadline and caller cancellation.
 * @param maxBytes - Maximum response bytes, including JSON wrappers.
 * @returns Public response without inherited credentials, proxies or cookies.
 */
export declare function requestSkillSafetyPublic(url: URL, signal: AbortSignal, maxBytes: number): Promise<Response>;
//# sourceMappingURL=skill-safety-public-request.d.ts.map