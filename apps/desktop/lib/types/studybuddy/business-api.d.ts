import type { BusinessOperationMap } from '@studybuddy/contracts';
import type { StudyBuddyAuth, StudyBuddyFetch } from './services.ts';
export declare function assertBusinessSender(sender: {
    ownerId: number | undefined;
    senderId: number;
    mainFrameId: number | undefined;
    frameId: number | undefined;
    url: string;
    authenticated: boolean;
}): void;
/** Convert a closed operation to its original endpoint and request fields. */
export declare function cloudRequest(method: string, args: readonly unknown[]): {
    path: string;
    body?: unknown;
};
export declare class BusinessFailure extends Error {
    readonly code: string;
    readonly status?: number | undefined;
    readonly operationId?: string | undefined;
    readonly requestId: string | undefined;
    readonly availableAt: string | undefined;
    constructor(code: string, status?: number | undefined, operationId?: string | undefined, details?: {
        message?: string;
        requestId?: string;
        availableAt?: string;
    });
}
/** One private HTTP owner, with original parsers and no credential returned to the renderer. */
export declare class StudyBuddyCloudClient {
    private readonly auth;
    private readonly fetcher;
    constructor(auth: StudyBuddyAuth, fetcher: StudyBuddyFetch);
    invoke<K extends keyof BusinessOperationMap>(method: K, args: BusinessOperationMap[K]['args']): Promise<BusinessOperationMap[K]['result']>;
}
//# sourceMappingURL=business-api.d.ts.map