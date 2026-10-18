import type { OwnedScope } from '@studybuddy/contracts';
import type { StudyBuddyFetch } from './services.ts';
import type { ResearchSpeechRequest } from './research-speech.ts';
import type { HarnessResearchContextV1 } from '@studybuddy/contracts';
import type { MediaKeyJournal } from './media-key-journal.ts';
import type { MediaImageStore } from './media-image-store.ts';
import type { MediaAudioStore } from './media-audio-store.ts';
export declare class AigcMediaClient {
    private readonly options;
    private readonly speech;
    private readonly audio;
    private readonly transfers;
    private transferKey;
    private transfer;
    private handoff;
    clearTransient(): void;
    private readonly queues;
    private serial;
    constructor(options: {
        isCurrent(scope: OwnedScope): boolean;
        target(scope: OwnedScope): Promise<{
            baseUrl: string;
            apiKey: string;
        }>;
        fetch: StudyBuddyFetch;
        journal: MediaKeyJournal;
        images?: MediaImageStore;
        audioResults?: MediaAudioStore;
        readTtsSubtitles?: (url: string, signal: AbortSignal) => Promise<unknown>;
    });
    transcribe(scope: OwnedScope, input: ResearchSpeechRequest, signal: AbortSignal, context: HarnessResearchContextV1): Promise<import("./research-speech.ts").ResearchSpeechResult>;
    private assert;
    private target;
    private legacy;
    private project;
    private storedImage;
    private status;
    /** Pure preflight for callers that must validate before claiming a durable request UUID. */
    validateGeneration(kind: 'image' | 'video', value: unknown): void;
    private input;
    request(scope: OwnedScope, path: string, value?: unknown, signal?: AbortSignal): Promise<unknown>;
    private execute;
    content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response>;
    private contentCurrent;
}
//# sourceMappingURL=aigc-media.d.ts.map