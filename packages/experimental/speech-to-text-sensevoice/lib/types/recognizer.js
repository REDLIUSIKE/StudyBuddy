var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
/** One serial SenseVoice worker with request-owned cancellation and idle reclamation. */
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { deadline } from '@deepseek-ai/dsh-timeout';
import { z } from 'zod';
import { SpeechInputError } from "./input.js";
import { SpeechDownloadError } from "./download-error.js";
import { inspectRuntime, prepareRuntime } from "./runtime.js";
const transcriptSchema = z.object({
    text: z.string(), audioSeconds: z.number().nonnegative(), inferenceSeconds: z.number().nonnegative(),
}).strict();
/** Wait for a cancellable operation without losing ownership of its eventual settlement. */
function waitFor(pending, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => { reject(signal.reason instanceof Error ? signal.reason : new Error('Speech operation cancelled')); };
        signal.addEventListener('abort', abort, { once: true });
        void pending.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort); });
    });
}
/**
 * Read one bounded worker readiness frame and reject exit before readiness.
 * @param handle - newly spawned worker with piped stdout.
 * @param limit - maximum readiness bytes.
 * @param signal - startup deadline or caller cancellation.
 * @returns dynamically allocated loopback port.
 */
export async function readReady(handle, limit, signal) {
    if (!handle.stdout)
        throw new Error('Speech worker stdout is unavailable');
    signal.throwIfAborted();
    const stdout = handle.stdout;
    let text = '';
    const pending = Promise.withResolvers();
    const data = (chunk) => {
        text += chunk.toString('utf8');
        if (Buffer.byteLength(text) > limit) {
            pending.reject(new Error('Speech worker readiness exceeded its byte limit'));
            return;
        }
        const end = text.indexOf('\n');
        if (end < 0)
            return;
        try {
            const value = z.object({ port: z.number().int().min(1).max(65535) }).strict().parse(JSON.parse(text.slice(0, end)));
            pending.resolve(value.port);
        }
        catch (error) {
            pending.reject(new Error('Invalid speech worker readiness', { cause: error }));
        }
    };
    stdout.on('data', data);
    stdout.on('error', pending.reject);
    void handle.done.then(() => {
        pending.reject(new Error(`Speech worker exited before readiness: ${handle.collected.stderr?.readFrom(0).text}`));
    }, pending.reject);
    try {
        return await waitFor(pending.promise, signal);
    }
    finally {
        stdout.off('data', data);
        stdout.off('error', pending.reject);
        stdout.resume();
    }
}
/**
 * Decode a bounded worker HTTP response; malformed worker output fails the request.
 * @param response - private authenticated worker response.
 * @param limit - maximum bytes retained before JSON parsing.
 * @returns validated final transcript; marked input rejections throw SpeechInputError.
 */
