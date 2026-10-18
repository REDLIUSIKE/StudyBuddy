/** OpenSSH connection owner for one version-matched POSIX helper and its independent forwarded streams. */
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { Service } from '@deepseek-ai/cordis';
import schema from '@deepseek-ai/schemastery';
import { z } from 'zod';
import { assertNever } from '@deepseek-ai/dsh-util-values';
import { SshRpcPeer, SSH_PROTOCOL_VERSION } from "./protocol.js";
import { helloSchema } from "./schemas.js";
import { authenticateStream } from "./stream-security.js";
/** One non-reconnecting SSH session; loss invalidates all active operations. */
export class SshConnection extends Service {
    static Config = schema.object({
        host: schema.string().required(), helper: schema.string().required(),
        launch: schema.union([
            schema.object({ kind: schema.const('node-script').required(), node: schema.string().required(), bootstrapPath: schema.string(), bootstrapHash: schema.string() }),
            schema.object({ kind: schema.const('executable').required() }),
        ]).required(),
        helperHash: schema.string().required(), workspace: schema.string().required(),
        requestTimeoutMs: schema.number().default(30_000), maxFrameBytes: schema.number().default(64 * 1024 * 1024),
        maxPending: schema.number().default(128), leaseMs: schema.number().default(30_000),
    });
    /** Verified remote helper coordinates; callers must await this before launch. */
    ready;
    rpc;
    child;
    childClosed;
    directory;
    heartbeat;
    closed = false;
    lifetime = new AbortController();
    operations = new Set();
    disposal;
    failure;
    sockets = new Set();
    nextSocket = 0;
    config;
    remote;
    constructor(ctx, config) {
        super(ctx, 'ssh');
        if (process.platform !== 'linux' && process.platform !== 'darwin')
            throw new Error('SSH runtime requires a POSIX client');
        this.config = z.object({
            host: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/),
            launch: z.discriminatedUnion('kind', [
                z.object({ kind: z.literal('node-script'), node: z.string().startsWith('/'),
                    bootstrapPath: z.string().startsWith('/').optional(), bootstrapHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
                }).strict().refine(value => (value.bootstrapPath === undefined) === (value.bootstrapHash === undefined), 'bootstrapPath and bootstrapHash must be paired'),
                z.object({ kind: z.literal('executable') }).strict(),
            ]),
            helper: z.string().startsWith('/'), helperHash: z.string().regex(/^[0-9a-f]{64}$/),
            workspace: z.string().startsWith('/'), requestTimeoutMs: z.number().int().positive().max(2_147_483_647),
            maxFrameBytes: z.number().int().positive().max(64 * 1024 * 1024), maxPending: z.number().int().positive().max(128),
            leaseMs: z.number().int().min(3000).max(600_000),
        }).strict().parse(config);
        this.ready = this.start();
        // Startup uses Node I/O, local validation, and Error-valued RPC failures.
        void this.ready.catch((error) => { this.fail(error); });
        ctx.effect(() => () => this.dispose());
    }
    /** Hold plugin readiness until the remote identity and helper digest are verified. */
    async [Service.init]() { await this.ready; }
    /** Verified remote PTC launch configuration; script deployments require a verified bootstrap. */
    get ptcLaunch() {
        if (this.remote === undefined)
            throw new Error('SSH helper is not ready');
        const launch = this.config.launch;
        switch (launch.kind) {
            case 'executable': return { kind: 'embedded', executable: this.remote.executable };
            case 'node-script':
                if (launch.bootstrapPath === undefined)
                    throw new Error('SSH PTC requires a verified bootstrapPath and bootstrapHash');
                return { kind: 'node-script', executable: this.remote.executable, bootstrapPath: launch.bootstrapPath };
            /* v8 ignore next -- Config parsing admits only these two launch kinds. */
            default: return assertNever(launch);
        }
    }
    /**
     * Send a helper operation; cancellation never replays an ambiguous mutation.
     * @param method - the private helper operation.
     * @param params - JSON request fields validated by the helper.
     * @param result - response validation before returning provider-visible data.
     * @param signal - cancellation, which does not undo completed remote effects.
     * @param wait - allow a process observation to outlast the administrative deadline.
     * @returns the validated remote result.
     */
    async request(method, params, result, signal, wait = false) {
        this.assertOpen();
        await this.ready;
        this.assertOpen();
        const bounded = wait ? signal : signal === undefined
            ? AbortSignal.timeout(this.config.requestTimeoutMs)
            : AbortSignal.any([signal, AbortSignal.timeout(this.config.requestTimeoutMs)]);
        return this.rpc.request(method, params, result, bounded);
    }
    /**
     * Forward one authenticated stream through an independent SSH channel.
     * @param endpoint - private coordinates issued by this connection's helper.
     * @param signal - cancellation of allocation and the resulting socket.
     * @returns a paused socket; attach a consumer before resuming it.
     */
    async connectStream(endpoint, signal) {
        return this.track(this.establishStream(endpoint, signal));
    }
    async establishStream(endpoint, signal) {
        const hello = await this.ready;
        this.assertOpen();
        signal = signal === undefined ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal]);
        const remote = endpoint.path;
        if (!remote.startsWith(`${hello.root}/`) || /[:\r\n\0]/u.test(remote))
            throw new Error('SSH helper returned an invalid stream path');
        signal.throwIfAborted();
        const local = join(this.directory, `s${this.nextSocket++}`);
        const forward = `${local}:${remote}`;
        const cancelForward = async () => {
            // An unavailable master already removed its forwarding listeners.
            if (!this.closed)
                await this.controlCommand(['-O', 'cancel', '-L', forward]).catch(() => { });
            await rm(local, { force: true });
        };
        try {
            await this.controlCommand(['-O', 'forward', '-o', 'ExitOnForwardFailure=yes', '-L', forward], signal);
        }
        catch (error) {
            await cancelForward();
            throw error;
        }
        signal.throwIfAborted();
        const socket = createConnection({ path: local, allowHalfOpen: true });
        this.sockets.add(socket);
        socket.once('close', () => {
            this.sockets.delete(socket);
            void this.track(cancelForward()).catch(() => { });
        });
        await new Promise((resolve, reject) => {
            const cleanup = () => {
                signal.removeEventListener('abort', aborted);
                socket.off('connect', connected);
                socket.off('error', failed);
                socket.off('close', closed);
            };
            const connected = () => { cleanup(); resolve(); };
            const failed = (error) => { cleanup(); reject(error); };
            const closed = () => { failed(new Error('SSH connection closed before stream establishment')); };
            const aborted = () => { socket.destroy(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason))); };
            socket.once('connect', connected);
            socket.once('error', failed);
            socket.once('close', closed);
            signal.addEventListener('abort', aborted, { once: true });
        });
        const authenticated = await authenticateStream(socket, endpoint.capability, this.config.requestTimeoutMs, signal);
        this.sockets.add(authenticated);
        authenticated.on('error', () => { authenticated.destroy(); });
        authenticated.once('close', () => { this.sockets.delete(authenticated); });
        return authenticated;
    }
    /** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
    dispose() {
        this.disposal ??= this.disposeOnce();
        return this.disposal;
    }
    async disposeOnce() {
        this.closed = true;
        this.lifetime.abort(new Error('SSH connection is closing'));
        if (this.heartbeat !== undefined)
            clearInterval(this.heartbeat);
        try {
            await this.ready.catch(() => { });
            if (this.failure === undefined)
                await this.rpc?.request('close', {}, z.null(), AbortSignal.timeout(this.config.requestTimeoutMs));
        }
        finally {
            this.rpc?.close();
            // TLS wrappers release their reads before their underlying sockets close.
            const socketClosures = [...this.sockets].reverse().map(socket => new Promise((resolve) => {
                if (socket.closed)
                    resolve();
                else {
                    socket.once('close', () => { resolve(); });
                    socket.destroy();
                }
            }));
            this.child?.kill('SIGTERM');
            const force = setTimeout(() => { this.child?.kill('SIGKILL'); }, this.config.requestTimeoutMs);
            try {
                await this.childClosed;
            }
            finally {
                clearTimeout(force);
            }
            await Promise.all(socketClosures);
            while (this.operations.size > 0)
                await Promise.allSettled([...this.operations]);
            if (this.directory !== undefined)
                await rm(this.directory, { recursive: true, force: true });
        }
    }
    controlPath() { return join(this.directory, 'master'); }
    assertOpen() {
        if (this.closed)
            throw new Error('SSH connection is closed');
        if (this.failure !== undefined)
            throw this.failure;
    }
    track(operation) {
        this.operations.add(operation);
        void operation.finally(() => { this.operations.delete(operation); }).catch(() => { });
        return operation;
    }
    async controlCommand(args, signal) {
        const signals = [this.lifetime.signal, AbortSignal.timeout(this.config.requestTimeoutMs)];
        if (signal !== undefined)
            signals.push(signal);
        const combined = AbortSignal.any(signals);
        combined.throwIfAborted();
        const result = Promise.withResolvers();
        const command = execFile('ssh', ['-S', this.controlPath(), ...args, this.config.host], {
            signal: combined, maxBuffer: 64 * 1024,
        }, (error) => { if (error === null)
            result.resolve(undefined);
        else
            result.reject(error); });
        const closed = new Promise((resolve) => { command.once('close', () => { resolve(); }); });
        let force;
        const escalate = () => {
            force = setTimeout(() => { command.kill('SIGKILL'); }, this.config.requestTimeoutMs);
            force.unref();
        };
        combined.addEventListener('abort', escalate, { once: true });
        try {
            await result.promise;
        }
        finally {
            await closed;
            combined.removeEventListener('abort', escalate);
            if (force !== undefined)
                clearTimeout(force);
        }
    }
    fail(error) {
        if (this.failure !== undefined)
            return;
        this.failure = error;
        this.lifetime.abort(error);
        if (this.heartbeat !== undefined)
            clearInterval(this.heartbeat);
        this.rpc?.close(error);
        for (const socket of [...this.sockets].reverse())
            socket.destroy(error);
        this.child?.kill('SIGTERM');
    }
    async start() {
        this.directory = await mkdtemp('/tmp/dsh-ssh-');
        if (this.closed)
            throw new Error('SSH connection closed before startup');
        const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
        const launch = this.config.launch;
        let command;
        let bootstrapPath;
        let bootstrapHash;
        switch (launch.kind) {
            case 'node-script':
                command = [launch.node, '--disable-sigusr1', this.config.helper].map(quote).join(' ');
                bootstrapPath = launch.bootstrapPath;
                bootstrapHash = launch.bootstrapHash;
                break;
            case 'executable':
                command = `NODE_OPTIONS='--disable-sigusr1' ${quote(this.config.helper)}`;
                break;
            /* v8 ignore next -- Config parsing admits only these two launch kinds. */
            default: return assertNever(launch);
        }
        const child = spawn('ssh', [
            '-T', '-M', '-S', this.controlPath(), '-o', 'ControlPersist=no', '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes',
            '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3', this.config.host, command,
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        this.child = child;
        this.childClosed = new Promise((resolve) => { child.once('close', () => { resolve(); }); });
        child.stderr.resume(); // SSH diagnostics can contain configured paths; operation errors remain structured.
        child.once('error', (error) => { this.fail(error); });
        child.once('close', () => { this.fail(new Error('SSH helper disconnected; remote outcomes and cleanup are unknown')); });
        const rpc = new SshRpcPeer(child.stdout, child.stdin, this.config.maxFrameBytes, this.config.maxPending);
        this.rpc = rpc;
        rpc.once('closed', (error) => { this.fail(error); });
        const hello = await rpc.request('hello', {
            protocol: SSH_PROTOCOL_VERSION, workspace: this.config.workspace, leaseMs: this.config.leaseMs,
            ...(bootstrapPath === undefined ? {} : { bootstrapPath }),
        }, helloSchema, AbortSignal.timeout(this.config.requestTimeoutMs));
        if (hello.hash !== this.config.helperHash)
            throw new Error('SSH helper digest differs from the configured artifact');
        if (hello.kind !== launch.kind)
            throw new Error('SSH helper runtime differs from the configured launch kind');
        if (hello.bootstrapHash !== bootstrapHash)
            throw new Error('SSH PTC bootstrap digest differs from the configured artifact');
        this.remote = hello;
        let heartbeatPending;
        this.heartbeat = setInterval(() => {
            heartbeatPending ??= rpc.request('heartbeat', {}, z.null(), AbortSignal.timeout(this.config.leaseMs / 2))
                .catch((error) => { this.fail(error); })
                .finally(() => { heartbeatPending = undefined; });
        }, Math.floor(this.config.leaseMs / 3));
        this.heartbeat.unref();
        return hello;
    }
}
export default SshConnection;
//# sourceMappingURL=index.js.map