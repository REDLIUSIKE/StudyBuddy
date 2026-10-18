export type UsbBatchEnvironment = "test" | "production";
export type UsbIdentityFields = Readonly<{
    schemaVersion: 1;
    usbId: string;
    batchId: string;
    issuedAt: string;
    signingKeyVersion: number;
}>;
export type UsbBatchManifest = Readonly<{
    schemaVersion: 1;
    environment: UsbBatchEnvironment;
    batchId: string;
    signingKeyVersion: number;
    createdAt: string;
    count: number;
    identities: readonly Readonly<{
        usbId: string;
        identityDigest: string;
        payloadPath: string;
        signaturePath: string;
    }>[];
}>;
export type UsbImportReceipt = Readonly<{
    schemaVersion: 1;
    environment: UsbBatchEnvironment;
    batchId: string;
    manifestDigest: string;
    importedCount: number;
    importedAt: string;
}>;
export declare function canonicalUsbIdentity(input: UsbIdentityFields): Uint8Array;
export declare function parseUsbBatchManifest(input: unknown): UsbBatchManifest;
export declare function parseUsbImportReceipt(input: unknown): UsbImportReceipt;
