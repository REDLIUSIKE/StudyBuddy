/** One PTY, a bounded terminal emulator and its detachable browser followers. */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { createLazyRequire } from '@deepseek-ai/dsh-lazy-require';
import { TerminalFollower } from "./stream.js";
import { TerminalRetention } from "./retention.js";
const requireHeadless = createLazyRequire('@xterm/headless', import.meta.url);
const requireSerialize = createLazyRequire('@xterm/addon-serialize', import.meta.url);
/** Process lifetime is independent of follower and component lifetimes. */
export class BrowserTerminal {
    handle;
    info;
    maxBufferedBytes;
    screen;
    serializer;
    followers = new Set();
    sequence = 0;
    operations = Promise.resolve();
    drained;
    closing;
    retention;
    controller;
    /**
     * @param handle - allocated terminal process range.
     * @param info - initial metadata.
     * @param scrollback - maximum retained scrollback rows.
     * @param maxBufferedBytes - per-follower queue cap.
     */
    constructor(handle, info, scrollback, maxBufferedBytes) {
        this.handle = handle;
        this.info = info;
        this.maxBufferedBytes = maxBufferedBytes;
        const { Terminal } = requireHeadless();
        const { SerializeAddon } = requireSerialize();
        this.screen = new Terminal({ cols: info.cols, rows: info.rows, scrollback, allowProposedApi: true });
        this.serializer = new SerializeAddon();
        this.screen.loadAddon(this.serializer);
        this.drained = this.consume();
    }
    /**
     * Start monitoring after this allocation is committed to its Session owner.
     * @param policy - validated Host timing policy.
     * @param closing - closes the id before any asynchronous termination.
     * @param closed - removes the exact successfully terminated owner record.
     * @param failed - diagnostic sink for background cleanup failure.
     */
    monitor(policy, closing, closed, failed) {
        this.retention = new TerminalRetention(policy, () => this.handle.inspectActivity(), async () => {
            closing();
            await this.closeProcess();
            closed();
        }, failed);
    }
    /**
     * Retain this committed process independently of output attachment.
     * @param signal - physical window stream lifetime.
     * @returns its hold acknowledgement and lifetime.
     */
    retain(signal) {
        if (this.retention === undefined)
            throw new Error('Terminal has not been committed');
        return this.retention.retain(signal);
    }
    /**
     * Attach with exclusive input control; an older attachment becomes read-only.
     * @param id - browser attachment identity.
     * @param signal - attachment cancellation; never terminates the process.
     * @returns a consistent screen followed by ordered output and state changes.
     */
    async *follow(id, signal) {
        signal.throwIfAborted();
        const follower = new TerminalFollower(this.maxBufferedBytes);
        const baseline = await this.enqueue(() => {
            signal.throwIfAborted();
            this.controller = { id, follower };
            this.info = { ...this.info, controllerId: id };
            this.broadcast({ type: 'state', info: this.info });
            const snapshot = { type: 'snapshot', sequence: this.sequence, screen: this.serializer.serialize(), info: this.info };
            this.followers.add(follower);
            return snapshot;
        });
        try {
            yield baseline;
            yield* follower.read(signal);
        }
        finally {
            this.followers.delete(follower);
            follower.close();
            if (this.controller?.follower === follower) {
                this.controller = undefined;
                const { controllerId: _controllerId, ...info } = this.info;
                this.info = info;
                this.broadcast({ type: 'state', info });
            }
        }
    }
    /**
     * Send raw terminal input without command interpretation.
     * @param id - current writable attachment.
     * @param data - UTF-8 input, including shell completion/control keys.
     * @returns when the provider accepts the input.
     */
    write(id, data) {
        this.retention?.invalidate();
        return this.enqueue(async () => { this.requireController(id); await this.handle.write(data); });
    }
    /**
     * Resize the PTY and recovery screen in the same operation order as output.
     * @param id - current writable attachment.
     * @param cols - validated column count.
     * @param rows - validated row count.
     * @returns when the provider and emulator use the new dimensions.
     */
    resize(id, cols, rows) {
        return this.enqueue(async () => {
            this.requireController(id);
            await this.handle.resize(cols, rows);
            this.screen.resize(cols, rows);
            this.info = { ...this.info, cols, rows };
            this.broadcast({ type: 'state', info: this.info });
        });
    }
    /**
     * Publish a display name to every attached view.
     * @param title - validated user title.
     */
    rename(title) {
        this.info = { ...this.info, title };
        this.broadcast({ type: 'state', info: this.info });
    }
    /**
     * Terminate the complete provider-owned process range before releasing its screen.
     * @returns after process cleanup and final output drainage; failures remain retryable.
     */
    close() {
        return this.retention?.close() ?? this.closeProcess();
    }
    /**
     * Stop unattended cleanup scheduling and await final process cleanup.
     * @returns after terminal and monitor quiescence.
     */
    dispose() { return this.retention?.dispose() ?? this.closeProcess(); }
    closeProcess() {
        if (this.closing !== undefined)
            return this.closing;
        this.closing = (async () => {
            await this.handle.terminate();
            await this.drained;
            for (const follower of this.followers)
                follower.finish();
            this.followers.clear();
            this.screen.dispose();
        })().catch((error) => { this.closing = undefined; throw error; });
        return this.closing;
    }
    requireController(id) {
        if (this.closing !== undefined || this.info.state !== 'running')
            throw new RemoteError('terminal/control-unavailable', 'Terminal is not running', { reason: 'not-running' });
        if (this.controller?.id !== id)
            throw new RemoteError('terminal/control-unavailable', 'Terminal input is controlled by another attachment', { reason: 'read-only' });
    }
    broadcast(frame) {
        for (const follower of this.followers)
            follower.push(frame);
    }
    enqueue(operation) {
        const pending = this.operations.then(operation);
        this.operations = pending.catch(() => { });
        return pending;
    }
    async consume() {
        const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
        const outcome = this.handle.done.then(value => ({ value }), (error) => ({ error }));
        try {
            for await (const chunk of this.handle.output) {
                // Node Readable's iterator is untyped; this provider explicitly emits Buffer chunks.
                const data = decoder.decode(chunk, { stream: true });
                await this.output(data);
            }
            await this.output(decoder.decode());
            const result = await outcome;
            if ('error' in result)
                throw result.error;
            this.info = { ...this.info, state: 'exited', exitCode: result.value.exitCode };
        }
        catch (error) {
            this.info = { ...this.info, state: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
        this.broadcast({ type: 'state', info: this.info });
    }
    async output(data) {
        if (data.length === 0)
            return;
        await this.enqueue(async () => {
            await new Promise((resolve) => { this.screen.write(data, resolve); });
            this.broadcast({ type: 'output', sequence: ++this.sequence, data });
        });
    }
}
//# sourceMappingURL=terminal.js.map