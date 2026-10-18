export declare const ACCOUNT_USE_POLICY_REVISION: "account-open-v1";
export type ServiceBackendProvisioningStatus = "pending" | "processing" | "ready" | "retrying" | "failed";
/** Software access derives from the account; model funding is authorized separately. */
export interface AccountUseAccessResponse {
    schemaVersion: 1;
    accountAccess: {
        allowed: boolean;
        policyRevision: typeof ACCOUNT_USE_POLICY_REVISION;
        accountRevision: string;
    };
    serviceBackendStatus: ServiceBackendProvisioningStatus;
}
/** Parse the versioned account-access response at the HTTP boundary. */
export declare function parseAccountUseAccessResponse(value: unknown): AccountUseAccessResponse;
export declare function parseServiceBackendProvisioningStatus(value: unknown): ServiceBackendProvisioningStatus;
