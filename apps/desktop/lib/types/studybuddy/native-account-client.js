/** Private stdio owner. Source writes stay serialized; running install controls can proceed. */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { HARNESS_TOOL_METHODS, HARNESS_LABS_METHODS, parseCodexChineseView, HARNESS_SUPPORT_METHODS, parseHarnessSupportRequest, parseHarnessSupportResult, parseHarnessSupportEvent, } from '@studybuddy/contracts';
import { BusinessFailure } from "./business-api.js";
import { parseBusinessResult } from "./business-contracts.js";
import { verifyTrustedNativeRuntime } from "./trusted-native-runtime.js";
import { BUILTIN_PRIVATE_METHODS, parseBuiltinResult } from "./builtin-contracts.js";
export const NATIVE_OPERATIONS = ['getNativeBuiltinCatalog',
    'checkNativeUserSourceV3', 'saveNativeUserSourceV3', 'resumeNativeUserSourceSaveV3', 'listNativeUserSourcesV3',
    'checkNativeUserSource', 'saveNativeUserSource', 'resumeNativeUserSourceSave', 'listNativeUserSources',
    'pingNativeUserModel', 'testNativeUserModel', 'saveNativeUserModel', 'resumeNativeUserModelSave',
    'listNativeUserModelRegistrations', 'getNativeUserModels', 'addNativeUserModel', 'updateNativeUserModel',
    'deleteNativeUserModel', 'reorderNativeUserModels', 'listNativeConnectionUi', 'getNativeToolUserApiUsage'];
const nativeMethods = [...HARNESS_TOOL_METHODS.filter(method => method !== 'pickNativeWorkingDirectory' &&
        method !== 'openNativeToolInstall'), ...NATIVE_OPERATIONS, ...BUILTIN_PRIVATE_METHODS,
    'resolveNativeToolInstallTarget', 'logoutNativeAccount', 'syncNativeModelCatalogs'];
const MAX = 16 * 1024 * 1024;
const installControls = new Set(['getActiveInstall', 'getInstallRun', 'cancelInstall', 'retryInstallComponent',
    'repairInstallComponent', 'resumeInstall', 'exportInstallDiagnostics', 'uploadInstallFailureLogs']);
const installWriters = new Set(['startInstall', 'retryInstallComponent', 'repairInstallComponent', 'resumeInstall']);
const supportWriters = new Set(['uploadSupportLogs', 'submitSupportIssue']);
const sourceReads = new Set(['listNativeUserSourcesV3', 'listNativeUserSources', 'getNativeUserModels',
    'listNativeUserModelRegistrations', 'listBuiltinReadiness', 'getBuiltinSourceDetail']);
const same = (a, b) => a?.accountId === b.accountId && a.generation === b.generation;
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, required, optional = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9-]{1,128}$/u.test(value);
const validScope = (value) => object(value) && keys(value, ['accountId', 'generation']) &&
    identifier(value.accountId) && typeof value.generation === 'number' && Number.isSafeInteger(value.generation) && value.generation >= 0;
const errorCode = (value) => object(value) && typeof value.code === 'string' &&
    /^[A-Z0-9_]{1,128}$/u.test(value.code);
const phases = ['awaiting_confirmation', 'preparing', 'downloading', 'verifying_artifact', 'awaiting_elevation', 'installing',
    'validating', 'reboot_required', 'resume_pending', 'repairing', 'completed', 'failed', 'cancelled'];
const components = ['git', 'git_bash', 'node', 'vs_code', 'cursor', 'visual_studio', 'build_tools', 'rust', 'python', 'wsl',
    'codex', 'claude_code', 'dsh', 'hermes', 'kimicode', 'openclaw', 'workbuddy'];
const repairs = ['redownload', 'reverify', 'reextract', 'rebuild_shim', 'rerun_editor_installer', 'revalidate_editor',
    'rerun_visual_cpp_installer', 'revalidate_visual_cpp', 'rerun_python_installer', 'revalidate_python',
    'retry_wsl_features', 'revalidate_wsl', 'reinstall_ai_tool', 'revalidate_ai_tool'];
const acquisitionStages = ['detect_existing', 'check_verified_cache', 'official_store', 'official_web_installer',
    'studybuddy_china_mirror', 'verify_package_set', 'install_package_set', 'validate_installed_package', 'launch_and_confirm_window'];
