/** Invocation facts contain neither credentials nor StudyBuddy caller identity.
 * The target service resolves funding and model permission from the submitted Key. */
export declare const MODEL_KEY_PROTOCOLS: readonly ['openai_chat_completions', 'openai_responses', 'anthropic_messages', 'openai_image.generate', 'openai_video.create', 'minimax_speech.generate', 'minimax_speech.transcribe', 'volcengine_audio.generate'];
export type ModelKeyProtocol = typeof MODEL_KEY_PROTOCOLS[number];
export type ModelKeyPurpose = 'chat' | 'image' | 'video' | 'audio' | 'transcription' | 'validation' | 'diagnostic';
export interface ModelKeyInvocationV1 {
    readonly schemaVersion: 1;
    readonly requestId: string;
    readonly exactModelId: string;
    readonly protocol: ModelKeyProtocol;
    readonly purpose: ModelKeyPurpose;
}
export declare function parseModelKeyInvocationV1(input: unknown): ModelKeyInvocationV1;
