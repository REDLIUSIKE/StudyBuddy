/** Bounded, versioned requests between an SSH client and its private remote helper. */
import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import { z } from 'zod';
/** Wire version shared by the installed helper and client package. */
export declare const SSH_PROTOCOL_VERSION = 2;
/** Maximum prepared or running process handles owned by one helper. */
export declare const SSH_MAX_PROCESS_HANDLES = 128;
/** Maximum open text iterators owned by one helper. */
export declare const SSH_MAX_TEXT_STREAMS = 128;
type RequestHandler = (method: string, params: unknown, signal: AbortSignal) => Promise<unknown>;
/** A remote error retains its typed filesystem or sandbox code. */
export declare class RemoteOperationError extends Error {
    readonly code?: string | undefined;
    constructor(message: string, code?: string | undefined);
}
/** The peer owns pending calls and rejects ambiguous operations on connection loss; it never replays requests. */
export declare class SshRpcPeer extends EventEmitter {
    private readonly input;
    private readonly output;
    private readonly maxFrameBytes;
    private readonly maxPending;
    private readonly handler?;
    private readonly pending;
    private readonly active;
    private writeTail;
    private queuedBytes;
    private failure;
    constructor(input: Readable, output: Writable, maxFrameBytes: number, maxPending: number, handler?: RequestHandler | undefined);
    /**
     * Send one request and validate its response before exposing it to the caller.
     * @param method - the private helper operation.
     * @param params - JSON request fields.
     * @param schema - validation for the remote response.
     * @param signal - cancellation without rollback of remote effects.
     * @returns the validated response or a transport/remote-operation rejection.
     */
    request<T>(method: string, params: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T>;
    /**
     * Fail pending operations and abort remote handlers without claiming rollback.
     * @param error - the transport failure reported to all pending operations.
     */
    close(error?: Error): void;
    private send;
    private readFrames;
    private receive;
    private atCapacity;
}
export {};
//# sourceMappingURL=protocol.d.ts.map