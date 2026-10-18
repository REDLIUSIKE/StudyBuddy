/** One retained account-owned process serves the research workbench and private native actions. */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertResearchPath } from "./research-resources.js";
import { terminateAigcProcess } from "./aigc-process.js";
import { prepareResearchProfile } from "./research-profile.js";
import { StringDecoder } from 'node:string_decoder';
const same = (a, b) => a.accountId === b.accountId && a.generation === b.generation;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function request(value) {
    if (typeof value.rpcId !== 'string' || !uuid.test(value.rpcId) || typeof value.projectId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.projectId) ||
        typeof value.operation !== 'string' || !['bind', 'capabilities', 'submit', 'inspect', 'cancel', 'answer', 'project-close', 'journal', 'journal-export', 'journal-sessions', 'model-catalog', 'advanced', 'settlements', 'goal', 'schedules', 'speech-transcribe'].includes(value.operation) || !Object.hasOwn(value, 'input') ||
        Object.keys(value).some(key => !['type', 'rpcId', 'projectId', 'sessionId', 'operation', 'input'].includes(key)) ||
        (value.sessionId !== undefined && (typeof value.sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/.test(value.sessionId))))
        throw Error('RESEARCH_CONTROL_INVALID');
    return value;
}
/** Stable storage identity keeps credentials/account text out of file names.
 * @param root - Original desktop data root.
 * @param accountId - Authenticated account identity.
 * @returns Account research data directory. */
