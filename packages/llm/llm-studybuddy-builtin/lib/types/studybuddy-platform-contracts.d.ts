import type { OwnedScope, NativeToolCatalogV2, NativeCatalogModelV2, NativeToolMaterialV2, NativeToolAuthorityV2 } from '@studybuddy/contracts';
export declare const PLATFORM_PROVIDER = "studybuddy-platform";
export interface PlatformSnapshot {
    readonly scope: OwnedScope;
    readonly hostGeneration: string;
    readonly catalog: NativeToolCatalogV2;
    readonly checkedAt: string;
    readonly expiresAt: string;
}
export interface PlatformChoice {
    readonly member: NativeCatalogModelV2;
    readonly model: NativeCatalogModelV2;
}
export interface PlatformRequest {
    readonly scope: OwnedScope;
    readonly hostGeneration: string;
    readonly catalogRevision: string;
    readonly clientRequestId: string;
    readonly sessionId: string;
    readonly exactModelId: string;
}
export interface PlatformPrepared {
    readonly request: PlatformRequest;
    readonly material: NativeToolMaterialV2;
    readonly authority: NativeToolAuthorityV2 | null;
}
/** Validate the separately leased, manually reviewed platform authority. */
export declare function parsePlatformSnapshot(value: unknown): PlatformSnapshot;
/** Expose native Harness Chat memberships joined to exact current reviewed facts. */
export declare function platformChoices(snapshot: PlatformSnapshot): readonly PlatformChoice[];
/** Parse only the keyless private Host request, never a browser-authorized selection. */
export declare function parsePlatformRequest(value: unknown): PlatformRequest;
/** Parse configured Key transport, or the legacy management disclosure receipt.
 * A null authority uses bearer-Key admission at the gateway, without an account grant. */
export declare function parsePlatformPrepared(value: unknown): PlatformPrepared;
//# sourceMappingURL=studybuddy-platform-contracts.d.ts.map