import type { OwnedScope, HarnessResearchContextV1 } from '@studybuddy/contracts';
import type { StudyBuddyFetch } from './services.ts';
import type { MediaKeyJournal } from './media-key-journal.ts';
import type { ResearchSpeechRequest, ResearchSpeechResult } from './research-speech.ts';
import type { MediaAudioStore } from './media-audio-store.ts';
export { parseMiniMaxTtsTiming } from './tts-timing.ts';
export { downloadMiniMaxTtsSubtitles } from './tts-subtitle-download.ts';
export interface SpeechWord {
    id: number;
    start: number;
    end: number;
    speaker: string;
    text: string;
}
export interface TimedSpeechResult {
    requestId: string;
    modelId: string;
    state: 'completed';
    text: string;
    duration: number;
    nSpeakers: number;
    segments: SpeechWord[];
}
/** Provider times are display seconds; only the existing gateway meters the original duration. */
export declare function parseTimedSpeechResult(value: unknown, requestId: string, modelId: string, maxDurationSeconds: number): TimedSpeechResult;
interface Options {
    isCurrent(scope: OwnedScope): boolean;
    target(scope: OwnedScope): Promise<{
        baseUrl: string;
        apiKey: string;
    }>;
    journal: MediaKeyJournal;
    fetch: StudyBuddyFetch;
    audioResults?: MediaAudioStore;
    readTtsSubtitles?: (url: string, signal: AbortSignal) => Promise<unknown>;
}
export declare class AigcSpeechClient {
    private readonly options;
    private readonly contentRows;
    private key;
    private assert;
    constructor(options: Options);
    clearTransient(): void;
    private client;
    private catalog;
    private remember;
    private output;
    private project;
    private status;
    request(scope: OwnedScope, path: string, value?: unknown, signal?: AbortSignal): Promise<unknown>;
    content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response>;
    private transcribeWords;
    transcribe(scope: OwnedScope, input: ResearchSpeechRequest, signal: AbortSignal, context: HarnessResearchContextV1): Promise<ResearchSpeechResult>;
}
//# sourceMappingURL=aigc-speech.d.ts.map