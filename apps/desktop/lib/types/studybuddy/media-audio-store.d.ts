import type { MediaKeyRecord } from './media-key-journal.ts';
import type { TtsTiming } from './tts-timing.ts';
export interface StoredMediaAudio {
    mime: string;
    bytes: Uint8Array;
    timing?: TtsTiming;
    timingRequested?: boolean;
}
export interface MediaAudioStore {
    get(owner: string, row: MediaKeyRecord): Promise<StoredMediaAudio | null>;
    save(owner: string, row: MediaKeyRecord, result: StoredMediaAudio): Promise<void>;
}
export declare class DiskMediaAudioStore implements MediaAudioStore {
    private readonly root;
    private canonicalRoot;
    constructor(root: string);
    private location;
    private directory;
    get(owner: string, row: MediaKeyRecord): Promise<StoredMediaAudio | null>;
    save(owner: string, row: MediaKeyRecord, result: StoredMediaAudio): Promise<void>;
}
//# sourceMappingURL=media-audio-store.d.ts.map