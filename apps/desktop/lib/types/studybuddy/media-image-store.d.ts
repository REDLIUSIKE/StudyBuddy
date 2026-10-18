import type { MediaKeyRecord } from './media-key-journal.ts';
export interface StoredMediaImage {
    mime: 'image/png' | 'image/jpeg' | 'image/webp';
    base64: string;
}
export interface MediaImageStore {
    get(owner: string, row: MediaKeyRecord): Promise<StoredMediaImage | null>;
    save(owner: string, row: MediaKeyRecord, content: StoredMediaImage): Promise<void>;
}
/** Account-owned output files, separate from the keyless request and reasoning journals. */
export declare class DiskMediaImageStore implements MediaImageStore {
    private readonly root;
    private canonicalRoot;
    constructor(root: string);
    private location;
    private directory;
    get(owner: string, row: MediaKeyRecord): Promise<StoredMediaImage | null>;
    save(owner: string, row: MediaKeyRecord, content: StoredMediaImage): Promise<void>;
}
//# sourceMappingURL=media-image-store.d.ts.map