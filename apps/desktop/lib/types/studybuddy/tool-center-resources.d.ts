import type { VerifiedNativeRuntime } from './trusted-native-runtime.ts';
export type ToolModuleManifest = VerifiedNativeRuntime['module'];
export declare const TOOL_PAGE_URL = "dsh-tools://tool-center/index.html";
export declare const LAB_PAGE_URL = "dsh-tools://tool-center/labs.html";
export declare const TOOL_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
/**
 * @param url Fixed tool origin request.
 * @param root Verified module directory.
 * @param manifest Registered asset hashes.
 * @returns Bytes from the same checked read, with its local path and MIME type.
 */
export declare function resolveToolResource(url: string, root: string, manifest: ToolModuleManifest): Promise<{
    path: string;
    mime: string;
    bytes: Buffer;
}>;
//# sourceMappingURL=tool-center-resources.d.ts.map