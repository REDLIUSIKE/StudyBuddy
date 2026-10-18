export interface MediaKeyRecord {
    schemaVersion: 1;
    requestId: string;
    kind: 'image' | 'video' | 'audio' | 'transcription';
    modelId: string;
    inputHash: string;
    taskId: string | null;
    state: 'queued' | 'in_progress' | 'completed' | 'failed' | 'unknown';
}
export interface MediaKeyJournal {
    get(owner: string, id: string): Promise<MediaKeyRecord | null>;
    claim(owner: string, row: MediaKeyRecord): Promise<{
        row: MediaKeyRecord;
        created: boolean;
    }>;
    save(owner: string, row: MediaKeyRecord): Promise<void>;
}
export declare const mediaRequestUUID: (v: unknown) => v is string;
export declare const mediaTaskState: (s: unknown) => MediaKeyRecord["state"];
/** Private, keyless transport correlation. Original paid request journals stay intact. */
export declare class DiskMediaKeyJournal implements MediaKeyJournal {
    private readonly root;
    constructor(root: string);
    private location;
    private directory;
    get(owner: string, id: string): Promise<MediaKeyRecord | null>;
    claim(owner: string, input: MediaKeyRecord): Promise<{
        row: MediaKeyRecord;
        created: boolean;
    }>;
    save(owner: string, input: MediaKeyRecord): Promise<void>;
    private replace;
}
//# sourceMappingURL=media-key-journal.d.ts.map