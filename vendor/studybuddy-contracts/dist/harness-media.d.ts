/** Private Harness media bridge. Never register this contract on a renderer RPC surface. */
import type { OwnedScope } from './harness-account.js';
import { HARNESS_IMAGE_MODELS, HARNESS_VIDEO_MODEL } from './model-membership.generated.js';
export { HARNESS_IMAGE_MODELS, HARNESS_VIDEO_MODEL, HARNESS_TTS_MODELS, HARNESS_VIDEO_TTS_MODELS, HARNESS_ASR_MODELS, HARNESS_VIDEO_ASR_MODELS, HARNESS_AUDIO_MODELS } from './model-membership.generated.js';
export type HarnessImageModel = typeof HARNESS_IMAGE_MODELS[number];
export type HarnessMediaKind = 'image' | 'video';
export interface HarnessMediaContextV1 {
    scope: OwnedScope;
    hostGeneration: string;
    sessionId: string;
}
export interface HarnessImageInputV1 {
    requestId: string;
    modelId: HarnessImageModel;
    prompt: string;
    size: '1K' | '1.5K' | '2K';
}
export interface HarnessVideoInputV1 {
    requestId: string;
    modelId: typeof HARNESS_VIDEO_MODEL;
    prompt: string;
    duration: number;
    resolution: '480p' | '720p' | '1080p';
    ratio: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
    generateAudio: boolean;
}
export interface HarnessMediaLookupV1 {
    requestId: string;
    kind: HarnessMediaKind;
}
export type HarnessMediaInvocationV1 = {
    schemaVersion: 1;
    rpcId: string;
    context: HarnessMediaContextV1;
} & ({
    operation: 'catalog';
    input: null;
} | {
    operation: 'create-image';
    input: HarnessImageInputV1;
} | {
    operation: 'create-video';
    input: HarnessVideoInputV1;
} | {
    operation: 'status' | 'content';
    input: HarnessMediaLookupV1;
});
export interface HarnessMediaTaskV1 {
    schemaVersion: 1;
    requestId: string;
    sessionId: string;
    kind: HarnessMediaKind;
    modelId: string;
    state: 'queued' | 'in_progress' | 'completed' | 'failed' | 'unknown';
    contentAvailable: boolean;
}
export interface HarnessMediaContentV1 {
    schemaVersion: 1;
    requestId: string;
    kind: HarnessMediaKind;
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4';
    base64: string;
    bytes: number;
    sha256: string;
}
export declare function parseHarnessMediaContextV1(value: unknown): HarnessMediaContextV1;
export declare function parseHarnessImageInputV1(value: unknown): HarnessImageInputV1;
export declare function parseHarnessVideoInputV1(value: unknown): HarnessVideoInputV1;
export declare function parseHarnessMediaInvocationV1(value: unknown): HarnessMediaInvocationV1;
