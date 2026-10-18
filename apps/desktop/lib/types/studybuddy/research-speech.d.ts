import type { OwnedScope, HarnessResearchContextV1 } from '@studybuddy/contracts';
import { HARNESS_ASR_MODELS } from '@studybuddy/contracts';
export interface ResearchSpeechInput {
    requestId: string;
    audioPath: string;
    mimeType: 'audio/wav';
    bytes: number;
    sha256: string;
}
type ResearchASRModel = (typeof HARNESS_ASR_MODELS)[number];
export interface ResearchSpeechRequest {
    requestId: string;
    modelId: ResearchASRModel;
    audio: Uint8Array;
    mimeType: 'audio/wav';
}
export interface ResearchSpeechResult {
    requestId: string;
    modelId: ResearchASRModel;
    text: string;
    duration: number;
}
export type ResearchSpeechConsumer = (scope: OwnedScope, input: ResearchSpeechRequest, signal: AbortSignal, context: HarnessResearchContextV1) => Promise<ResearchSpeechResult>;
/** No account, model, URL or funding override can accompany a recording. */
export declare function parseResearchSpeechInput(value: unknown): ResearchSpeechInput;
/** Read through a bounded file handle; a growing file or linked parent fails before paid dispatch. */
export declare function readResearchSpeech(sandbox: string, value: unknown, signal: AbortSignal): Promise<ResearchSpeechRequest>;
/** Only terminal provider text/duration are projected; no estimated Tokens or local currency are invented. */
export declare function parseResearchSpeechResult(value: unknown, requestId: string): ResearchSpeechResult;
export {};
//# sourceMappingURL=research-speech.d.ts.map