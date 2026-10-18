/** Private runs.host commands execute through the original native shell tool and its policies. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { JobId } from '@deepseek-ai/dsh-jobs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = (reason = 'INPUT_INVALID') => { throw Error('HARNESS_RESEARCH_WORKFLOW_HOST_' + reason); };
function record(value) { if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail(); return value; }
function input(value) {
    const row = record(value);
    if (typeof row.operationId !== 'string' || !uuid.test(row.operationId))
        return fail();
    if (row.action === 'inspect' || row.action === 'cancel') {
        if (Object.keys(row).length !== 2)
            return fail();
        return { action: row.action, operationId: row.operationId };
    }
    if (row.action !== 'start' || Object.keys(row).length !== 4 || typeof row.command !== 'string' || !row.command.trim() || row.command.includes('\0') || Buffer.byteLength(row.command) > 16384 || !Number.isSafeInteger(row.timeoutMs) || Number(row.timeoutMs) < 1 || Number(row.timeoutMs) > 86400000)
        return fail();
    return { action: 'start', operationId: row.operationId, command: row.command, timeoutMs: Number(row.timeoutMs) };
}
function assertPath(value) {
    let current = path.resolve(value);
    for (;;) {
        let stat;
        try {
            stat = fs.lstatSync(current);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        if (stat?.isSymbolicLink())
            return fail('PATH_DENIED');
        const parent = path.dirname(current);
        if (parent === current)
            return;
        current = parent;
    }
}
function owner(context, callerSessionId) { return { accountId: context.scope.accountId, projectId: context.projectId, workspaceId: context.workspaceId, rootSessionId: context.sessionId, callerSessionId }; }
function signature(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function stream(value) {
    const row = record(value);
    if (typeof row.text !== 'string' || typeof row.truncated !== 'boolean' || row.spillPath !== undefined && typeof row.spillPath !== 'string')
        return fail('NATIVE_RESULT_INVALID');
    return { text: row.text, truncated: row.truncated, ...(row.spillPath === undefined ? {} : { spillPath: row.spillPath }) };
}
function foreground(value, cwd) {
    const row = record(value);
    if (row.kind !== 'foreground')
        return;
    if (row.cwd !== cwd || row.exitCode !== null && !Number.isSafeInteger(row.exitCode) || row.signal !== null && typeof row.signal !== 'string' || typeof row.timedOut !== 'boolean' || typeof row.aborted !== 'boolean' || !Number.isSafeInteger(row.timeoutMs) || Number(row.timeoutMs) < 1 || row.stopped !== undefined && typeof row.stopped !== 'string')
        return fail('NATIVE_RESULT_INVALID');
    const result = { kind: 'foreground', cwd, exitCode: row.exitCode === null ? null : Number(row.exitCode), signal: row.signal === null ? null : String(row.signal), timedOut: row.timedOut, aborted: row.aborted, timeoutMs: Number(row.timeoutMs), stdout: stream(row.stdout), stderr: stream(row.stderr), ...(row.stopped === undefined ? {} : { stopped: row.stopped }) };
    if (row.sandbox !== undefined) {
        const sandbox = record(row.sandbox);
        if (typeof sandbox.mode !== 'string' || typeof sandbox.denied !== 'boolean' || sandbox.enforcement !== undefined && typeof sandbox.enforcement !== 'string' || sandbox.runnerFailed !== undefined && typeof sandbox.runnerFailed !== 'boolean')
            return fail('NATIVE_RESULT_INVALID');
        result.sandbox = { mode: sandbox.mode, denied: sandbox.denied, ...(sandbox.enforcement === undefined ? {} : { enforcement: sandbox.enforcement }), ...(sandbox.runnerFailed === undefined ? {} : { runnerFailed: sandbox.runnerFailed }) };
    }
    return result;
}
/** Durable native command intents; uncertain operations remain unknown rather than starting again. */
export class NativeResearchWorkflowHost {
    ctx;
    options;
    rows = new Map();
    queues = new Map();
    suspending = new Set();
    dispatchOwner = new AsyncLocalStorage();
    removeDispatch;
    disposed = false;
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
        this.removeDispatch = ctx.on('tools/execute', async (exec, next) => {
            const row = [...this.rows.values()].find(candidate => candidate.receipt.nativeCallId === exec.callId && candidate.actor === exec.agent && candidate.target.shell === exec.name);
            if (!row || row.receipt.state !== 'running')
                return next();
            this.assert(row.context);
            if (this.suspending.has('*') || this.suspending.has(row.owner.projectId))
                throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');
            row.receipt.phase = 'dispatching';
            row.receipt.startedAt = Date.now();
            this.save(row);
            row.timer = setTimeout(() => { row.deadlineExpired = true; row.controller.abort('runs.host timeout'); }, row.target.timeoutMs);
            row.timer.unref();
            const jobs = ctx.get('jobs');
            const removeObserver = jobs?.events.subscribe({ owner: row.actor.id }, event => {
                if (event.type !== 'registered' || this.dispatchOwner.getStore() !== row || event.job.owner !== row.actor.id || event.job.kind !== row.target.shell || event.job.label !== row.target.command)
                    return;
                // An awaiting collector prevents this private command's completion from opening a model turn.
                const waiting = (async () => { let view = await jobs.wait(event.job.id, 60000, row.actor.id); while (view.status === 'running' || view.status === 'stopping')
                    view = await jobs.wait(event.job.id, 60000, row.actor.id); })();
                row.jobs.set(event.job.id, waiting);
                void waiting.catch(() => undefined);
            });
            try {
                return await this.dispatchOwner.run(row, next);
            }
            finally {
                if (row.timer)
                    clearTimeout(row.timer);
                removeObserver?.();
                await this.drain(row);
                row.nativeFinishedAt = Date.now();
            }
        });
        ctx.effect(() => () => this.dispose());
    }
    assert(context) { if (this.disposed || !this.options.current(context))
        throw Error('HARNESS_RESEARCH_SCOPE_REVOKED'); }
    async drain(row) {
        const jobs = this.ctx.get('jobs');
        if (jobs)
            for (const id of row.jobs.keys()) {
                const job = jobs.list(row.actor.id).find(candidate => candidate.id === id);
                if (!job)
                    continue;
                if (job.owner !== row.actor.id || job.kind !== row.target.shell || job.label !== row.target.command)
                    return fail('NATIVE_JOB_DENIED');
                if (job.status === 'running' || job.status === 'stopping')
                    jobs.kill(id, row.actor.id, 'runs.host requires native process quiescence');
            }
        await Promise.all(row.jobs.values());
    }
    directory(context) {
        const root = this.options.directory(context);
        if (!path.isAbsolute(root))
            return fail('PATH_DENIED');
        assertPath(root);
        return fs.realpathSync(root);
    }
    file(root, id) { const file = path.join(root, '.kady', 'native-workflow-host', id + '.json'); assertPath(file); return file; }
    save(row) {
        assertPath(row.file);
        fs.mkdirSync(path.dirname(row.file), { recursive: true });
        assertPath(row.file);
        const data = { schemaVersion: 1, owner: row.owner, target: row.target, signature: row.signature, receipt: row.receipt }, text = JSON.stringify(data) + '\n';
        if (Buffer.byteLength(text) > 1024 * 1024)
            return fail('RECEIPT_LIMIT');
        const temporary = row.file + '.' + randomUUID() + '.tmp';
        assertPath(temporary);
        fs.writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, row.file);
    }
    load(file, expected, cwd, operationId) {
        let text;
        try {
            if (fs.statSync(file).size > 1024 * 1024)
                return fail('RECEIPT_LIMIT');
            text = fs.readFileSync(file, 'utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            throw error;
        }
        const data = record(JSON.parse(text)), storedOwner = record(data.owner), target = record(data.target), receipt = record(data.receipt);
        if (data.schemaVersion !== 1 || Object.keys(storedOwner).sort().join(',') !== Object.keys(expected).sort().join(',') || Object.entries(expected).some(([key, value]) => storedOwner[key] !== value))
            return fail('OWNER_DENIED');
        if (!['pwsh', 'bash'].includes(String(target.shell)) || target.cwd !== cwd || typeof target.command !== 'string' || !Number.isSafeInteger(target.timeoutMs) || Number(target.timeoutMs) < 1 || Number(target.timeoutMs) > 86400000 || data.signature !== signature({ owner: expected, target }))
            return fail('RECEIPT_INVALID');
        if (receipt.operationId !== operationId || receipt.callerSessionId !== expected.callerSessionId || receipt.nativeCallId !== 'workflow-host:' + operationId || !['running', 'completed', 'failed', 'cancelled', 'unknown'].includes(String(receipt.state)) || !['intent', 'dispatching', 'terminal'].includes(String(receipt.phase)) || !Number.isSafeInteger(receipt.createdAt))
            return fail('RECEIPT_INVALID');
        const restored = { operationId, callerSessionId: expected.callerSessionId, nativeCallId: String(receipt.nativeCallId), state: receipt.state, phase: receipt.phase, createdAt: Number(receipt.createdAt) };
        for (const key of ['startedAt', 'completedAt', 'durationMs'])
            if (receipt[key] !== undefined) {
                if (!Number.isSafeInteger(receipt[key]) || Number(receipt[key]) < 0)
                    return fail('RECEIPT_INVALID');
                restored[key] = Number(receipt[key]);
            }
        for (const key of ['timedOut', 'aborted', 'cancelRequested', 'canonicalResultUnavailable'])
            if (receipt[key] !== undefined) {
                if (typeof receipt[key] !== 'boolean')
                    return fail('RECEIPT_INVALID');
                restored[key] = receipt[key];
            }
        if (receipt.error !== undefined) {
            if (typeof receipt.error !== 'string')
                return fail('RECEIPT_INVALID');
            restored.error = receipt.error;
        }
        if (receipt.result !== undefined) {
            const value = foreground(receipt.result, cwd);
            if (!value)
                return fail('RECEIPT_INVALID');
            restored.result = value;
        }
        if (receipt.nativeProcess !== undefined) {
            const native = record(receipt.nativeProcess);
            if (!['background', 'promoted'].includes(String(native.kind)) || typeof native.jobId !== 'string' || native.cleanupConfirmed !== undefined && typeof native.cleanupConfirmed !== 'boolean')
                return fail('RECEIPT_INVALID');
            restored.nativeProcess = { kind: native.kind, jobId: native.jobId, ...(native.cleanupConfirmed === undefined ? {} : { cleanupConfirmed: native.cleanupConfirmed }) };
        }
        if (restored.state === 'completed' && (!restored.result || restored.result.exitCode !== 0 || restored.result.timedOut || restored.result.aborted || restored.result.signal !== null || restored.result.sandbox?.denied || restored.result.sandbox?.runnerFailed))
            return fail('RECEIPT_INVALID');
        if (restored.state === 'running') {
            restored.state = 'unknown';
            restored.phase = 'terminal';
            restored.error = 'HARNESS_RESEARCH_WORKFLOW_HOST_RESTART_UNCONFIRMED';
            restored.canonicalResultUnavailable = true;
        }
        return { schemaVersion: 1, owner: expected, target: { shell: target.shell, command: target.command, timeoutMs: Number(target.timeoutMs), cwd }, signature: String(data.signature), receipt: restored };
    }
    /** @param context - Privately admitted project/root. @param callerId - Existing proved native caller. @param value - Closed start/inspect/cancel request.
     * @returns A copied immediate receipt. Inspect again to observe actual terminal native output.
     */
    async command(context, callerId, value) {
        this.assert(context);
        const request = input(value), root = this.directory(context), key = this.file(root, request.operationId);
        const previous = this.queues.get(key)?.promise ?? Promise.resolve();
        const pending = previous.catch(() => undefined).then(() => this.apply(context, callerId, request, root, key));
        this.queues.set(key, { projectId: context.projectId, promise: pending });
        void pending.finally(() => { if (this.queues.get(key)?.promise === pending)
            this.queues.delete(key); }).catch(() => undefined);
        return pending;
    }
    async apply(context, callerId, request, root, file) {
        this.assert(context);
        if (this.suspending.has('*') || this.suspending.has(context.projectId))
            throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');
        const actor = await this.options.proveCaller(context, callerId);
        this.assert(context);
        if (actor.id !== callerId || this.ctx.agents.get(actor.id) !== actor || actor.session.header.cwd === undefined || fs.realpathSync(actor.session.header.cwd) !== root)
            return fail('CALLER_DENIED');
        const expected = owner(context, callerId), live = this.rows.get(file), saved = live ?? this.load(file, expected, root, request.operationId);
        if (saved && JSON.stringify(saved.owner) !== JSON.stringify(expected))
            return fail('OWNER_DENIED');
        if (saved) {
            if (request.action === 'start' && saved.signature !== signature({ owner: expected, target: { shell: process.platform === 'win32' ? 'pwsh' : 'bash', command: request.command, timeoutMs: request.timeoutMs, cwd: root } }))
                return fail('CONFLICT');
            if (request.action === 'cancel' && live?.receipt.state === 'running') {
                live.receipt.cancelRequested = true;
                if (live.nativeFinishedAt === undefined)
                    live.controller.abort('runs.host cancelled');
                this.save(live);
            }
            return structuredClone(saved.receipt);
        }
        if (request.action !== 'start')
            return fail('NOT_FOUND');
        const target = { shell: process.platform === 'win32' ? 'pwsh' : 'bash', command: request.command, timeoutMs: request.timeoutMs, cwd: root };
        const row = { schemaVersion: 1, owner: expected, target, signature: signature({ owner: expected, target }), receipt: { operationId: request.operationId, callerSessionId: callerId, nativeCallId: 'workflow-host:' + request.operationId, state: 'running', phase: 'intent', createdAt: Date.now() }, context, actor, file, controller: new AbortController(), settled: Promise.resolve(), deadlineExpired: false, jobs: new Map() };
        this.save(row);
        this.rows.set(file, row);
        const response = structuredClone(row.receipt);
        row.settled = this.run(row);
        return response;
    }
    async run(row) {
        try {
            this.assert(row.context);
            const result = await this.ctx.tools.execute({ name: row.target.shell, callId: ToolCallId(row.receipt.nativeCallId), agent: row.actor,
                arguments: { command: row.target.command, description: 'runs.host ' + row.receipt.operationId, workdir: row.target.cwd, timeoutMs: row.target.timeoutMs, run_in_background: false }, signal: row.controller.signal });
            if (row.timer)
                clearTimeout(row.timer);
            row.receipt.timedOut = row.deadlineExpired;
            row.receipt.aborted = row.controller.signal.aborted;
            if (result.isError) {
                row.receipt.state = row.deadlineExpired ? 'failed' : row.controller.signal.aborted || ['ABORTED', 'ABORTED_BEFORE_DISPATCH'].includes(result.error.info?.code ?? '') ? 'cancelled' : 'failed';
                row.receipt.canonicalResultUnavailable = true;
                row.receipt.error = result.error.info?.code ?? 'HARNESS_RESEARCH_WORKFLOW_HOST_NATIVE_TOOL_FAILED';
            }
            else {
                const value = foreground(result.value, row.target.cwd);
                if (value) {
                    row.receipt.result = value;
                    row.receipt.timedOut = value.timedOut;
                    row.receipt.aborted = value.aborted;
                    row.receipt.state = value.aborted ? 'cancelled' : value.timedOut || value.exitCode !== 0 || value.signal !== null || value.sandbox?.denied || value.sandbox?.runnerFailed ? 'failed' : 'completed';
                }
                else {
                    row.receipt.state = 'unknown';
                    row.receipt.canonicalResultUnavailable = true;
                    row.receipt.error = 'HARNESS_RESEARCH_WORKFLOW_HOST_NATIVE_RESULT_NOT_TERMINAL';
                    const handle = record(result.value);
                    if (['background', 'promoted'].includes(String(handle.kind)) && typeof handle.jobId === 'string') {
                        row.receipt.nativeProcess = { kind: handle.kind, jobId: handle.jobId };
                        row.receipt.timedOut = row.deadlineExpired || handle.kind === 'promoted';
                        const jobs = this.ctx.get('jobs');
                        if (jobs) {
                            const id = JobId(handle.jobId), job = jobs.get(id, row.actor.id);
                            if (job.owner !== row.actor.id || job.kind !== row.target.shell || job.label !== row.target.command)
                                return fail('NATIVE_JOB_DENIED');
                            jobs.kill(id, row.actor.id, 'runs.host requires a terminal process outcome');
                            let terminal = await jobs.wait(id, row.target.timeoutMs, row.actor.id);
                            while (terminal.status === 'running' || terminal.status === 'stopping')
                                terminal = await jobs.wait(id, row.target.timeoutMs, row.actor.id);
                            row.receipt.nativeProcess.cleanupConfirmed = true;
                            row.receipt.aborted = true;
                        }
                    }
                }
            }
        }
        catch (error) {
            row.receipt.state = 'unknown';
            row.receipt.canonicalResultUnavailable = true;
            row.receipt.error = error instanceof Error ? error.message : 'HARNESS_RESEARCH_WORKFLOW_HOST_UNCONFIRMED';
        }
        finally {
            if (row.timer)
                clearTimeout(row.timer);
            row.receipt.phase = 'terminal';
            row.receipt.completedAt = Date.now();
            row.receipt.durationMs = (row.nativeFinishedAt ?? row.receipt.completedAt) - (row.receipt.startedAt ?? row.receipt.createdAt);
            try {
                this.save(row);
            }
            catch (error) {
                row.receipt.state = 'unknown';
                row.receipt.error = 'HARNESS_RESEARCH_WORKFLOW_HOST_PERSISTENCE_UNCONFIRMED';
                this.ctx.logger.warn(error instanceof Error ? error.message : row.receipt.error);
            }
        }
    }
    /** Stop original native tools and await their quiescence; terminal receipts remain owned and readable.
     * @param projectId - One project to stop; omit to stop all active operations without preventing later admitted work.
     */
    async close(projectId) {
        const marker = projectId ?? '*';
        this.suspending.add(marker);
        try {
            await Promise.allSettled([...this.queues.values()].filter(row => projectId === undefined || row.projectId === projectId).map(row => row.promise));
            const rows = [...this.rows.values()].filter(row => projectId === undefined || row.owner.projectId === projectId);
            for (const row of rows)
                if (row.receipt.state === 'running') {
                    row.receipt.cancelRequested = true;
                    if (row.nativeFinishedAt === undefined)
                        row.controller.abort('runs.host owner closed');
                }
            await Promise.allSettled(rows.map(row => row.settled));
            for (const row of rows)
                this.rows.delete(row.file);
        }
        finally {
            this.suspending.delete(marker);
        }
    }
    /** Permanently withdraw the effect-owned Host hook and wait for all dispatched tools to stop. */
    async dispose() { if (this.disposed)
        return; this.disposed = true; this.removeDispatch(); await this.close(); }
}
//# sourceMappingURL=research-workflow-host.js.map