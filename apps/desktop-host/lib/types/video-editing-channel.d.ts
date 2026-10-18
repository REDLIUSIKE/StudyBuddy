import type { Readable, Writable } from 'node:stream';
/** Bounded private stdio framing shared by bootstrap, control and native results. */
export declare class VideoChannel {
    private readonly input;
    private readonly output;
    private buffer;
    private readonly frames;
    private readonly waiters;
    private readonly stops;
    private queued;
    private failure?;
    constructor(input: Readable, output: Writable);
    private readonly data;
    private readonly ended;
    private readonly failed;
    next(): Promise<unknown>;
    send(value: unknown): Promise<void>;
    onStop(callback: (error: Error) => void): () => void;
    close(error?: Error): void;
}
//# sourceMappingURL=video-editing-channel.d.ts.map