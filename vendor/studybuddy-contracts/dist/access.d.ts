import { type ServiceBackendProvisioningStatus } from "./account-use-access.js";
export { parseServiceBackendProvisioningStatus, type ServiceBackendProvisioningStatus } from "./account-use-access.js";
export type AccessLevel = "lifetime";
export type AccessSource = "usb_claim" | "digital_purchase";
export interface AccessResponse {
    access: {
        eligible: boolean;
        level: AccessLevel | null;
        productCode: string | null;
        source: AccessSource | null;
        grantedAt: string | null;
    };
    serviceBackendStatus: ServiceBackendProvisioningStatus;
}
export declare function parseAccessResponse(value: unknown): AccessResponse;
