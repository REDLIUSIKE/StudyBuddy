/** React-free browser terminal state and reconnecting Remote-stream ownership. */
import { preferredShell, rememberShell } from "./shell-preference.js";
import { randomUUID } from '@deepseek-ai/dsh-util-crypto';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client';
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol';
class TerminalViewError extends RemoteError {
    constructor(issue, message = issue) { super('terminal/view', message, { issue }); }
}
/** A view survives DOM unmount; its process only ends on explicit close. */
export class TerminalView {
    sessionId;
    remote;
    gateway;
    id;
    createWhenMissing;
    shellPath;
    retain;
    /** Observable controls, process metadata and the next screen update awaiting acknowledgement. */
    state = createSnapshotStore({ phase: 'idle', writable: false });
    lifetime = new AbortController();
    stream;
    mounted = false;
    attachmentId;
    pendingRender;
    revision = 0;
    creation;
    loading;
    closing;
    writes = Promise.resolve();
    queuedInput = 0;
    detaching = new Set();
    /**
     * @param sessionId - Session owning the terminal.
     * @param remote - typed terminal Remote operations.
     * @param gateway - reconnecting stream factory.
     * @param id - Host terminal identity, reused when recovering an item from its Session list.
     * @param createWhenMissing - allow allocation only for a new tab, never a listed terminal.
     * @param shellPath - explicit shell chosen at the guide; omission uses the remembered available shell.
     * @param retain - window hold acknowledgement required before output attachment.
     */
    constructor(sessionId, remote, gateway, id, createWhenMissing = true, shellPath, retain) {
        this.sessionId = sessionId;
        this.remote = remote;
        this.gateway = gateway;
        this.id = id;
        this.createWhenMissing = createWhenMissing;
        this.shellPath = shellPath;
        this.retain = retain;
    }
    /**
     * Attach the DOM lifetime, starting the chosen shell or reconnecting the saved process.
     * @returns a detach callback that leaves the terminal process alive.
     */
    mount() {
        this.mounted = true;
        if (this.state.getSnapshot().info === undefined)
            void this.refresh();
        else
            this.connect();
        return () => {
            this.mounted = false;
            this.detach();
        };
    }
    /**
     * Start or recover this tab, deduplicating mounts and retries during allocation.
     * Only a new tab may allocate a shell; listed terminals cannot be silently replaced.
     * @returns after environment lookup and creation or recovery settle.
     */
    refresh() {
        if (this.creation !== undefined)
            return this.creation;
        if (this.loading !== undefined)
            return this.loading;
        if (this.closing !== undefined || this.lifetime.signal.aborted)
            return Promise.resolve();
        this.patch({ phase: 'loading', error: undefined, issue: undefined });
        this.loading = (async () => {
            const [environment, available] = await Promise.all([
                this.remote.environment(this.sessionId, this.lifetime.signal), this.remote.list(this.sessionId),
            ]);
            if (this.stopped())
                return;
            this.patch({ environment: valueOf(environment) });
            const info = valueOf(available).find(item => item.id === this.id);
            if (info !== undefined)
                this.adopt(info);
            else if (this.createWhenMissing) {
                let path = this.shellPath;
                if (path === undefined) {
                    const shells = valueOf(await this.remote.shells(this.sessionId, this.lifetime.signal));
                    const previous = preferredShell();
                    path = shells.find(shell => shell.path === previous)?.path ?? shells[0]?.path;
                }
                if (this.stopped())
                    return;
                if (path !== undefined)
                    rememberShell(path);
                await this.create(valueOf(environment), path);
            }
            else
                throw new TerminalViewError('missingTerminal');
        })().catch((error) => { this.fail(error); }).finally(() => { this.loading = undefined; });
        return this.loading;
    }
    stopped() { return this.lifetime.signal.aborted || this.closing !== undefined; }
    async create(environment, shellPath) {
        this.patch({ phase: 'creating', error: undefined, issue: undefined });
        this.creation = (async () => {
            const info = valueOf(await this.remote.create(this.sessionId, {
                id: this.id, ...shellPath === undefined ? {} : { shellPath },
                cols: Math.min(80, environment.maxCols), rows: Math.min(24, environment.maxRows),
            }, this.lifetime.signal));
            if (!this.lifetime.signal.aborted) {
                this.adopt(info);
            }
        })().catch((error) => { this.fail(error); }).finally(() => { this.creation = undefined; });
        await this.creation;
    }
    adopt(info) {
        this.patch({ info, title: info.title });
        if (this.retain === undefined) {
            if (this.mounted && this.closing === undefined)
                this.connect();
            return;
        }
        void this.retain(this.lifetime.signal).then(() => {
            if (this.mounted && this.closing === undefined)
                this.connect();
        }).catch((error) => { if (!this.stopped())
            this.fail(error); });
    }
    /** Reattach with a fresh screen and regain input control. */
    connect() {
        const info = this.state.getSnapshot().info;
        if (info === undefined || !this.mounted || this.closing !== undefined || this.lifetime.signal.aborted)
            return;
        this.detach();
        const stream = this.gateway.$stream({
            name: 'Browser terminal output',
            open: async function* (signal) {
                await this.retain?.(signal);
                signal.throwIfAborted();
                const attachmentId = randomUUID();
                this.attachmentId = attachmentId;
                yield* this.remote.follow(this.sessionId, info.id, attachmentId, signal);
            }.bind(this),
            ended: () => new TerminalViewError('attachmentEnded'),
            carrierFailed: () => { if (this.stream === stream)
                this.patch({ phase: 'disconnected', writable: false }); },
        });
        this.stream = stream;
        this.patch({ phase: 'connecting', writable: false, error: undefined, issue: undefined, render: undefined });
        void this.consume(stream);
    }
    /**
     * Release the next stream item after xterm has parsed this frame.
     * @param revision - locally delivered render revision.
     */
    acknowledge(revision) {
        if (this.pendingRender?.revision !== revision)
            return;
        this.pendingRender.resolve();
        this.pendingRender = undefined;
    }
    /**
     * Serialize raw input so concurrent RPC requests cannot reorder keystrokes.
     * @param data - input from the terminal emulator.
     */
    write(data) {
        const state = this.state.getSnapshot();
        const attachmentId = this.attachmentId;
        if (!state.writable || state.info === undefined || attachmentId === undefined)
            return;
        const bytes = new TextEncoder().encode(data).byteLength;
        if (this.queuedInput + bytes > (state.environment?.maxInputBytes ?? 0)) {
            this.fail(new TerminalViewError('inputFull'));
            return;
        }
        this.queuedInput += bytes;
        const id = state.info.id;
        this.writes = this.writes.then(async () => {
            if (this.attachmentId !== attachmentId || !this.state.getSnapshot().writable)
                return;
            valueOf(await this.remote.write(this.sessionId, id, attachmentId, data));
        }).catch((error) => { if (this.attachmentId === attachmentId)
            this.fail(error); }).finally(() => { this.queuedInput -= bytes; });
    }
    /**
     * Resize only from the currently writable view.
     * @param cols - measured column count.
     * @param rows - measured row count.
     */
    resize(cols, rows) {
        const state = this.state.getSnapshot();
        const attachmentId = this.attachmentId;
        if (!state.writable || state.info === undefined || attachmentId === undefined)
            return;
        if (state.info.cols === cols && state.info.rows === rows)
            return;
        const id = state.info.id;
        cols = Math.min(cols, state.environment?.maxCols ?? cols);
        rows = Math.min(rows, state.environment?.maxRows ?? rows);
        this.writes = this.writes.then(async () => {
            if (this.attachmentId !== attachmentId || !this.state.getSnapshot().writable)
                return;
            valueOf(await this.remote.resize(this.sessionId, id, attachmentId, cols, rows));
        }).catch((error) => { if (this.attachmentId === attachmentId)
            this.fail(error); });
    }
    /**
     * Update the Host terminal's display name.
     * @param title - user-entered terminal title.
     * @returns after the rename settles and its result is reflected in view state.
     */
    async rename(title) {
        if (title.trim() === this.state.getSnapshot().title || this.lifetime.signal.aborted)
            return;
        try {
            valueOf(await this.remote.rename(this.sessionId, this.id, title));
            const current = this.state.getSnapshot().info;
            this.patch({ ...(current === undefined ? {} : { info: { ...current, title: title.trim() } }), title: title.trim() });
        }
        catch (error) {
            this.fail(error);
        }
    }
    /**
     * Explicitly terminate this view's process independently of its DOM lifetime.
     * @returns after Host process cleanup succeeds; failures remain retryable by the owner.
     */
    close() {
        if (this.closing !== undefined)
            return this.closing;
        this.patch({ phase: 'closing', writable: false, error: undefined, issue: undefined });
        this.detach();
        this.closing = (async () => {
            // Even a refused or lost creation response may leave an allocation to close.
            await this.creation;
            valueOf(await this.remote.close(this.sessionId, this.id));
            this.detach();
            this.patch({ phase: 'closed', writable: false });
        })().catch((error) => { this.closing = undefined; this.fail(error); throw error; });
        return this.closing;
    }
    /**
     * Stop Client work on plugin unload without closing Host terminals.
     * @returns after active and previously detached stream iterators have closed.
     */
    async dispose() {
        this.mounted = false;
        this.lifetime.abort();
        this.detach();
        await Promise.all(this.detaching);
    }
    detach() {
        const previous = this.stream;
        this.stream = undefined;
        this.attachmentId = undefined;
        this.pendingRender?.resolve();
        this.pendingRender = undefined;
        if (previous !== undefined) {
            const cleanup = previous.dispose().finally(() => { this.detaching.delete(cleanup); });
            this.detaching.add(cleanup);
        }
    }
    async consume(stream) {
        let generation = 0;
        let sequence = 0;
        try {
            for await (const item of stream) {
                if (this.stream !== stream)
                    return;
                const frame = item.value;
                if (generation !== item.generation) {
                    if (frame.type !== 'snapshot')
                        throw new TerminalViewError('invalidOutput', 'Terminal output generation is missing its screen snapshot');
                    generation = item.generation;
                    sequence = frame.sequence;
                    item.accept();
                }
                else if (frame.type === 'output') {
                    if (frame.sequence !== sequence + 1)
                        throw new TerminalViewError('invalidOutput', 'Terminal output sequence has a gap');
                    sequence = frame.sequence;
                }
                else if (frame.type === 'snapshot')
                    throw new TerminalViewError('invalidOutput', 'Unexpected terminal screen snapshot');
                if (frame.type !== 'output') {
                    this.patch({ info: frame.info, title: frame.info.title, phase: 'connected', writable: frame.info.state === 'running' && frame.info.controllerId === this.attachmentId });
                }
                if (frame.type !== 'state') {
                    const revision = ++this.revision;
                    await new Promise((resolve) => {
                        this.pendingRender = { revision, resolve };
                        const aborted = () => { this.acknowledge(revision); };
                        item.signal.addEventListener('abort', aborted, { once: true });
                        this.pendingRender.resolve = () => { item.signal.removeEventListener('abort', aborted); resolve(); };
                        this.patch({ render: { revision, frame } });
                        if (item.signal.aborted)
                            aborted();
                    });
                }
            }
        }
        catch (error) {
            if (this.stream === stream) {
                if (this.state.getSnapshot().info?.state === 'exited')
                    this.patch({ phase: 'closed', writable: false });
                else
                    this.fail(error);
            }
        }
    }
    patch(patch) {
        if (this.lifetime.signal.aborted)
            return;
        this.state.set({ ...this.state.getSnapshot(), ...patch });
    }
    fail(error) {
        const failure = remoteErrorOf(error);
        if (failure?.code === 'terminal/control-unavailable') {
            this.patch({ writable: false, error: undefined, issue: undefined });
            return;
        }
        const issue = failure?.code === 'terminal/view' ? failure.details.issue : failure?.code === 'terminal/limit-reached' ? 'terminalLimit' : failure?.code === 'terminal/unavailable' ? 'missingTerminal' : undefined;
        this.patch({ phase: error instanceof RemoteStreamCarrierError ? 'disconnected' : 'failed', writable: false, issue, error: error instanceof Error ? error.message : String(error) });
    }
}
function valueOf(result) {
    if (!result.ok)
        throw result.error;
    return result.value;
}
//# sourceMappingURL=model.js.map