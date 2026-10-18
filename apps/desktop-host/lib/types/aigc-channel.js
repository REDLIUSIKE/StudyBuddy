/** Bounded correlated private transport. Neither secrets nor commands enter argv/profile files. */
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class AigcChannel {
    input;
    output;
    end;
    bootstrap;
    first = Promise.withResolvers();
    decoder = new StringDecoder('utf8');
    buffer = '';
    bootstrapped = false;
    stopped = false;
    pending = new Map();
    commands = new Map();
    completed = new Set();
    invoke;
    constructor(input, output, end) {
        this.input = input;
        this.output = output;
        this.end = end;
        this.bootstrap = this.first.promise;
        void this.bootstrap.catch(() => { });
        input.on('data', this.data);
        input.once('end', this.ended);
        input.on('error', this.failed);
        output.on('error', this.failed);
        if (input.readableEnded)
            queueMicrotask(this.ended);
    }
    ended = () => { if (!this.stopped)
        this.end(false); };
    failed = () => { if (!this.stopped)
        this.end(true); };
    data = (chunk) => {
        try {
            if (!Buffer.isBuffer(chunk))
                throw Error('AIGC_CONTROL_INVALID');
            this.buffer += this.decoder.write(chunk);
            for (;;) {
                const newline = this.buffer.indexOf('\n');
                if (newline < 0) {
                    if (Buffer.byteLength(this.buffer) > (this.bootstrapped ? 32 * 1024 * 1024 : 65536))
                        throw Error('AIGC_CONTROL_INVALID');
                    return;
                }
                const line = this.buffer.slice(0, newline);
                this.buffer = this.buffer.slice(newline + 1);
                if (Buffer.byteLength(line) > (this.bootstrapped ? 32 * 1024 * 1024 : 65536))
                    throw Error('AIGC_CONTROL_INVALID');
                const value = JSON.parse(line);
                if (!this.bootstrapped) {
                    this.bootstrapped = true;
                    this.first.resolve(value);
                }
                else
                    this.message(value);
            }
        }
        catch {
            this.failed();
        }
    };
    message(value) {
        if (!value || typeof value !== 'object' || !('type' in value))
            throw Error('AIGC_CONTROL_INVALID');
        if (value.type === 'shutdown' && Object.keys(value).length === 1) {
            this.ended();
            return;
        }
        if (!('rpcId' in value) || typeof value.rpcId !== 'string' || !uuid.test(value.rpcId))
            throw Error('AIGC_CONTROL_INVALID');
        const id = value.rpcId;
        if (value.type === 'native-result') {
            if (Object.keys(value).some(key => !['type', 'rpcId', 'data', 'error'].includes(key)))
                throw Error('AIGC_CONTROL_INVALID');
            const pending = this.pending.get(id);
            if (!pending)
                return;
            this.pending.delete(id);
            pending.detach();
            if ('error' in value)
                pending.reject(Error(typeof value.error === 'string' && /^[A-Z0-9_]{1,128}$/.test(value.error) ? value.error : 'AIGC_NATIVE_OPERATION_FAILED'));
            else if ('data' in value)
                pending.resolve(value.data);
            else
                pending.reject(Error('AIGC_CONTROL_INVALID'));
            return;
        }
        if (value.type === 'cancel' && Object.keys(value).length === 2) {
            this.commands.get(id)?.controller.abort(Error('AIGC_OPERATION_CANCELLED'));
            return;
        }
        if (value.type !== 'command' || Object.keys(value).length !== 3 || !('input' in value))
            throw Error('AIGC_CONTROL_INVALID');
        if (!this.invoke || this.commands.size >= 128 || this.commands.has(id) || this.completed.has(id)) {
            void this.send({ type: 'result', rpcId: id, error: 'AIGC_COMMAND_UNAVAILABLE' }).catch(this.failed);
            return;
        }
        const invoke = this.invoke, controller = new AbortController(), settled = Promise.withResolvers();
        this.commands.set(id, { controller, settled: settled.promise });
        void (async () => {
            try {
                const data = await invoke(value.input, controller.signal);
                controller.signal.throwIfAborted();
                await this.send({ type: 'result', rpcId: id, data });
            }
            catch (error) {
                if (!this.stopped)
                    await this.send({ type: 'result', rpcId: id, error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'AIGC_DOMAIN_OPERATION_FAILED' });
            }
            finally {
                this.commands.delete(id);
                this.completed.add(id);
                if (this.completed.size > 4096)
                    this.completed.delete(this.completed.values().next().value);
                settled.resolve();
            }
        })().catch(this.failed);
    }
    listen(invoke) { this.invoke = invoke; }
    send(value) {
        if (this.stopped || this.output.destroyed || this.output.writableEnded)
            return Promise.reject(Error('AIGC_CONTROL_DISCONNECTED'));
        const line = JSON.stringify(value) + '\n';
        if (Buffer.byteLength(line) > 32 * 1024 * 1024)
            return Promise.reject(Error('AIGC_CONTROL_TOO_LARGE'));
        return new Promise((resolve, reject) => { this.output.write(line, error => { if (error)
            reject(Error('AIGC_CONTROL_DISCONNECTED'));
        else
            resolve(); }); });
    }
    request(operation, input, signal) {
        signal.throwIfAborted();
        if (this.stopped || this.pending.size >= 128)
            return Promise.reject(Error('AIGC_NATIVE_UNAVAILABLE'));
        const rpcId = randomUUID();
        return new Promise((resolve, reject) => {
            const cancel = () => {
                if (!this.pending.delete(rpcId))
                    return;
                signal.removeEventListener('abort', cancel);
                reject(Error('AIGC_OPERATION_CANCELLED'));
                void this.send({ type: 'native-cancel', rpcId }).catch(this.failed);
            };
            this.pending.set(rpcId, { resolve, reject, detach: () => { signal.removeEventListener('abort', cancel); } });
            signal.addEventListener('abort', cancel, { once: true });
            void this.send({ type: 'native-request', rpcId, operation, input }).catch(() => {
                const pending = this.pending.get(rpcId);
                if (!pending)
                    return;
                this.pending.delete(rpcId);
                pending.detach();
                reject(Error('AIGC_CONTROL_DISCONNECTED'));
            });
        });
    }
    async close() {
        if (!this.stopped) {
            this.stopped = true;
            this.first.reject(Error('AIGC_PLUGIN_STOPPED'));
            this.input.off('data', this.data);
            this.input.off('end', this.ended);
            this.input.off('error', this.failed);
            this.output.off('error', this.failed);
            this.input.pause();
            this.invoke = undefined;
            for (const row of this.pending.values()) {
                row.detach();
                row.reject(Error('AIGC_PLUGIN_STOPPED'));
            }
            this.pending.clear();
            for (const row of this.commands.values())
                row.controller.abort(Error('AIGC_PLUGIN_STOPPED'));
        }
        await Promise.all([...this.commands.values()].map(row => row.settled));
    }
}
//# sourceMappingURL=aigc-channel.js.map