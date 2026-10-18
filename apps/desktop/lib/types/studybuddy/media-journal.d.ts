import type { MediaRequestJournal, MediaRequestRecord } from './media-bridge.ts';
export declare class DiskMediaRequestJournal implements MediaRequestJournal {
    private readonly root;
    constructor(root: string);
    private path;
    get(account: string, id: string): Promise<MediaRequestRecord | null>;
    claim(value: MediaRequestRecord): Promise<{
        row: MediaRequestRecord;
        created: boolean;
    }>;
}
//# sourceMappingURL=media-journal.d.ts.map