function validRun(value) {
    if (!object(value) || !keys(value, ['runId', 'catalogVersion', 'phase', 'components', 'rebootRequired']) ||
        !identifier(value.runId) || typeof value.catalogVersion !== 'string' || !value.catalogVersion ||
        value.catalogVersion.length > 256 || typeof value.phase !== 'string' || !phases.includes(value.phase) ||
        typeof value.rebootRequired !== 'boolean' || !Array.isArray(value.components) || value.components.length > components.length)
        return false;
    const seen = new Set();
    return value.components.every((item) => {
        if (!object(item) || !keys(item, ['componentId', 'phase', 'progressPercent', 'errorCode', 'availableRepairActionIds',
            'codexAcquisitionStage', 'requiresUserAction']) || typeof item.componentId !== 'string' ||
            !components.includes(item.componentId) || seen.has(item.componentId) || typeof item.phase !== 'string' ||
            !phases.includes(item.phase) || typeof item.progressPercent !== 'number' || !Number.isFinite(item.progressPercent) ||
            item.progressPercent < 0 || item.progressPercent > 100 || item.errorCode !== null &&
            !(typeof item.errorCode === 'string' && /^[A-Z0-9_]{1,128}$/u.test(item.errorCode)) ||
            !Array.isArray(item.availableRepairActionIds) || !item.availableRepairActionIds.every(id => typeof id === 'string' && repairs.includes(id)) || item.codexAcquisitionStage !== null &&
            !(typeof item.codexAcquisitionStage === 'string' &&
                acquisitionStages.includes(item.codexAcquisitionStage)) || typeof item.requiresUserAction !== 'boolean')
            return false;
        seen.add(item.componentId);
        return true;
    });
}
function installEvent(value) {
    const payload = value.payload;
    if (!keys(value, ['schemaVersion', 'kind', 'scope', 'streamId', 'runId', 'seq', 'payload']) || !validScope(value.scope) ||
        !identifier(value.streamId) || !identifier(value.runId) || typeof value.seq !== 'number' ||
        !Number.isSafeInteger(value.seq) || value.seq < 1 || !object(payload) || !keys(payload, ['sequence', 'revision', 'run']) ||
        typeof payload.sequence !== 'number' || !Number.isSafeInteger(payload.sequence) || payload.sequence < 0 ||
        typeof payload.revision !== 'number' || !Number.isSafeInteger(payload.revision) || payload.revision < 0 ||
        !object(payload.run) || payload.run.runId !== value.runId ||
        !validRun(payload.run))
        throw new BusinessFailure('NATIVE_PROTOCOL_INVALID');
    // The private companion serializes the original InstallEventView. seq is
    // per stream; payload.sequence/revision remain original durable journal facts.
    return value;
}
function logoutOutcome(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 3
        || !('localCleared' in value) || typeof value.localCleared !== 'boolean'
        || !('remoteRevoked' in value) || typeof value.remoteRevoked !== 'boolean'
        || !('persistentCleanupRequired' in value) ||
        typeof value.persistentCleanupRequired !== 'boolean')
        throw new BusinessFailure('NATIVE_LOGOUT_INVALID');
    return { localCleared: value.localCleared, remoteRevoked: value.remoteRevoked, persistentCleanupRequired: value.persistentCleanupRequired };
}
function logoutRecovery(value) {
    const invalid = () => new BusinessFailure('NATIVE_LOGOUT_RECOVERY_INVALID');
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('state' in value))
        throw invalid();
    if (value.state === 'none') {
        if (Object.keys(value).length !== 1)
            throw invalid();
        return { state: 'none' };
    }
    if ((value.state !== 'pending' && value.state !== 'complete') || !('outcome' in value)
        || Object.keys(value).some(key => !['state', 'outcome', 'error'].includes(key)))
        throw invalid();
    let outcome;
    try {
        outcome = logoutOutcome(value.outcome);
    }
    catch {
        throw invalid();
    }
    if (value.state === 'complete') {
        if (Object.keys(value).length !== 2 || !outcome.localCleared || !outcome.remoteRevoked || outcome.persistentCleanupRequired)
            throw invalid();
        return { state: 'complete', outcome };
    }
    if ('error' in value) {
        const error = value.error;
        if (!error || typeof error !== 'object' || Array.isArray(error) || Object.keys(error).length !== 1 || !('code' in error) ||
            error.code !== 'NATIVE_LOGOUT_RECOVERY_FAILED')
            throw invalid();
        return { state: 'pending', outcome, error: { code: error.code } };
    }
    return { state: 'pending', outcome };
}
/** Validate the exact assembled companion bytes before launching a hidden private child. */
export function trustedNativeRuntime(directory) {
    return { async start() {
            const runtime = await verifyTrustedNativeRuntime(directory);
            const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/u.test(key) && key !== 'STUDYBUDDY_API_BASE_URL'));
            return spawn(join(runtime.directory, runtime.companion), [], { windowsHide: true, stdio: 'pipe', env });
        } };
}
/** Own one account's native process; replacement waits for the old process to exit. */
export class NativeAccountClient {
    runtime;
    #session;
    #active;
    #child;
    #exit = Promise.resolve();
    #queue = Promise.resolve();
    #sourceQueue = Promise.resolve();
    #starting;
    #pending = new Map();
    #parallel = new Set();
    #ready;
    #ack;
    #bytes = Buffer.alloc(0);
    #disposed = false;
    #epoch = 0;
    #logoutSession;
    #logout;
    #recovery;
    #acknowledgment;
    #recoveryLocked = false;
    #recoveryState;
    #completedOutcome;
    #ackSent = false;
    #ackMissingProven = false;
    #streamId;
    #eventSequences = new Map();
    #listeners = new Set();
    #streamListeners = new Set();
    #supportListeners = new Set();
    #supportSequences = new Map();
    constructor(runtime) {
        this.runtime = runtime;
    }
    useSession(session) {
        if (this.#logoutSession || this.#recoveryLocked || this.#disposed)
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        if (this.#session && !same(this.#session.scope, session.scope)) {
            this.#listeners.clear();
            this.#streamListeners.clear();
            this.#supportListeners.clear();
            this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
        }
        this.#session = session;
    }
    revoke() {
        if ((this.#logoutSession || this.#recoveryLocked) && !this.#disposed)
            return;
        this.#listeners.clear();
        this.#supportListeners.clear();
        this.#streamListeners.clear();
        this.#session = undefined;
        this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
    }
    subscribeInstallEvents(scope, listener) {
        if (this.#disposed || this.#recoveryLocked || this.#logoutSession || !same(this.#session?.scope, scope))
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        const entry = { scope: { ...scope }, listener };
        this.#listeners.add(entry);
        return () => this.#listeners.delete(entry);
    }
    /** Subscribe to validated progress for this private account generation.
     * @param scope Current authenticated scope.
     * @param listener Controlled support progress consumer.
     * @returns A disposer that does not cancel an upload. */
    subscribeSupportEvents(scope, listener) {
        if (this.#disposed || this.#recoveryLocked || this.#logoutSession || !same(this.#session?.scope, scope))
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        const entry = { scope: { ...scope }, listener };
        this.#supportListeners.add(entry);
        return () => this.#supportListeners.delete(entry);
    }
    /** Private main-owner notification; never a fabricated install journal event. */
    subscribeInstallStream(scope, listener) {
        if (this.#disposed || this.#recoveryLocked || this.#logoutSession || !same(this.#session?.scope, scope))
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        const entry = { scope: { ...scope }, listener };
        this.#streamListeners.add(entry);
        return () => this.#streamListeners.delete(entry);
    }
    #stop(error) {
        ++this.#epoch;
        for (const pending of this.#pending.values())
            pending.reject(error instanceof BusinessFailure &&
                error.code === 'NATIVE_RESULT_UNKNOWN' ? new BusinessFailure(error.code, error.status, pending.operationId) : error);
        this.#pending.clear();
        this.#ready?.reject(error);
        this.#ready = undefined;
        this.#ack?.reject(error);
        this.#ack = undefined;
        this.#child?.kill();
        this.#child = undefined;
        this.#active = undefined;
        this.#bytes = Buffer.alloc(0);
        this.#streamId = undefined;
        this.#eventSequences.clear();
        this.#supportSequences.clear();
    }
    #send(value) {
        const body = Buffer.from(JSON.stringify(value));
        if (body.length === 0 || body.length > MAX)
            throw new BusinessFailure('NATIVE_FRAME_INVALID');
        const header = Buffer.alloc(4);
        header.writeUInt32LE(body.length);
        const child = this.#child;
        if (!child)
            throw new BusinessFailure('NATIVE_RUNTIME_UNAVAILABLE');
        const frame = Buffer.concat([header, body]);
        child.stdin.write(frame, () => { body.fill(0); frame.fill(0); });
    }
    #receive(chunk) {
        this.#bytes = Buffer.concat([this.#bytes, chunk]);
        while (this.#bytes.length >= 4) {
            const length = this.#bytes.readUInt32LE(0);
            if (length === 0 || length > MAX) {
                this.#stop(new BusinessFailure('NATIVE_FRAME_INVALID'));
                return;
            }
            if (this.#bytes.length < 4 + length)
                return;
            let value;
            try {
                value = JSON.parse(this.#bytes.subarray(4, 4 + length).toString('utf8'));
            }
            catch {
                this.#stop(new BusinessFailure('NATIVE_FRAME_INVALID'));
                return;
            }
            this.#bytes.subarray(0, 4 + length).fill(0);
            this.#bytes = this.#bytes.subarray(4 + length);
            if (!object(value) || value.schemaVersion !== 2) {
                this.#stop(new BusinessFailure('NATIVE_PROTOCOL_INVALID'));
                return;
            }
            if (this.#ready) {
                const ready = this.#ready;
                const active = this.#active;
                const recovery = this.#ready.recovery;
                const valid = recovery ? value.kind === 'logout-recovery' && keys(value, ['schemaVersion', 'kind', 'ready'], value.ready === true ? ['logoutRecovery'] : ['error']) : value.kind === 'ready' && keys(value, ['schemaVersion', 'kind',
                    'ready', 'scope', 'streamId'], ['error']) && validScope(value.scope) && !!active && same(value.scope, active.scope) &&
                    identifier(value.streamId);
                if (!valid || typeof value.ready !== 'boolean' || recovery && value.ready === true && !Object.hasOwn(value, 'logoutRecovery')) {
                    this.#stop(new BusinessFailure(recovery ? 'NATIVE_LOGOUT_RECOVERY_INVALID' : 'NATIVE_RUNTIME_INVALID'));
                    return;
                }
                if (value.ready === false) {
                    this.#stop(new BusinessFailure(errorCode(value.error) ? value.error.code : 'NATIVE_RUNTIME_INVALID'));
                    return;
                }
                if (!recovery && active) {
                    this.#streamId = value.streamId;
                    this.#eventSequences.clear();
                    const scope = active.scope, streamId = this.#streamId;
                    for (const entry of this.#streamListeners) {
                        if (this.#ready !== ready)
                            break;
                        if (same(entry.scope, scope)) {
                            try {
                                entry.listener(streamId);
                            }
                            catch { }
                        }
                    }
                }
                if (this.#ready !== ready)
                    return;
                ready.resolve(value);
                this.#ready = undefined;
                continue;
            }
            if (this.#ack) {
                if (value.kind !== 'logout-ack' || !keys(value, ['schemaVersion', 'kind', 'acknowledged'], ['error'])) {
                    this.#stop(new BusinessFailure('NATIVE_LOGOUT_ACK_INVALID'));
                    return;
                }
                const ack = this.#ack;
                if (value.acknowledged === true && Object.keys(value).length === 3) {
                    this.#ack = undefined;
                    ack.resolve();
                    continue;
                }
                if (value.acknowledged === false && Object.keys(value).length === 4 && 'error' in value && value.error && typeof value.error === 'object'
                    && Object.keys(value.error).length === 1 && 'code' in value.error && value.error.code === 'NATIVE_LOGOUT_ACK_FAILED') {
                    this.#ack = undefined;
                    this.#ackSent = false;
                    ack.reject(new BusinessFailure('NATIVE_LOGOUT_ACK_FAILED'));
                    continue;
                }
                this.#stop(new BusinessFailure('NATIVE_LOGOUT_ACK_INVALID'));
                return;
            }
            if (value.kind === 'install-event') {
                let event;
                try {
                    event = installEvent(value);
                }
                catch {
                    this.#stop(new BusinessFailure('NATIVE_PROTOCOL_INVALID'));
                    return;
                }
                if (this.#disposed || this.#logoutSession || this.#recoveryLocked || !same(this.#session?.scope, event.scope)
                    || !same(this.#active?.scope, event.scope) || event.streamId !== this.#streamId)
                    continue;
                if (event.seq <= (this.#eventSequences.get(event.runId) ?? 0))
                    continue;
                this.#eventSequences.set(event.runId, event.seq);
                for (const entry of this.#listeners)
                    if (same(entry.scope, event.scope)) {
                        try {
                            entry.listener(event);
                        }
                        catch { }
                    }
                continue;
            }
            if (value.kind === 'support-event') {
                if (!keys(value, ['schemaVersion', 'kind', 'scope', 'streamId', 'payload']) || !validScope(value.scope) ||
                    typeof value.streamId !== 'string') {
                    this.#stop(new BusinessFailure('NATIVE_PROTOCOL_INVALID'));
                    return;
                }
                let event;
                try {
                    event = parseHarnessSupportEvent(value.payload);
                }
                catch (_error) {
                    this.#stop(new BusinessFailure('NATIVE_PROTOCOL_INVALID'));
                    return;
                }
                if (this.#disposed || this.#logoutSession || this.#recoveryLocked || !same(this.#session?.scope, value.scope) ||
                    !same(this.#active?.scope, value.scope) || value.streamId !== this.#streamId)
                    continue;
                if (event.sequence <= (this.#supportSequences.get(event.requestId) ?? 0))
                    continue;
                this.#supportSequences.set(event.requestId, event.sequence);
                for (const entry of this.#supportListeners)
                    if (same(entry.scope, value.scope)) {
                        try {
                            entry.listener(event);
                        }
                        catch (_error) { /* A consumer cannot invalidate the authoritative unary result or another listener. */ }
                    }
                continue;
            }
            const pending = typeof value.requestId === 'string' ? this.#pending.get(value.requestId) : undefined;
            if (!pending || value.kind !== 'reply' || !keys(value, ['schemaVersion', 'kind', 'requestId', 'scope', 'data', 'error']) ||
                !identifier(value.requestId) || value.requestId !== pending.requestId || !validScope(value.scope) || !same(value.scope, pending.scope) || value.error !== null && !errorCode(value.error)) {
                this.#stop(new BusinessFailure('NATIVE_PROTOCOL_INVALID'));
                return;
            }
            this.#pending.delete(pending.requestId);
            if (value.error !== null) {
                const error = value.error;
                const code = error.code;
                const details = error;
                const requestId = details.requestId ?? details.request_id;
                pending.reject(new BusinessFailure(code, undefined, pending.operationId, {
                    ...(typeof details.message === 'string' && details.message.length <= 4096 ? { message: details.message } : {}),
                    ...(typeof requestId === 'string' && requestId.length <= 256 ? { requestId } : {}),
                    ...(typeof details.availableAt === 'string' && details.availableAt.length <= 128 ? { availableAt: details.availableAt } : {}),
                }));
                if (code === 'NATIVE_SESSION_RESTART_REQUIRED')
                    this.#stop(new BusinessFailure(code));
            }
            else
                pending.resolve(value.data);
        }
    }
    async #start(session) {
        const epoch = this.#epoch;
        await this.#exit;
        if (this.#disposed || this.#epoch !== epoch || !same(this.#session?.scope, session.scope))
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        const child = await this.runtime.start();
        if (this.#disposed || this.#epoch !== epoch || !same(this.#session?.scope, session.scope)) {
            const closed = new Promise(resolve => child.once('close', () => resolve()));
            child.kill();
            await closed;
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        }
        this.#active = session;
        this.#attach(child);
        const ready = new Promise((resolve, reject) => { this.#ready = { resolve, reject, recovery: false }; });
        this.#send({ schemaVersion: 2, scope: session.scope, accessToken: session.accessToken });
        const timer = setTimeout(() => this.#stop(new BusinessFailure('NATIVE_RUNTIME_UNAVAILABLE')), 15_000);
        try {
            await ready;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async #ensureStarted(session) {
        if (this.#starting && same(this.#starting.session.scope, session.scope)
            && this.#starting.session.accessToken === session.accessToken)
            return this.#starting.promise;
        if (this.#active?.accessToken === session.accessToken && same(this.#active.scope, session.scope) && !this.#ready)
            return;
        this.#stop(new BusinessFailure('NATIVE_SESSION_REPLACED'));
        const starting = { session, promise: this.#start(session) };
        this.#starting = starting;
        try {
            await starting.promise;
        }
        finally {
            if (this.#starting === starting)
                this.#starting = undefined;
        }
    }
    #attach(child) {
        this.#child = child;
        this.#exit = new Promise((resolve) => {
            child.once('close', () => {
                if (this.#child === child) {
                    this.#stop(new BusinessFailure('NATIVE_RESULT_UNKNOWN'));
                }
                resolve();
            });
        });
        child.stdout.on('data', (chunk) => { if (this.#child === child)
            this.#receive(chunk); });
        child.stderr.resume();
        child.on('error', () => { if (this.#child === child)
            this.#stop(new BusinessFailure('NATIVE_RUNTIME_UNAVAILABLE')); });
    }
    invoke(scope, method, args) {
        if (!nativeMethods.includes(method) || !Array.isArray(args) ||
            args.length > 3)
            return Promise.reject(new BusinessFailure('NATIVE_OPERATION_DENIED'));
        if (this.#logoutSession || this.#recoveryLocked)
            return Promise.reject(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
        const execute = async () => {
            const session = this.#session;
            if (!session || !same(session.scope, scope) || this.#disposed || this.#logoutSession ||
                this.#recoveryLocked)
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            const operationId = method.startsWith('resume') ? typeof args[0] === 'string' ? args[0] : undefined : args[0] &&
                typeof args[0] === 'object' && 'operationId' in args[0] && typeof args[0].operationId === 'string' ? args[0].operationId : undefined;
            const result = await this.#call(session, method, args, operationId);
            // Preserve original account DTO parsers. Other methods use the closed
            // native map backed by the original Rust serializers and service proofs.
            return (BUILTIN_PRIVATE_METHODS.some(privateMethod => privateMethod === method) ? parseBuiltinResult(method, result)
                : NATIVE_OPERATIONS.some(accountMethod => accountMethod === method) ? parseBusinessResult(method, result) :
                    HARNESS_LABS_METHODS.some(labMethod => labMethod === method) ? parseCodexChineseView(result) : result);
        };
        if (sourceReads.has(method)) {
            const run = this.#sourceQueue.then(() => {
                if (this.#pending.size >= 32)
                    throw new BusinessFailure('NATIVE_REQUEST_LIMIT');
                return execute();
            });
            this.#sourceQueue = run.then(() => undefined, () => undefined);
            this.#parallel.add(run);
            void run.then(() => this.#parallel.delete(run), () => this.#parallel.delete(run));
            return run;
        }
        // Original install coordinators expose cancellation while a start/resume
        // awaits completion. Do not queue these controls behind that writer.
        if (installControls.has(method) && this.#pending.size
            && this.#active?.accessToken === this.#session?.accessToken && same(this.#active?.scope, scope) && !this.#ready) {
            if (this.#pending.size >= 32)
                return Promise.reject(new BusinessFailure('NATIVE_REQUEST_LIMIT'));
            const parallel = execute();
            this.#parallel.add(parallel);
            void parallel.then(() => this.#parallel.delete(parallel), () => this.#parallel.delete(parallel));
            return parallel;
        }
        const run = this.#queue.then(execute);
        this.#queue = run.then(() => undefined, () => undefined);
        return run;
    }
    /** Main-owned private built-in RPC; this allowlist is never published to tool pages.
     * @param scope Current authenticated account generation.
     * @param method Closed built-in native capability.
     * @param args Arguments owned by Main rather than renderer JSON.
     * @returns Parsed native result after account fencing. */
    invokeBuiltin(scope, method, args) {
        if (!BUILTIN_PRIVATE_METHODS.some(allowed => allowed === method))
            return Promise.reject(new BusinessFailure('NATIVE_OPERATION_DENIED'));
        return this.invoke(scope, method, args).then(value => value);
    }
    /** Closed support RPC, independent of the tool-page allowlist and its serialized writes.
     * @param scope Main's current authenticated account generation.
     * @param method Private support operation.
     * @param args Validated support arguments; trusted file paths are main-only.
     * @returns Parsed native support result after the original session checks. */
    invokeSupport(scope, method, args) {
        if (!HARNESS_SUPPORT_METHODS.some(allowed => allowed === method))
            return Promise.reject(new BusinessFailure('NATIVE_OPERATION_DENIED'));
        let parsed;
        try {
            parsed = parseHarnessSupportRequest(method, args);
        }
        catch (_error) {
            return Promise.reject(new BusinessFailure('HARNESS_SUPPORT_INVALID'));
        }
        const execute = async () => {
            const session = this.#session;
            if (!session || this.#disposed || this.#logoutSession || this.#recoveryLocked || !same(session.scope, scope))
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            return parseHarnessSupportResult(method, await this.#call(session, method, parsed));
        };
        if (this.#active?.accessToken === this.#session?.accessToken && same(this.#active?.scope, scope) && !this.#ready) {
            if (this.#pending.size >= 32)
                return Promise.reject(new BusinessFailure('NATIVE_REQUEST_LIMIT'));
            const parallel = execute();
            this.#parallel.add(parallel);
            void parallel.then(() => this.#parallel.delete(parallel), () => this.#parallel.delete(parallel));
            return parallel;
        }
        const run = this.#queue.then(execute);
        this.#queue = run.then(() => undefined, () => undefined);
        return run;
    }
    async #call(session, method, args, operationId) {
        await this.#ensureStarted(session);
        if (this.#logoutSession && method !== 'logoutNativeAccount')
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        const scope = session.scope, requestId = randomUUID();
        const result = new Promise((resolve, reject) => {
            this.#pending.set(requestId, { requestId, scope, resolve, reject, ...(operationId ? { operationId } : {}) });
        });
        this.#send({ schemaVersion: 2, requestId, scope, method, args });
        const support = HARNESS_SUPPORT_METHODS.some(allowed => allowed === method);
        const sourceRead = sourceReads.has(method);
        // A report contains multiple bounded 120-second PUTs and metadata retries.
        // Use the existing long-work budget; timing out support must not kill other native work.
        const timer = setTimeout(() => {
            const error = new BusinessFailure(sourceRead ? 'NATIVE_READ_TIMEOUT' : 'NATIVE_RESULT_UNKNOWN', undefined, operationId);
            // Retain correlation until the late receipt arrives; it is not a new RPC or a retry.
            if (support || sourceRead)
                this.#pending.get(requestId)?.reject(error);
            else
                this.#stop(error);
        }, sourceRead ? 15_000 : installWriters.has(method) || supportWriters.has(method) ? 30 * 60_000 : 120_000);
        try {
            const value = await result;
            if (!same(this.#session?.scope, scope) || this.#disposed)
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            return value;
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** Main-only exact logout. Failed proof retains the original process checkpoint.
     * @param session Current private login whose native authorization must be revoked.
     * @returns Original logout facts after old work terminates; rejects unconfirmed proof.
     */
    logout(session) {
        if (this.#disposed || this.#recoveryLocked || this.#logoutSession && (!same(this.#logoutSession.scope, session.scope)
            || this.#logoutSession.accessToken !== session.accessToken)
            || this.#session && !same(this.#session.scope, session.scope))
            return Promise.reject(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
        if (this.#logout)
            return this.#logout;
        const retry = this.#logoutSession !== undefined;
        this.#logoutSession = session;
        this.#session = session;
        if (!retry)
            this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
        const run = this.#queue.then(async () => {
            const outcome = logoutOutcome(await this.#call(session, 'logoutNativeAccount', []));
            if (outcome.localCleared && outcome.remoteRevoked && !outcome.persistentCleanupRequired) {
                this.#completedOutcome = outcome;
                this.#recoveryLocked = true;
                this.#logoutSession = undefined;
                this.#session = undefined;
                this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
                await this.#exit;
            }
            return outcome;
        });
        this.#queue = run.then(() => undefined, () => undefined);
        this.#logout = run.finally(() => { this.#logout = undefined; });
        return this.#logout;
    }
    /** Main-only recovery: no credential, account scope, endpoint or arbitrary operation is accepted. */
    recoverLogout() {
        if (this.#disposed)
            return Promise.reject(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
        if (this.#recovery)
            return this.#recovery;
        if (this.#acknowledgment)
            return Promise.reject(new BusinessFailure('NATIVE_LOGOUT_ACK_IN_PROGRESS'));
        this.#recoveryLocked = true;
        this.#session = undefined;
        this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
        const run = this.#queue.then(() => this.#recover());
        this.#queue = run.then(() => undefined, () => undefined);
        this.#recovery = run.finally(() => { this.#recovery = undefined; });
        return this.#recovery;
    }
    async #recover() {
        await this.#exit;
        const epoch = this.#epoch;
        if (this.#disposed)
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        const child = await this.runtime.start();
        if (this.#disposed || this.#epoch !== epoch) {
            const closed = new Promise(resolve => child.once('close', () => resolve()));
            child.kill();
            await closed;
            throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
        }
        this.#attach(child);
        const ready = new Promise((resolve, reject) => { this.#ready = { resolve, reject, recovery: true }; });
        this.#send({ schemaVersion: 2, mode: 'recoverLogout' });
        const timer = setTimeout(() => this.#stop(new BusinessFailure('NATIVE_RUNTIME_UNAVAILABLE')), 120_000);
        try {
            const frame = await ready;
            if (this.#disposed || this.#epoch !== epoch)
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            const recovery = logoutRecovery(frame.logoutRecovery);
            this.#recoveryState = recovery;
            if (recovery.state === 'none') {
                this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
                await this.#exit;
                if (this.#completedOutcome) {
                    if (!this.#ackSent)
                        throw new BusinessFailure('NATIVE_LOGOUT_CHECKPOINT_MISSING');
                    // The checkpoint can be absent only after this owner sent the final ACK.
                    this.#ackMissingProven = true;
                    return this.#recoveryState = { state: 'complete', outcome: this.#completedOutcome };
                }
                this.#recoveryLocked = false;
                this.#logoutSession = undefined;
            }
            else if (recovery.state === 'complete') {
                this.#completedOutcome = recovery.outcome;
                this.#ackMissingProven = false;
            }
            return recovery;
        }
        catch (error) {
            this.#stop(error instanceof Error ? error : new BusinessFailure('NATIVE_LOGOUT_RECOVERY_INVALID'));
            await this.#exit;
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** Acknowledge only after the main auth owner has removed its own refresh credential. */
    acknowledgeLogout() {
        if (this.#disposed)
            return Promise.reject(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
        if (this.#acknowledgment)
            return this.#acknowledgment;
        const run = this.#queue.then(async () => {
            if (this.#disposed || !this.#recoveryLocked || !this.#completedOutcome)
                throw new BusinessFailure('NATIVE_LOGOUT_NOT_COMPLETE');
            if (!this.#ackMissingProven && (!this.#child || this.#recoveryState?.state !== 'complete')) {
                this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
                await this.#recover();
            }
            if (this.#disposed || this.#recoveryState?.state !== 'complete')
                throw new BusinessFailure('NATIVE_LOGOUT_NOT_COMPLETE');
            if (!this.#ackMissingProven) {
                const acknowledged = new Promise((resolve, reject) => { this.#ack = { resolve, reject }; });
                const timer = setTimeout(() => this.#stop(new BusinessFailure('NATIVE_RESULT_UNKNOWN')), 15_000);
                try {
                    this.#send({ schemaVersion: 2, mode: 'acknowledgeLogout' });
                    this.#ackSent = true;
                    await acknowledged;
                }
                finally {
                    clearTimeout(timer);
                }
            }
            this.#stop(new BusinessFailure('ACCOUNT_SCOPE_CHANGED'));
            await this.#exit;
            if (this.#disposed)
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            this.#recoveryLocked = false;
            this.#recoveryState = undefined;
            this.#completedOutcome = undefined;
            this.#logoutSession = undefined;
            this.#session = undefined;
            this.#ackSent = false;
            this.#ackMissingProven = false;
        });
        this.#queue = run.then(() => undefined, () => undefined);
        this.#acknowledgment = run.finally(() => { this.#acknowledgment = undefined; });
        return this.#acknowledgment;
    }
    async dispose() { this.#disposed = true; this.revoke(); await Promise.allSettled([this.#exit, this.#queue, ...this.#parallel]); }
}
//# sourceMappingURL=native-account-client.js.map