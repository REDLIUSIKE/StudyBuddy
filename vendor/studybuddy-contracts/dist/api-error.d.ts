export interface ApiErrorResponse {
    code: string;
    message: string;
    requestId: string;
    details?: {
        availableAt: string;
    };
}
export declare function parseApiErrorResponse(value: unknown): ApiErrorResponse;