export async function readTranscript(response, limit) {
    if (!response.body)
        throw new Error('Speech worker returned no response');
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            length += value.length;
            if (length > limit)
                throw new Error('Speech transcript exceeded its byte limit');
            chunks.push(value);
        }
    }
    finally {
        await reader.cancel();
        reader.releaseLock();
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!response.ok) {
        const failure = z.object({ error: z.string(), code: z.literal('invalid-input').optional() }).parse(value);
        if ((response.status === 400 || response.status === 413) && failure.code === 'invalid-input') {
            throw new SpeechInputError(failure.error);
        }
        throw new Error(failure.error);
    }
    return transcriptSchema.parse(value);
}
/** Own one worker across recordings, and join every accepted job on disposal. */
export class SenseVoiceWorker {
    ctx;
    config;
    worker;
    tail = Promise.resolve();
    pending = 0;
    lifetime = new AbortController();
    idle;
    runtime;
    state;
    listeners = new Set();
    lastProgressAt = 0;
    /** Configured origins available for explicit downloads; offline deployments expose no choices. */
    downloadSources;
    preparing;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.downloadSources = config.modelDirectory !== undefined && config.vadModelPath !== undefined ? []
            : [...new Set((config.modelOrigin === undefined ? config.modelOrigins : [config.modelOrigin]).map(origin => new URL(origin).origin))];
        const kinds = ['check'];
        if (config.modelDirectory === undefined)
            kinds.push('model');
        if (config.vadModelPath === undefined)
            kinds.push('vad');
        kinds.push('verify', 'load');
        this.state = { phase: 'unprepared', steps: kinds.map(kind => ({ kind, status: 'pending' })) };
    }
    /**
     * Read preparation readiness.
     * @returns the current Host-owned state.
     */
    snapshot() { return this.state; }
    /**
     * Observe readiness.
     * @param listener - invalidation callback.
     * @returns subscription disposer.
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    publish(state) {
        if (this.preparing && ['ready', 'standby', 'unprepared', 'failed', 'cancelled'].includes(state.phase)) {
            this.preparing.completed = true;
        }
        const previous = this.state;
        const steps = state.steps ?? previous.steps.map((item) => {
            if (state.phase === 'ready')
                return { ...item, status: 'complete' };
            if (state.step === 'check' && item.kind !== 'check')
                return { kind: item.kind, status: 'pending' };
            if (state.step === item.kind)
                return item.status === 'running' ? item
                    : { kind: item.kind, status: 'running', startedAt: Date.now() };
            if (item.status !== 'running')
                return item;
            if (state.phase === 'standby')
                return { ...item, status: 'cancelled' };
            if (state.phase === 'failed' || state.phase === 'cancelled')
                return { ...item, status: state.phase };
            return state.step === undefined ? item : { ...item, status: 'complete' };
        });
        this.state = { ...state, steps };
        const now = performance.now();
        if (state.phase === 'downloading' && previous.phase === 'downloading' && state.resource === previous.resource
            && state.completedBytes !== state.totalBytes && now - this.lastProgressAt < this.config.progressIntervalMs)
            return;
        this.lastProgressAt = now;
        for (const listener of this.listeners)
            listener();
    }
    /** Inspect disk caches on activation; valid resources enter standby without starting a worker. */
    inspect() {
        this.runPreparation(async (signal) => {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const inspection = __addDisposableResource(env_1, deadline(signal, this.config.prepareTimeoutMs, 'SPEECH_PREPARE_TIMEOUT'), false);
                this.publish({ phase: 'checking', step: 'check', startedAt: Date.now() });
                const runtime = await inspectRuntime(this.config, inspection.signal);
                inspection.signal.throwIfAborted();
                this.runtime = runtime;
                this.publish({ phase: runtime ? 'standby' : 'unprepared', steps: this.state.steps.map(({ kind }) => ({ kind,
                        status: kind === 'check' || runtime && kind !== 'load' ? 'complete' : 'pending',
                    })) });
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        });
    }
    /**
     * Start or join one Host-owned preparation task with a fixed download source.
     * @param options - omitted source uses deployment policy; a manual source must be advertised and disables fallback.
     */
    prepare(options = {}) {
        const source = options.downloadSource;
        if (source !== undefined && !this.downloadSources.includes(source))
            throw new Error('Speech download source is unavailable');
        const config = source === undefined ? this.config : Object.assign({}, this.config, { modelOrigin: source });
        this.runPreparation(async (signal) => { await this.start(signal, config); }, source);
    }
    runPreparation(run, downloadSource) {
        if (this.preparing && this.preparing.downloadSource !== downloadSource)
            throw new Error('Cancel preparation before changing its download source');
        if (this.preparing || this.worker)
            return;
        this.lifetime.signal.throwIfAborted();
        const abort = new AbortController();
        const task = { abort, settled: Promise.resolve(), completed: false, downloadSource };
        this.preparing = task;
        task.settled = this.enqueue(run, abort.signal)
            .catch((error) => {
            if (this.lifetime.signal.aborted)
                return;
            this.publish(abort.signal.aborted ? { phase: 'cancelled' }
                : { phase: 'failed', message: error instanceof Error ? error.message : String(error),
                    ...error instanceof SpeechDownloadError ? { download: error.download } : {} });
        }).finally(() => { this.preparing = undefined; });
    }
    /** Cancel unfinished preparation; completed readiness is retained. @returns after its queued or active work settles. */
    async cancel() {
        const task = this.preparing;
        if (!task)
            return;
        if (!task.completed) {
            this.publish({ phase: 'cancelling', startedAt: Date.now() });
            task.abort.abort(new Error('Speech preparation cancelled'));
        }
        await task.settled;
    }
    /**
     * Queue one bounded recording; cancellation never leaves inference running after settlement.
     * Verified resources accept recordings while the worker wakes; other preparation states reject without downloading.
     * @param input - complete WAV and language hint.
     * @param signal - caller cancellation.
     * @returns recognized text; cancelled waiting jobs never acquire the worker.
     */
    async transcribe(input, signal) {
        return await this.enqueue(async (combined) => await this.execute(input, combined), signal);
    }
    async enqueue(run, signal) {
        const combined = AbortSignal.any([signal, this.lifetime.signal]);
        combined.throwIfAborted();
        if (this.pending >= this.config.maxPending)
            throw new Error('Speech transcription queue is full');
        clearTimeout(this.idle);
        this.pending++;
        const job = this.tail.then(async () => {
            combined.throwIfAborted();
            return await run(combined);
        });
        this.tail = job.then(() => undefined, () => undefined).finally(() => {
            this.pending--;
            if (this.pending === 0 && !this.lifetime.signal.aborted && this.config.idleTimeoutMs > 0) {
                this.idle = setTimeout(() => {
                    this.tail = this.tail.then(async () => { await this.stop(); });
                    void this.tail.catch((error) => { this.ctx.logger.warn('Speech worker idle cleanup failed', error); });
                }, this.config.idleTimeoutMs);
            }
        });
        return await job;
    }
    async start(signal, preparationConfig = this.config) {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            if (this.worker?.closed)
                await this.stop();
            if (this.worker)
                return this.worker;
            const setup = __addDisposableResource(env_2, deadline(signal, this.config.prepareTimeoutMs, 'SPEECH_PREPARE_TIMEOUT'), false);
            const cached = this.runtime !== undefined;
            if (!cached)
                this.publish({ phase: 'checking', step: 'check', startedAt: Date.now() });
            const runtime = this.runtime ?? await prepareRuntime(this.ctx, preparationConfig, setup.signal, (state) => { this.publish(state); });
            this.runtime = runtime;
            setup.signal.throwIfAborted();
            this.publish({ phase: cached ? 'waking' : 'loading', step: 'load', startedAt: Date.now() });
            await mkdir(this.config.dataRoot, { recursive: true });
            const token = randomBytes(32).toString('hex');
            const handle = this.ctx.subprocess.spawn({
                argv: [process.execPath, ...runtime.worker.endsWith('.ts') ? ['--import', import.meta.resolve('tsx/esm')] : [], runtime.worker, JSON.stringify(Object.assign({}, this.config, runtime))],
                cwd: this.config.dataRoot, graceMs: this.config.graceMs,
                env: { DSH_SPEECH_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' },
                stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: this.config.maxLogBytes } },
            });
            try {
                const port = await readReady(handle, this.config.maxLogBytes, setup.signal);
                const worker = { handle, url: `http://127.0.0.1:${port}`, token, closed: false };
                this.worker = worker;
                this.publish({ phase: 'ready' });
                const exited = () => {
                    if (!worker.closed) {
                        worker.closed = true;
                        this.publish({ phase: 'standby' });
                    }
                };
                void handle.done.then(exited, exited);
                return worker;
            }
            catch (error) {
                handle.terminate();
                await handle.waitForExit();
                throw error;
            }
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    async execute(input, signal) {
        const phase = this.state.phase;
        if (phase !== 'ready' && phase !== 'standby')
            throw new Error('Prepare the local speech provider before recording');
        try {
            const env_3 = { stack: [], error: void 0, hasError: false };
            try {
                const worker = await this.start(signal);
                const call = __addDisposableResource(env_3, deadline(signal, this.config.inferenceTimeoutMs, 'SPEECH_INFERENCE_TIMEOUT'), false);
                const response = await fetch(`${worker.url}/transcribe?language=${encodeURIComponent(input.language)}`, {
                    method: 'POST', headers: { authorization: `Bearer ${worker.token}`, 'content-type': 'audio/wav' },
                    body: Buffer.from(input.audio), signal: call.signal,
                });
                const result = await readTranscript(response, this.config.maxResponseBytes).catch((error) => {
                    call.signal.throwIfAborted();
                    throw error;
                });
                call.signal.throwIfAborted();
                return result;
            }
            catch (e_3) {
                env_3.error = e_3;
                env_3.hasError = true;
            }
            finally {
                __disposeResources(env_3);
            }
        }
        catch (error) {
            if (error instanceof SpeechInputError)
                throw error;
            await this.stop();
            this.publish({ phase: 'standby' });
            throw error;
        }
    }
    async stop() {
        const worker = this.worker;
        if (!worker)
            return;
        worker.closed = true;
        worker.handle.terminate();
        await worker.handle.waitForExit();
        this.worker = undefined;
        this.publish({ phase: 'standby' });
    }
    /** Stop the local recognizer. @returns after admission closes, queued jobs settle, and the managed worker exits. */
    async dispose() {
        this.listeners.clear();
        this.lifetime.abort(new Error('SenseVoice provider disposed'));
        clearTimeout(this.idle);
        try {
            await this.tail;
        }
        finally {
            await this.stop();
        }
        await this.preparing?.settled;
    }
}
//# sourceMappingURL=recognizer.js.map