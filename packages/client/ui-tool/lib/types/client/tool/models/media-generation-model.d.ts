export interface MediaTaskModel {
    schemaVersion: 1;
    requestId: string;
    sessionId: string;
    kind: 'image' | 'video';
    modelId: string;
    state: 'queued' | 'in_progress' | 'completed' | 'failed' | 'unknown';
    contentAvailable: boolean;
}
export declare function mediaTaskModel(value: unknown): MediaTaskModel | null;
export declare function mediaTaskUrl(value: MediaTaskModel, mode: 'status' | 'content'): string;
//# sourceMappingURL=media-generation-model.d.ts.map