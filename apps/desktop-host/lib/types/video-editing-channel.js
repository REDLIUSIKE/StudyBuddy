const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_QUEUED_BYTES = 16 * 1024 * 1024;
/** Bounded private stdio framing shared by bootstrap, control and native results. */
export class VideoChannel {
    input;
    output;
    buffer = Buffer.alloc(0);
    frames = [];
    waiters = [];
    stops = new Set();
    queued = 0;
    failure;
    constructor(input, output) {
        this.input = input;
        this.output = output;
        input.on('data', this.data);
        input.on('end', this.ended);
        input.on('error', this.failed);
        output.on('error', this.failed);
    }
    data = (chunk) => {
        if (this.failure)
            return;
        this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        let newline;
        while ((newline = this.buffer.indexOf(10)) !== -1) {
            if (newline > MAX_FRAME_BYTES) {
                this.close(Error('VIDEO_FRAME_TOO_LARGE'));
                return;
            }
            const line = this.buffer.subarray(0, newline);
            this.buffer = this.buffer.subarray(newline + 1);
            let value;
            try {
                value = JSON.parse(line.toString('utf8'));
            }
            catch {
                this.close(Error('VIDEO_FRAME_INVALID'));
                return;
            }
            const waiter = this.waiters.shift();
            if (waiter)
                waiter.resolve(value);
            else {
                this.queued += line.length;
                if (this.queued > MAX_QUEUED_BYTES) {
                    this.close(Error('VIDEO_FRAME_TOO_LARGE'));
                    return;
                }
                this.frames.push({ value, bytes: line.length });
            }
        }
        if (this.buffer.length > MAX_FRAME_BYTES)
            this.close(Error('VIDEO_FRAME_TOO_LARGE'));
    };
    ended = () => { this.close(Error('VIDEO_CHANNEL_CLOSED')); };
    failed = () => { this.close(Error('VIDEO_CHANNEL_FAILED')); };
    next() {
        if (this.failure)
            return Promise.reject(this.failure);
        const frame = this.frames.shift();
        if (frame) {
            this.queued -= frame.bytes;
            return Promise.resolve(frame.value);
        }
        return new Promise((resolve, reject) => { this.waiters.push({ resolve, reject }); });
    }
    send(value) {
        if (this.failure)
            return Promise.reject(this.failure);
        const frame = JSON.stringify(value) + '\n';
        if (Buffer.byteLength(frame) > MAX_FRAME_BYTES)
            return Promise.reject(Error('VIDEO_FRAME_TOO_LARGE'));
        return new Promise((resolve, reject) => { this.output.write(frame, error => error ? reject(error) : resolve()); });
    }
    onStop(callback) {
        this.stops.add(callback);
        if (this.failure)
            callback(this.failure);
        return () => { this.stops.delete(callback); };
    }
    close(error = Error('VIDEO_CHANNEL_CLOSED')) {
        if (this.failure)
            return;
        this.failure = error;
        this.input.off('data', this.data);
        this.input.off('end', this.ended);
        this.input.off('error', this.failed);
        this.output.off('error', this.failed);
        this.input.pause();
        this.buffer = Buffer.alloc(0);
        this.frames.length = 0;
        this.queued = 0;
        for (const waiter of this.waiters.splice(0))
            waiter.reject(error);
        for (const stop of [...this.stops])
            stop(error);
        this.stops.clear();
    }
}
//# sourceMappingURL=video-editing-channel.js.map