export type LogoutAuthorityReceipt = Readonly<{
    status: "revoked";
    authorityGeneration: number;
}>;
export declare function parseLogoutAuthorityReceipt(value: unknown): LogoutAuthorityReceipt;
/** Additive native acknowledgement. Only the server's persisted logout session
 * supplies identity; devices/current and caller inputs are not revocation proof. */
export type NativeLogoutAuthorityReceiptV2 = Readonly<{
    schemaVersion: 2;
    status: 'revoked';
    accountOwner: string;
    deviceId: string;
    authorityGeneration: number;
}>;
export declare function parseNativeLogoutAuthorityReceiptV2(value: unknown): NativeLogoutAuthorityReceiptV2;
