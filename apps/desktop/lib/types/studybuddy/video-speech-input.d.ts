/** Read a bounded, verified WAV prepared by the admitted video domain; no file bytes cross IPC. */
export declare function readVideoSpeech(root: string, input: Record<string, unknown>, maxBytes: number, maxSeconds: number, signal: AbortSignal): Promise<Uint8Array>;
//# sourceMappingURL=video-speech-input.d.ts.map