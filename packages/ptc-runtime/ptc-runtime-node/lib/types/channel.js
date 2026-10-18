/** Length-prefixed JSON transport with bounded input and queued writes. */
import { Buffer } from 'node:buffer';
import { jsonValueBytesUpTo } from "./output-json.js";
const stringify = JSON.stringify;
const parse = JSON.parse;
/** One co-shipped process channel; the consumer owns frame validation and terminal outcomes. */
export class JsonChannel {
    stream;
    maxBytes;
    receive;
    failure;
    header = Buffer.alloc(4);
    headerBytes = 0;
    payload;
    payloadBytes = 0;
    queuedBytes = 0;
    closed = false;
    writes = new Set();
    constructor(stream, maxBytes, receive, failure) {
        this.stream = stream;
        this.maxBytes = maxBytes;
        this.receive = receive;
        this.failure = failure;
        stream.on('data', this.onData);
        stream.on('error', this.onError);
        stream.on('end', this.onEnd);
        stream.on('close', this.onClose);
    }
    onError = (error) => {
        this.finishWrites(error);
        if (!this.closed)
            this.failure(error, 'io');
    };
    onClose = () => { this.finishWrites(new Error('control channel closed during a write')); };
    onEnd = () => { if (!this.closed)
        this.failure(new Error('control channel ended before the program settled'), 'io'); };
    onData = (chunk) => {
        if (this.closed)
            return;
        try {
            let offset = 0;
            // receive can synchronously close the channel while dispatching a preceding frame.
            // oxlint-disable-next-line typescript/no-unnecessary-condition
            while (offset < chunk.length && !this.closed) {
                if (this.payload === undefined) {
                    const bytes = Math.min(4 - this.headerBytes, chunk.length - offset);
                    chunk.copy(this.header, this.headerBytes, offset, offset + bytes);
                    this.headerBytes += bytes;
                    offset += bytes;
                    if (this.headerBytes !== 4)
                        continue;
                    const length = this.header.readUInt32BE(0);
                    if (length === 0 || length > this.maxBytes)
                        throw new Error(`control frame exceeds ${this.maxBytes} bytes or is empty`);
                    this.payload = Buffer.allocUnsafe(length);
                    this.payloadBytes = 0;
                    this.headerBytes = 0;
                }
                const bytes = Math.min(this.payload.length - this.payloadBytes, chunk.length - offset);
                chunk.copy(this.payload, this.payloadBytes, offset, offset + bytes);
                this.payloadBytes += bytes;
                offset += bytes;
                if (this.payloadBytes !== this.payload.length)
                    continue;
                const frame = this.payload;
                this.payload = undefined;
                this.payloadBytes = 0;
                this.receive(parse(new TextDecoder('utf-8', { fatal: true }).decode(frame)), frame.length);
            }
        }
        catch (error) {
            this.failure(error instanceof Error ? error : new Error(String(error)), 'protocol');
        }
    };
    /**
     * Submit a bounded frame immediately and await the stream's write receipt.
     * @param message - JSON-only co-shipped protocol value.
     * @returns Resolves when this frame has been written, or rejects after transport failure.
     */
    send(message) {
        if (this.closed)
            return Promise.reject(new Error('control channel is closed'));
        const size = jsonValueBytesUpTo(message, this.maxBytes);
        if (size === undefined || this.queuedBytes + size > this.maxBytes) {
            return Promise.reject(new Error(`control output exceeds ${this.maxBytes} queued bytes`));
        }
        const body = Buffer.from(stringify(message), 'utf8');
        const header = Buffer.alloc(4);
        header.writeUInt32BE(body.length);
        this.queuedBytes += body.length;
        const completion = Promise.withResolvers();
        const write = {
            promise: completion.promise,
            finish: (error) => {
                if (!this.writes.delete(write))
                    return;
                this.queuedBytes -= body.length;
                if (error)
                    completion.reject(error);
                else
                    completion.resolve();
            },
        };
        this.writes.add(write);
        try {
            // Writable preserves frame order; a Promise queue would delay logs behind a model hot loop.
            this.stream.cork();
            this.stream.write(header);
            this.stream.write(body, (error) => { write.finish(error ?? undefined); });
            this.stream.uncork();
        }
        catch (error) {
            write.finish(error instanceof Error ? error : new Error(String(error)));
        }
        return completion.promise;
    }
    finishWrites(error) {
        for (const write of this.writes)
            write.finish(error);
    }
    /** Stop reads and close the owned endpoint; pending writes reject on closure. */
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.payload = undefined;
        this.finishWrites(new Error('control channel is closed'));
        this.stream.off('data', this.onData);
        this.stream.off('end', this.onEnd);
        this.stream.destroy();
    }
    /** Wait for accepted writes to finish or fail. */
    async drain() { await Promise.allSettled([...this.writes].map(write => write.promise)); }
}
//# sourceMappingURL=channel.js.map