export function accountResearchDirectory(root, accountId) {
    return join(root, 'studybuddy-research', 'accounts', createHash('sha256').update(accountId).digest('hex'));
}
/** Serialized private process owner; no page credentials enter a public URL or environment. */
export class ResearchRuntime {
    options;
    current;
    cleanup = Promise.resolve();
    constructor(options) {
        this.options = options;
    }
    /** Share readiness for the captured authenticated generation.
     * @param scope - Main-owned account generation.
     * @returns Exact workbench origin. */
    ensure(scope) {
        if (!this.options.isCurrent(scope))
            return Promise.reject(Error('RESEARCH_SCOPE_REVOKED'));
        if (this.current && same(this.current.scope, scope) && !this.current.controller.signal.aborted)
            return this.current.pending;
        const old = this.current;
        if (old)
            this.cleanup = Promise.all([this.stop(old), old.pending.catch(() => undefined)]).then(() => undefined);
        const row = { scope: { ...scope }, authorization: randomBytes(32).toString('hex'), toolAuthorization: randomBytes(32).toString('hex'), controller: new AbortController(),
            pending: Promise.resolve({ origin: '' }), requests: new Map() };
        this.current = row;
        row.pending = this.start(row).catch(async (error) => { await this.stop(row); throw error; });
        return row.pending;
    }
    assert(row) {
        if (this.current !== row || row.controller.signal.aborted || !this.options.isCurrent(row.scope))
            throw Error('RESEARCH_SCOPE_REVOKED');
    }
    async start(row) {
        await this.cleanup;
        this.assert(row);
        const resources = await this.options.resources();
        this.assert(row);
        const projectsRoot = join(accountResearchDirectory(this.options.userDataRoot, row.scope.accountId), 'projects');
        await assertResearchPath(projectsRoot);
        await mkdir(projectsRoot, { recursive: true });
        this.assert(row);
        const canonicalProjectsRoot = await realpath(projectsRoot);
        this.assert(row);
        const home = await prepareResearchProfile(accountResearchDirectory(this.options.userDataRoot, row.scope.accountId), resources);
        this.assert(row);
        const child = this.options.launch(resources.node, [resources.entry, '--profile', 'studybuddy-research'], { cwd: resources.directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
            env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: dirname(resources.node), NODE_ENV: 'production', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', PYTHONDONTWRITEBYTECODE: '1' } });
        row.child = child;
        row.exited = new Promise(resolve => { child.once('exit', () => { resolve(); }); child.once('error', () => { resolve(); }); });
        const ready = new Promise((resolve, reject) => {
            row.rejectReady = reject;
            let buffer = '', settled = false;
            const decoder = new StringDecoder('utf8');
            const timer = setTimeout(() => { reject(Error('RESEARCH_START_TIMEOUT')); }, 45000);
            const rejectStart = (error) => { clearTimeout(timer); reject(error); };
            child.once('error', () => { rejectStart(Error('RESEARCH_START_FAILED')); });
            child.once('exit', () => {
                rejectStart(Error(row.controller.signal.aborted ? 'RESEARCH_SCOPE_REVOKED' : 'RESEARCH_SERVICE_EXITED'));
                if (this.current === row && !row.controller.signal.aborted) {
                    row.controller.abort();
                    row.origin = undefined;
                    this.options.invalidated();
                }
            });
            child.stdin.on('error', () => { rejectStart(Error('RESEARCH_CONTROL_DISCONNECTED')); });
            child.stderr.resume();
            child.stdout.on('data', (chunk) => {
                buffer += decoder.write(chunk);
                if (buffer.length > 1024 * 1024) {
                    rejectStart(Error('RESEARCH_CONTROL_INVALID'));
                    void this.stop(row).catch(() => { this.options.invalidated(); });
                    return;
                }
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    let value;
                    try {
                        value = JSON.parse(line);
                    }
                    catch {
                        continue; /* Non-control logs confer no authority. */
                    }
                    if (!value || typeof value !== 'object')
                        continue;
                    const message = value;
                    if (message.type === 'ready') {
                        try {
                            this.assert(row);
                            if (settled || typeof message.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(message.origin) || Number(new URL(message.origin).port) > 65535)
                                throw Error('RESEARCH_CONTROL_INVALID');
                            row.origin = message.origin;
                            settled = true;
                            clearTimeout(timer);
                            resolve({ origin: message.origin });
                        }
                        catch (error) {
                            rejectStart(error instanceof Error ? error : Error('RESEARCH_CONTROL_INVALID'));
                        }
                    }
                    else if (message.type === 'host-request')
                        void this.relay(row, message);
                    else if (message.type === 'host-cancel')
                        this.cancelRpc(row, message);
                }
            });
        });
        child.stdin.write(JSON.stringify({ projectsRoot: canonicalProjectsRoot, guestAuthorization: row.authorization, toolAuthorization: row.toolAuthorization }) + '\n');
        return ready;
    }
    cancelRpc(row, message) {
        try {
            this.assert(row);
            if (!row.child || row.child.exitCode !== null || row.child.signalCode !== null || row.child.killed ||
                typeof message.rpcId !== 'string' || !uuid.test(message.rpcId) || typeof message.projectId !== 'string' ||
                !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(message.projectId) ||
                Object.keys(message).some(key => !['type', 'rpcId', 'projectId', 'sessionId'].includes(key)) ||
                (message.sessionId !== undefined && (typeof message.sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/.test(message.sessionId))))
                return;
            const pending = row.requests.get(message.rpcId);
            if (!pending || pending.request.projectId !== message.projectId || pending.request.sessionId !== message.sessionId)
                return;
            pending.controller.abort(Error('RESEARCH_RPC_CANCELLED'));
        }
        catch { /* A foreign or revoked process cannot cancel current native work. */ }
    }
    async relay(row, message) {
        let parsed;
        let pending;
        try {
            this.assert(row);
            parsed = request(message);
            if (row.requests.has(parsed.rpcId))
                throw Error('RESEARCH_RPC_CONFLICT');
            if (row.requests.size >= 128)
                throw Error('RESEARCH_CHANNEL_BUSY');
            pending = { request: parsed, controller: new AbortController() };
            row.requests.set(parsed.rpcId, pending);
            const signal = AbortSignal.any([row.controller.signal, pending.controller.signal]);
            const data = await this.options.invoke(row.scope, parsed, signal);
            this.assert(row);
            signal.throwIfAborted();
            row.child?.stdin.write(JSON.stringify({ type: 'host-result', rpcId: parsed.rpcId, data }) + '\n');
        }
        catch (error) {
            if (parsed && pending && this.current === row && !pending.controller.signal.aborted && !row.controller.signal.aborted && this.options.isCurrent(row.scope))
                row.child?.stdin.write(JSON.stringify({ type: 'host-result', rpcId: parsed.rpcId,
                    error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'RESEARCH_NATIVE_ACTION_FAILED' }) + '\n');
        }
        finally {
            if (parsed && pending && row.requests.get(parsed.rpcId) === pending)
                row.requests.delete(parsed.rpcId);
        }
    }
    /** Inject guest authorization only for this current account's exact local origin.
     * @param scope - Captured account generation.
     * @param value - Request URL from the owned guest dispatcher.
     * @returns Private request headers, or no authorization for foreign/stale requests. */
    requestHeaders(scope, value) {
        const row = this.current;
        if (!row || !same(scope, row.scope) || row.controller.signal.aborted || !this.options.isCurrent(scope) || !row.origin || !URL.canParse(value))
            return {};
        const url = new URL(value);
        return url.origin === row.origin && !url.username && !url.password ? { 'X-StudyBuddy-Research-Guest': row.authorization } : {};
    }
    /** Native model tools receive a separate private caller token.
     * @param scope - Captured native account generation.
     * @param value - Main-selected exact local request URL.
     * @returns Private headers unavailable to the web guest. */
    toolHeaders(scope, value) {
        const guest = this.requestHeaders(scope, value), row = this.current;
        return row && Object.keys(guest).length ? { ...guest, 'X-StudyBuddy-Research-Tool': row.toolAuthorization } : {};
    }
    stop(row) {
        row.controller.abort();
        row.origin = undefined;
        row.rejectReady?.(Error('RESEARCH_SCOPE_REVOKED'));
        row.requests.clear();
        return row.stopped ??= (async () => {
            const child = row.child;
            if (!child || child.exitCode !== null || child.signalCode !== null)
                return;
            child.stdin.end('{"type":"shutdown"}\n');
            let timer;
            try {
                // Owned GPU cleanup can require cancellation, artifact collection and one bounded power_off call.
                const graceful = await Promise.race([row.exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 90000); })]);
                if (timer)
                    clearTimeout(timer);
                if (graceful)
                    return;
                await (this.options.terminate ?? terminateAigcProcess)(child);
                await Promise.race([row.exited, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(Error('RESEARCH_PROCESS_STOP_FAILED')), 5000); })]);
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        })();
    }
    /** Revoke immediately and wait for startup settlement and owned process exit.
     * @returns Completion without removing saved projects. */
    revoke() {
        const row = this.current;
        if (!row)
            return this.cleanup;
        this.cleanup = Promise.all([this.stop(row), row.pending.catch(() => undefined)]).then(() => { if (this.current === row)
            this.current = undefined; });
        return this.cleanup;
    }
}
//# sourceMappingURL=research-runtime.js.map