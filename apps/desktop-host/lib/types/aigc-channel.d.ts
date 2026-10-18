import type { Readable, Writable } from 'node:stream';
import type { AigcNativeOperation } from './aigc-service.ts';
export declare class AigcChannel {
    private readonly input;
    private readonly output;
    private readonly end;
    readonly bootstrap: Promise<unknown>;
    private readonly first;
    private readonly decoder;
    private buffer;
    private bootstrapped;
    private stopped;
    private readonly pending;
    private readonly commands;
    private readonly completed;
    private invoke;
    constructor(input: Readable, output: Writable, end: (failed: boolean) => void);
    private readonly ended;
    private readonly failed;
    private readonly data;
    private message;
    listen(invoke: (input: unknown, signal: AbortSignal) => Promise<unknown>): void;
    send(value: object): Promise<void>;
    request(operation: AigcNativeOperation, input: unknown, signal: AbortSignal): Promise<unknown>;
    close(): Promise<void>;
}
//# sourceMappingURL=aigc-channel.d.ts.map