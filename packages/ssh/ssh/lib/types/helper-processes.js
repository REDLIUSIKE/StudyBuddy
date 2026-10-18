/** Remote process ownership and separately forwarded byte streams. */
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:tls';
import { finished, pipeline } from 'node:stream/promises';
import { logSpillFailure, OutputCollector, prepareManagedProcessBinding } from '@deepseek-ai/dsh-subprocess-local/output';
import { outputSnapshotFrameLimit, spawnSchema } from "./schemas.js";
import { z } from 'zod';
import { SSH_STREAM_TLS_OPTIONS } from "./stream-security.js";
import { SshRpcPeer } from "./protocol.js";
/** Join TLS, underlying socket, and listener closure before removing their directory. */
async function closeEndpoint(endpoint) {
    const sockets = [...new Set([...(endpoint.socket === undefined ? [] : [endpoint.socket]), ...endpoint.pending])];
    const closed = sockets.map(socket => new Promise((resolve) => {
        if (socket.closed)
            resolve();
        else
            socket.once('close', () => { resolve(); });
    }));
    const listenerClosed = new Promise((resolve) => { endpoint.server.close(() => { resolve(); }); });
    for (const socket of sockets)
        socket.destroy();
    await Promise.all([listenerClosed, ...closed]);
}
/** Coalesce live tail updates while capture continues independently of network readers. */
class CollectedOutputForwarder {
    collector;
    peer;
    dirty = false;
    stopped = false;
    running;
    constructor(socket, collector, maxBytes) {
        this.collector = collector;
        this.peer = new SshRpcPeer(socket, socket, outputSnapshotFrameLimit(maxBytes), 1);
        this.peer.once('closed', () => { this.stopped = true; });
    }
    offer() {
        if (this.stopped)
            return;
        this.dirty = true;
        if (this.running !== undefined)
            return;
        this.running = this.flush();
    }
    async flush() {
        try {
            while (this.dirty && !this.stopped) {
                this.dirty = false;
                const snapshot = this.collector.snapshot();
                await this.peer.request('snapshot', { tail: snapshot.bytes.toString('base64'), totalBytes: snapshot.totalBytes }, z.null());
            }
        }
        catch {
            this.stopped = true;
            this.peer.close();
        }
        finally {
            this.running = undefined;
        }
    }
    async finish() {
        this.offer();
        while (this.running !== undefined)
            await this.running;
        this.peer.close();
    }
}
/** Owns remote launch reservations through final process-range quiescence. */
export class RemoteProcesses {
    ctx;
    root;
    limit;
    preparationMs;
    records = new Map();
    // Settled promises preserve the original rejection for late done requests.
    completed = new Map();
    cleanups = new Set();
    closing = false;
    /** Spill failures reach the helper's logger; the remote caller then receives the tail without a spill path. */
    reportSpillFailure;
    constructor(ctx, root, limit, preparationMs) {
        this.ctx = ctx;
        this.root = root;
        this.limit = limit;
        this.preparationMs = preparationMs;
        this.reportSpillFailure = logSpillFailure(ctx.logger, 'ssh helper');
    }
    /**
     * Allocate private stream listeners; no target executes until start().
     * @param raw - untrusted process request received over SSH.
     * @returns the reservation id and authenticated stream coordinates.
     */
    async prepare(raw) {
        if (this.closing || this.records.size >= this.limit)
            throw new Error('SSH process capacity unavailable');
        const request = spawnSchema.parse(raw);
        const id = randomUUID();
        const directory = join(this.root, id);
        const record = {
            request, directory, endpoints: {}, controller: new AbortController(),
            expiry: setTimeout(() => { void this.release(id).catch(() => { }); }, this.preparationMs),
        };
        this.records.set(id, record);
        try {
            record.preparing = (async () => {
                await mkdir(directory, { mode: 0o700 });
                record.controller.signal.throwIfAborted();
                const names = request.terminal === undefined
                    ? ['stdout', 'stderr', ...(request.stdio?.stdin === 'pipe' ? ['stdin'] : []), ...(request.stdio?.control === 'pipe' ? ['control'] : [])]
                    : ['terminal'];
                for (const name of names) {
                    record.endpoints[name] = await this.endpoint(join(directory, name));
                    record.controller.signal.throwIfAborted();
                }
            })();
            await record.preparing;
            return {
                id,
                streams: Object.fromEntries(Object.entries(record.endpoints).map(([name, endpoint]) => [name, { path: endpoint.path, capability: endpoint.capability }])),
            };
        }
        catch (error) {
            await this.release(id);
            throw error;
        }
    }
    /**
     * Start once all data channels are authenticated; duplicate starts refuse.
     * @param id - the prepared process reservation.
     * @param signal - cancellation of pending process publication.
     * @returns the terminal pid when the request owns a PTY.
     */
    async start(id, signal) {
        const record = this.record(id);
        if (record.start !== undefined)
            throw new Error('SSH process launch was already requested');
        signal?.throwIfAborted();
        const abort = () => { record.controller.abort(signal?.reason); };
        signal?.addEventListener('abort', abort, { once: true });
        record.start = this.startOnce(id, record);
        try {
            await record.start;
        }
        catch (error) {
            // AbortSignal reasons need not be Errors; retain the caller's rejection.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            const failed = Promise.reject(error);
            void failed.catch(() => { });
            record.done = failed;
            await this.finishFailed(id, record, failed);
            throw error;
        }
        finally {
            signal?.removeEventListener('abort', abort);
        }
        return record.terminal === undefined ? {} : { pid: record.terminal.pid };
    }
    async startOnce(id, record) {
        await Promise.all(Object.values(record.endpoints).map(endpoint => endpoint.connected));
        clearTimeout(record.expiry);
        if (this.closing)
            throw new Error('SSH helper is closing');
        record.controller.signal.throwIfAborted();
        const request = record.request;
        const cwd = this.ctx.fs.processPath(await this.ctx.fs.resolve(request.cwd, { signal: record.controller.signal }));
        record.controller.signal.throwIfAborted();
        const env = request.env === undefined ? {} : Object.fromEntries(Object.entries(request.env).map(([key, value]) => [key, value ?? undefined]));
        if (request.terminal !== undefined) {
            const terminal = await this.ctx.subprocess.spawnTerminal({
                argv: request.argv, cwd,
                env: Object.fromEntries(Object.entries(env).filter((entry) => entry[1] !== undefined)),
                graceMs: request.graceMs, ...request.terminal,
                signal: record.controller.signal,
            });
            record.terminal = terminal;
            record.controller.signal.throwIfAborted();
            const socket = await record.endpoints.terminal.connected;
            const output = pipeline(terminal.output, socket).catch(() => { });
            const done = terminal.done.then(outcome => ({ outcome, spills: {}, collected: {} }));
            record.done = done;
            void done.then(async () => {
                if (request.terminal?.shellActivity === true) {
                    await output;
                    return;
                }
                await terminal.terminate();
                await output;
                await this.rememberCompleted(id, record, done);
            }, () => this.finishFailed(id, record, done)).catch(() => { });
            return;
        }
        const stdio = request.stdio;
        const spec = { argv: request.argv, cwd, env, graceMs: request.graceMs, signal: record.controller.signal,
            stdio: { stdin: stdio.stdin, stdout: 'pipe', stderr: 'pipe', ...(stdio.control === undefined ? {} : { control: stdio.control }) },
        };
        const ordinary = this.ctx.subprocess.spawn(spec);
        record.ordinary = ordinary;
        const control = ordinary.control;
        if (record.endpoints.control !== undefined && control === undefined) {
            void ordinary.done.catch(() => { });
            throw new Error('Remote subprocess provider did not establish fd 7');
        }
        const collectors = {};
        const stopCapture = [];
        const forwarders = [];
        const forwarded = [];
        const streams = [];
        for (const name of ['stdout', 'stderr']) {
            const stream = ordinary[name];
            const mode = stdio[name];
            const socket = await record.endpoints[name].connected;
            if (typeof mode === 'object') {
                const binding = prepareManagedProcessBinding({ onSpillFailure: this.reportSpillFailure });
                const collector = new OutputCollector(mode.maxBytes, name, mode.spill === undefined ? undefined : {
                    maxBytes: mode.spill.maxBytes, dir: binding.spillDir, onFailure: binding.onSpillFailure,
                });
                collectors[name] = collector;
                const forwarder = new CollectedOutputForwarder(socket, collector, mode.maxBytes);
                forwarders.push(forwarder);
                const receive = (chunk) => { collector.push(chunk); forwarder.offer(); };
                stream.on('data', receive);
                stopCapture.push(() => {
                    stream.off('data', receive);
                    stream.destroy();
                    collector.seal();
                });
            }
            else {
                streams.push(pipeline(stream, socket).catch(() => { }));
            }
        }
        if (record.endpoints.stdin !== undefined) {
            const socket = await record.endpoints.stdin.connected;
            socket.end();
            void pipeline(socket, ordinary.stdin).catch(() => { });
        }
        if (record.endpoints.control !== undefined) {
            const channel = control;
            const socket = await record.endpoints.control.connected;
            socket.pipe(channel).pipe(socket);
            socket.on('error', () => { channel.destroy(); });
            channel.on('error', () => { socket.destroy(); });
            streams.push(finished(socket, { readable: false, cleanup: true }).catch(() => { }));
        }
        const done = ordinary.done.finally(() => {
            for (const stop of stopCapture)
                stop();
        }).then(async (outcome) => {
            for (const forwarder of forwarders)
                forwarded.push(forwarder.finish());
            // A paused output reader may defer EOF, but must not retain the process-range owner.
            await Promise.race([
                Promise.all(streams),
                new Promise((resolve) => { const timer = setTimeout(resolve, request.graceMs); timer.unref(); }),
            ]);
            const spills = {};
            const collected = {};
            for (const name of ['stdout', 'stderr']) {
                const collector = collectors[name];
                if (collector === undefined)
                    continue;
                const snapshot = collector.snapshot();
                collected[name] = { tail: snapshot.bytes.toString('base64'), totalBytes: snapshot.totalBytes };
                const path = collector.readFrom(0).spillPath;
                if (path !== undefined)
                    spills[name] = path;
            }
            return { outcome, spills, collected };
        });
        record.done = done;
        void done.then(async () => {
            await ordinary.waitForExit();
            await Promise.all([...streams, ...forwarded]);
            await this.rememberCompleted(id, record, done);
        }, () => this.finishFailed(id, record, done)).catch(() => { });
    }
    /**
     * Await the direct result without claiming all descendants have exited.
     * @param id - the started process reservation.
     * @returns the exit observation and remote spill paths.
     * @throws the original startup or process failure while its completion is retained.
     */
    async done(id) {
        if (this.completed.has(id))
            return this.completed.get(id);
        const record = this.record(id);
        if (record.start === undefined)
            throw new Error('SSH process has not started');
        await record.start;
        return record.done;
    }
    /**
     * Observe the native managed range used for termination.
     * @param id - the started process reservation.
     * @param signal - cancellation of this observation, leaving ownership intact.
     * @returns whether the owned process range is empty.
     */
    async wait(id, signal) {
        if (this.completed.has(id))
            return true;
        const record = this.record(id);
        await record.start;
        if (record.ordinary !== undefined)
            return record.ordinary.waitForExit(signal);
        if (record.terminal !== undefined) {
            await record.terminal.terminate();
            return true;
        }
        throw new Error('SSH process was not started');
    }
    /**
     * Terminate and await the managed range independently of output readers.
     * @param id - the process reservation to stop.
     */
    async terminate(id) {
        if (this.completed.has(id))
            return;
        const record = this.record(id);
        record.controller.abort(new Error('SSH process termination requested'));
        record.ordinary?.terminate();
        if (record.ordinary !== undefined)
            await record.ordinary.waitForExit();
        if (record.terminal !== undefined) {
            await record.terminal.terminate();
            if (record.request.terminal?.shellActivity === true && record.done !== undefined) {
                await this.rememberCompleted(id, record, record.done);
            }
        }
        if (record.ordinary === undefined && record.terminal === undefined)
            await this.release(id);
    }
    /**
     * Operate on the terminal owned by the request id.
     * @param id - the terminal reservation.
     * @param operation - terminal input, foreground observation, or signal delivery.
     * @param value - input bytes as text or the signal name.
     * @returns the operation's wire result.
     */
    async terminal(id, operation, value) {
        const terminal = this.record(id).terminal;
        if (terminal === undefined)
            throw new Error('SSH handle does not own a terminal');
        if (operation === 'write') {
            await terminal.write(z.string().parse(value));
            return null;
        }
        if (operation === 'inspect')
            return await terminal.inspectForeground() ?? null;
        if (operation === 'activity')
            return terminal.inspectActivity();
        return terminal.signalForeground(z.enum(['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGTSTP', 'SIGHUP']).parse(value));
    }
    /**
     * Resize an allocated terminal without replacing its process.
     * @param id - terminal reservation.
     * @param cols - positive terminal width.
     * @param rows - positive terminal height.
     * @returns after the local provider accepts the dimensions.
     */
    async resizeTerminal(id, cols, rows) {
        const terminal = this.record(id).terminal;
        if (terminal === undefined)
            throw new Error('SSH handle does not own a terminal');
        await terminal.resize(cols, rows);
    }
    /** Stop every owned process on lease expiry or disconnect. */
    async close() {
        if (this.closing)
            return;
        this.closing = true;
        const releases = [...this.records.keys()].map(id => this.release(id));
        const outcomes = await Promise.allSettled([...releases, ...this.cleanups]);
        const errors = [...new Set(outcomes.flatMap(result => result.status === 'rejected' ? [result.reason] : []))];
        if (errors.length > 0)
            throw new AggregateError(errors, 'SSH remote process cleanup failed');
    }
    async release(id) {
        const record = this.record(id);
        record.release ??= this.trackCleanup(async () => {
            clearTimeout(record.expiry);
            record.controller.abort(new Error('SSH process reservation closed'));
            await record.preparing?.catch(() => { });
            await Promise.all(Object.values(record.endpoints).map(closeEndpoint));
            await record.start?.catch(() => { });
            record.ordinary?.terminate();
            if (record.ordinary !== undefined)
                await record.ordinary.waitForExit();
            if (record.terminal !== undefined)
                await record.terminal.terminate();
            this.records.delete(id);
            await rm(record.directory, { recursive: true, force: true });
        });
        await record.release;
    }
    record(id) {
        const record = this.records.get(id);
        if (record === undefined)
            throw new Error('Unknown or expired SSH process handle');
        return record;
    }
    async finishFailed(id, record, result) {
        clearTimeout(record.expiry);
        record.ordinary?.terminate();
        if (record.ordinary !== undefined)
            await record.ordinary.waitForExit();
        if (record.terminal !== undefined)
            await record.terminal.terminate();
        await this.rememberCompleted(id, record, result);
    }
    async rememberCompleted(id, record, result) {
        if (this.records.get(id) !== record || record.release !== undefined)
            return;
        const cleanup = this.trackCleanup(async () => {
            await Promise.all(Object.values(record.endpoints).map(closeEndpoint));
            await rm(record.directory, { recursive: true, force: true });
        });
        this.records.delete(id);
        this.completed.set(id, result);
        if (this.completed.size > this.limit * 4)
            this.completed.delete(this.completed.keys().next().value);
        await cleanup;
    }
    trackCleanup(work) {
        const pending = Promise.resolve().then(work);
        this.cleanups.add(pending);
        return pending.finally(() => { this.cleanups.delete(pending); });
    }
    async endpoint(path) {
        const connected = Promise.withResolvers();
        const capability = randomBytes(32);
        const server = createServer({
            ...SSH_STREAM_TLS_OPTIONS, allowHalfOpen: true, handshakeTimeout: this.preparationMs,
            pskCallback: (_socket, identity) => identity === 'dsh-stream' ? capability : null,
        });
        const endpoint = { path, capability: capability.toString('hex'), server, connected: connected.promise, pending: new Set() };
        server.maxConnections = 8;
        void connected.promise.catch(() => { });
        server.on('connection', (socket) => {
            endpoint.pending.add(socket);
            socket.once('close', () => { endpoint.pending.delete(socket); });
        });
        server.on('tlsClientError', (_error, socket) => { socket.destroy(); });
        server.on('secureConnection', (socket) => {
            if (endpoint.socket !== undefined) {
                socket.destroy();
                return;
            }
            socket.disableRenegotiation();
            socket.pause();
            socket.on('error', () => { });
            endpoint.socket = socket;
            server.close();
            connected.resolve(socket);
        });
        server.on('error', (error) => { connected.reject(error); });
        server.on('close', () => { if (endpoint.socket === undefined)
            connected.reject(new Error('SSH stream reservation closed')); });
        try {
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
            await chmod(path, 0o600);
            return endpoint;
        }
        catch (error) {
            await closeEndpoint(endpoint);
            throw error;
        }
    }
}
//# sourceMappingURL=helper-processes.js.map