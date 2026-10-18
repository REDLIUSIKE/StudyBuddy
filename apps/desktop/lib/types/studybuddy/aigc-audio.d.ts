import type { OwnedScope } from '@studybuddy/contracts';
import type { StudyBuddyFetch } from './services.ts';
import type { MediaKeyJournal } from './media-key-journal.ts';
import type { MediaAudioStore } from './media-audio-store.ts';
interface Options {
    isCurrent(scope: OwnedScope): boolean;
    target(scope: OwnedScope): Promise<{
        baseUrl: string;
        apiKey: string;
    }>;
    journal: MediaKeyJournal;
    fetch: StudyBuddyFetch;
    audioResults?: MediaAudioStore;
}
export declare class AigcAudioClient {
    private readonly options;
    private readonly contentRows;
    constructor(options: Options);
    private key;
    private assert;
    clearTransient(): void;
    private client;
    private catalog;
    private remember;
    private output;
    private project;
    private status;
    request(scope: OwnedScope, path: string, value?: unknown, signal?: AbortSignal): Promise<unknown>;
    content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response>;
}
export {};
//# sourceMappingURL=aigc-audio.d.ts.map