/** Electron Node-mode child lifecycle for the shared Web application. */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { parsePlatformRequest, parsePlatformPrepared } from '@deepseek-ai/dsh-llm-studybuddy-builtin';
import { BusinessFailure } from "./studybuddy/business-api.js";
import { parseNativeBuiltinCatalogAppliedV1, parseNativeBuiltinFrozenRequestV1, parseNativeBuiltinHostContextV1, parseNativeBuiltinRequestFreezeV1, parseNativeBuiltinValidationResultV1, parseHarnessMediaInvocationV1, parseHarnessMediaContextV1, parseHarnessResearchToolInvocationV1, parseHarnessResearchContextV1, parseHarnessAigcToolInvocationV1, parseHarnessAigcContextV1, parseHarnessCapabilityInvocationV1, } from '@studybuddy/contracts';
import { parseSearchInvocation } from '@deepseek-ai/dsh-web-search-studybuddy';
import { desktopNodeEnvironment } from "./node-environment.js";
import { parseSkillSafetyInvocation, parseSkillSafetyContext } from '@deepseek-ai/dsh-skill-safety-assistant/wire';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
import { SkillScannerResourceError } from "./studybuddy/skill-safety-release.js";
import { parseVideoToolInvocation } from "./studybuddy/video-wire.js";
/** Quit inspection deadline; a slower Host counts as unknown work and the shell asks before quitting. */
export const QUIT_INSPECTION_DEADLINE_MS = 2_000;
const MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024;
function isDesktopHostEvent(message) {
    if (typeof message !== 'object' || message === null || !('type' in message))
        return false;
    const candidate = message;
    switch (candidate.type) {
        case 'search-request':
        case 'search-cancel': try {
            parseSearchInvocation(candidate.request);
            return true;
        }
        catch {
            return false;
        }
        case 'shutdown-complete':
            return true;
        case 'ready':
            return typeof candidate.url === 'string' && (candidate.hostGeneration === undefined || typeof candidate.hostGeneration === 'string'
                && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate.hostGeneration));
        case 'builtin-control':
            return Number.isSafeInteger(candidate.requestId) && Object.hasOwn(candidate, 'data')
                && (candidate.error === undefined || typeof candidate.error === 'string' && /^BUILTIN_[A-Z_]{1,64}$/.test(candidate.error));
        case 'research-control':
        case 'capability-control':
        case 'video-control':
        case 'aigc-control':
            return Number.isSafeInteger(candidate.requestId) && Object.hasOwn(candidate, 'data') &&
                (candidate.error === undefined || typeof candidate.error === 'string' && /^[A-Z0-9_]{1,128}$/.test(candidate.error));
        case 'skill-safety-control':
            return Number.isSafeInteger(candidate.requestId) && Object.hasOwn(candidate, 'data') && (candidate.error === undefined || typeof candidate.error === 'string' && /^SKILL_SAFETY_[A-Z_]{1,64}$/.test(candidate.error));
        case 'skill-safety-request':
            try {
                parseSkillSafetyInvocation(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'skill-safety-cancel':
            try {
                parseSkillSafetyContext(candidate.context);
                return typeof candidate.rpcId === 'string' && /^[a-f0-9-]{36}$/.test(candidate.rpcId);
            }
            catch {
                return false;
            }
        case 'builtin-admit':
            try {
                parseNativeBuiltinRequestFreezeV1(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'media-request':
            try {
                parseHarnessMediaInvocationV1(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'capability-request':
            try {
                parseHarnessCapabilityInvocationV1(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'capability-cancel':
            try {
                parseHarnessCapabilityInvocationV1({ schemaVersion: 1, rpcId: candidate.rpcId, caller: candidate.caller, operation: 'catalog', target: null, input: null });
                return true;
            }
            catch {
                return false;
            }
        case 'research-tool-request':
            try {
                parseHarnessResearchToolInvocationV1(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'video-tool-request':
            try {
                parseVideoToolInvocation(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'video-tool-cancel':
            return typeof candidate.rpcId === 'string' && /^[a-f0-9-]{36}$/.test(candidate.rpcId) && typeof candidate.hostGeneration === 'string' && !!candidate.scope && typeof candidate.scope === 'object';
        case 'aigc-tool-request':
            try {
                parseHarnessAigcToolInvocationV1(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'aigc-tool-cancel':
            try {
                parseHarnessAigcContextV1(candidate.context);
                return typeof candidate.rpcId === 'string' && /^[a-f0-9-]{36}$/.test(candidate.rpcId);
            }
            catch {
                return false;
            }
        case 'research-tool-cancel':
            try {
                parseHarnessResearchContextV1(candidate.context);
                return typeof candidate.rpcId === 'string' && /^[a-f0-9-]{36}$/.test(candidate.rpcId);
            }
            catch {
                return false;
            }
        case 'media-cancel':
            try {
                parseHarnessMediaContextV1(candidate.context);
                return typeof candidate.rpcId === 'string' && /^[a-f0-9-]{36}$/.test(candidate.rpcId);
            }
            catch {
                return false;
            }
        case 'platform-admit':
            try {
                parsePlatformRequest(candidate.request);
                return true;
            }
            catch {
                return false;
            }
        case 'platform-session': {
            const session = candidate.session;
            if (session === null)
                return true;
            if (typeof session !== 'object' || !('origin' in session) || !('token' in session)
                || typeof session.origin !== 'string' || typeof session.token !== 'string' || session.token.length === 0)
                return false;
            if (!('userId' in session) || (session.userId !== null
                && (typeof session.userId !== 'string' || session.userId.length === 0)))
                return false;
            if ('embeddedPageDist' in session && typeof session.embeddedPageDist !== 'string')
                return false;
            if ('requestHeaders' in session && (typeof session.requestHeaders !== 'object' || session.requestHeaders === null
                || Array.isArray(session.requestHeaders)
                || Object.entries(session.requestHeaders).some(([name, value]) => typeof value !== 'string'
                    || name !== name.toLowerCase() || /[\r\n]/.test(value)
                    || ['authorization', 'x-dsh-auth-token', 'host', 'content-length', 'transfer-encoding', 'connection',
                        'content-type'].includes(name))))
                return false;
            try {
                const url = new URL(session.origin);
                return url.origin === session.origin && !url.username && !url.password
                    && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
            }
            catch {
                return false;
            }
        }
        case 'fatal':
            return typeof candidate.message === 'string' && (candidate.diagnostic === undefined || typeof candidate.diagnostic === 'string');
        case 'update-tasks':
            return Number.isSafeInteger(candidate.requestId) && typeof candidate.active === 'boolean'
                && (candidate.error === undefined || typeof candidate.error === 'string');
        case 'quit-inspection':
            return Number.isSafeInteger(candidate.requestId) && typeof candidate.activeTasks === 'boolean'
                && typeof candidate.scheduledTasks === 'boolean' && (candidate.error === undefined || typeof candidate.error === 'string');
        default:
            return false;
    }
}
async function exitsWithin(exit, milliseconds) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => { resolve(false); }, milliseconds);
        timer.unref();
    });
    try {
        return await Promise.race([exit.then(() => true), timeout]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/** The child has exited, but task teardown did not finish successfully. */
export class DesktopHostUncleanExitError extends Error {
}
/**
 * A Host failure reported over IPC before the process exited. `message` is what
 * the Host chose to show; `diagnostic` is its complete inspected error, kept
 * separately so a crash report can print it verbatim instead of a string escaped
 * inside another error's properties.
 */
export class DesktopHostFatalError extends Error {
    #diagnostic;
    /**
     * @param message - The Host's failure message.
     * @param diagnostic - The Host's inspected error, when the Host supplied one.
     */
    constructor(message, diagnostic) {
        super(message);
        this.#diagnostic = diagnostic;
    }
    /** The Host's inspected error; a getter so `util.inspect` of this error does not repeat it as an escaped property. */
    get diagnostic() { return this.#diagnostic; }
}
/** One Web backend running under the Electron executable in Node mode. */
export class DesktopHostProcess {
    node;
    runtimeDir;
    projectDir;
    inspectPort;
    environment;
    onFailure;
    primaryRuntime;
    packageManager;
    onPlatformSession;
    onBuiltinRequest;
    onPlatformRequest;
    onMediaRequest;
    onResearchToolRequest;
    onSkillSafetyRequest;
    onSearchRequest;
    onAigcToolRequest;
    onVideoToolRequest;
    onCapabilityRequest;
    child;
    readyResolve;
    readyReject;
    readyPromise = new Promise((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
    });
    exitPromise;
    stderr = '';
    failureReported = false;
    stopping = false;
    shutdownCompleted = false;
    nextControlId = 1;
    hostGeneration;
    searchRequests = new Map();
    mediaRequests = new Map();
    researchToolRequests = new Map();
    aigcToolRequests = new Map();
    videoToolRequests = new Map();
    capabilityRequests = new Map();
    capabilityTasks = new Set();
    skillSafetyRequests = new Map();
    controlRequests = new Map();
    /**
     * @param node - Absolute Electron executable in Node mode.
     * @param runtimeDir - Immutable packages carried by the current application.
     * @param projectDir - Desktop plugin profile and child working directory.
     * @param inspectPort - Optional loopback inspector port for workspace development.
     * @param environment - Environment inherited by the Host and its plugin subprocesses.
     * @param onFailure - Receives the first unexpected child failure, including after readiness.
     * @param primaryRuntime - Optional bundled dependency payload; when supplied, missing sibling
     *   `office-skills` resources fail Host startup.
     * @param packageManager - Bundled pnpm entry and Node launcher directory, scoped to package operations.
     * @param onPlatformSession - Private credential updates for embedded Platform views.
     */
    constructor(node, runtimeDir, projectDir, inspectPort, environment = process.env, onFailure, primaryRuntime, packageManager, onPlatformSession, onBuiltinRequest, onPlatformRequest, onMediaRequest, onResearchToolRequest, onSkillSafetyRequest, onSearchRequest, onAigcToolRequest, onVideoToolRequest, onCapabilityRequest) {
        this.node = node;
        this.runtimeDir = runtimeDir;
        this.projectDir = projectDir;
        this.inspectPort = inspectPort;
        this.environment = environment;
        this.onFailure = onFailure;
        this.primaryRuntime = primaryRuntime;
        this.packageManager = packageManager;
        this.onPlatformSession = onPlatformSession;
        this.onBuiltinRequest = onBuiltinRequest;
        this.onPlatformRequest = onPlatformRequest;
        this.onMediaRequest = onMediaRequest;
        this.onResearchToolRequest = onResearchToolRequest;
        this.onSkillSafetyRequest = onSkillSafetyRequest;
        this.onSearchRequest = onSearchRequest;
        this.onAigcToolRequest = onAigcToolRequest;
        this.onVideoToolRequest = onVideoToolRequest;
        this.onCapabilityRequest = onCapabilityRequest;
    }
    /**
     * Start this child once and await its Web application URL.
     * @returns Ready facts supplied by the child after application startup.
     */
    async start() {
        if (this.child !== undefined)
            return this.readyPromise;
        const entry = join(this.runtimeDir, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js');
        const child = spawn(this.node, [
            '--expose-internals',
            ...(this.inspectPort === undefined ? [] : [`--inspect=127.0.0.1:${String(this.inspectPort)}`]),
            entry,
            this.runtimeDir,
            this.projectDir,
            this.primaryRuntime ?? join(this.runtimeDir, '..', 'runtime', 'primary-runtime'),
            ...this.packageManager === undefined ? [] : [this.packageManager.pnpm, this.packageManager.nodeBin],
        ], {
            cwd: this.projectDir,
            env: desktopNodeEnvironment(this.node, undefined, this.environment),
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        this.child = child;
        child.stderr?.setEncoding('utf8');
        child.stderr?.on('data', (chunk) => { this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS); });
        child.stdout?.pipe(process.stdout);
        child.on('message', (message) => {
            if (!isDesktopHostEvent(message)) {
                this.fail(new Error('dsh desktop host sent an invalid IPC event'));
                child.kill('SIGTERM');
                return;
            }
            if (message.type === 'ready') {
                this.hostGeneration = message.hostGeneration;
                this.readyResolve({
                    url: message.url, injections: message.injections,
                    ...message.hostGeneration === undefined ? {} : { hostGeneration: message.hostGeneration },
                });
            }
            else if (message.type === 'builtin-admit') {
                void (async () => {
                    const request = parseNativeBuiltinRequestFreezeV1(message.request);
                    try {
                        if (this.stopping || this.failureReported || request.hostGeneration !== this.hostGeneration ||
                            this.onBuiltinRequest === undefined)
                            throw new Error('BUILTIN_HOST_UNAVAILABLE');
                        const data = parseNativeBuiltinFrozenRequestV1(await this.onBuiltinRequest(request));
                        if (!this.stopping && child.connected)
                            child.send({
                                type: 'builtin-admit-result', clientRequestId: request.clientRequestId, data,
                            });
                    }
                    catch {
                        if (child.connected)
                            child.send({
                                type: 'builtin-admit-result', clientRequestId: request.clientRequestId,
                                data: null, error: 'BUILTIN_REQUEST_NOT_ADMITTED',
                            });
                    }
                })();
            }
            else if (message.type === 'search-request') {
                const request = parseSearchInvocation(message.request), controller = new AbortController();
                void (async () => {
                    try {
                        if (this.stopping || this.failureReported || request.context.hostGeneration !== this.hostGeneration || !this.onSearchRequest || this.searchRequests.has(request.rpcId) || this.searchRequests.size >= 64)
                            throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED');
                        this.searchRequests.set(request.rpcId, controller);
                        const data = await this.onSearchRequest(request, controller.signal);
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'search-result', rpcId: request.rpcId, data });
                    }
                    catch (error) {
                        if (!this.stopping && child.connected)
                            child.send({ type: 'search-result', rpcId: request.rpcId, data: null, error: error instanceof Error && /^STUDYBUDDY_SEARCH_[A-Z_]+$/.test(error.message) ? error.message : 'STUDYBUDDY_SEARCH_UNAVAILABLE' });
                    }
                    finally {
                        this.searchRequests.delete(request.rpcId);
                    }
                })();
            }
            else if (message.type === 'search-cancel') {
                this.searchRequests.get(message.request.rpcId)?.abort();
            }
            else if (message.type === 'skill-safety-request') {
                const request = parseSkillSafetyInvocation(message.request), controller = new AbortController();
                if (this.skillSafetyRequests.has(request.rpcId)) {
                    this.fail(new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT'));
                    return;
                }
                const settled = Promise.resolve().then(async () => {
                    try {
                        if (this.stopping || this.failureReported || request.context.hostGeneration !== this.hostGeneration || !this.onSkillSafetyRequest || this.skillSafetyRequests.size > 64)
                            throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE');
                        const data = await this.onSkillSafetyRequest(request, controller.signal);
                        if (child.connected)
                            child.send({ type: 'skill-safety-result', rpcId: request.rpcId, data });
                    }
                    catch (error) {
                        if (child.connected)
                            child.send({ type: 'skill-safety-result', rpcId: request.rpcId, data: null, error: error instanceof SkillSafetyError || error instanceof SkillScannerResourceError ? error.code : 'SKILL_SAFETY_UNAVAILABLE' });
                    }
                    finally {
                        this.skillSafetyRequests.delete(request.rpcId);
                    }
                });
                this.skillSafetyRequests.set(request.rpcId, { context: request.context, controller, settled });
            }
            else if (message.type === 'skill-safety-cancel') {
                const row = this.skillSafetyRequests.get(message.rpcId);
                if (row && JSON.stringify(row.context) === JSON.stringify(message.context))
                    row.controller.abort();
            }
            else if (message.type === 'aigc-tool-request') {
                const request = parseHarnessAigcToolInvocationV1(message.request), controller = new AbortController();
                void (async () => {
                    try {
                        if (this.stopping || this.failureReported || request.context.hostGeneration !== this.hostGeneration || !this.onAigcToolRequest || this.aigcToolRequests.has(request.rpcId) || this.aigcToolRequests.size >= 128)
                            throw Error('AIGC_SCOPE_REVOKED');
                        this.aigcToolRequests.set(request.rpcId, { context: request.context, controller });
                        const data = await this.onAigcToolRequest(request, controller.signal);
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'aigc-tool-result', rpcId: request.rpcId, data });
                    }
                    catch (error) {
                        if (!this.stopping && child.connected)
                            child.send({ type: 'aigc-tool-result', rpcId: request.rpcId, data: null,
                                error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'AIGC_TOOL_UNAVAILABLE' });
                    }
                    finally {
                        this.aigcToolRequests.delete(request.rpcId);
                    }
                })();
            }
            else if (message.type === 'aigc-tool-cancel') {
                const row = this.aigcToolRequests.get(message.rpcId);
                if (row && JSON.stringify(row.context) === JSON.stringify(message.context))
                    row.controller.abort();
            }
            else if (message.type === 'research-tool-request') {
                const request = parseHarnessResearchToolInvocationV1(message.request), controller = new AbortController();
                void (async () => {
                    try {
                        if (this.stopping || this.failureReported || request.context.hostGeneration !== this.hostGeneration || !this.onResearchToolRequest || this.researchToolRequests.has(request.rpcId))
                            throw Error('HARNESS_RESEARCH_SCOPE_REVOKED');
                        this.researchToolRequests.set(request.rpcId, { context: request.context, controller });
                        const data = await this.onResearchToolRequest(request, controller.signal);
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'research-tool-result', rpcId: request.rpcId, data });
                    }
                    catch (error) {
                        if (!this.stopping && child.connected)
                            child.send({ type: 'research-tool-result', rpcId: request.rpcId, data: null,
                                error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'HARNESS_RESEARCH_TOOL_UNAVAILABLE' });
                    }
                    finally {
                        this.researchToolRequests.delete(request.rpcId);
                    }
                })();
            }
            else if (message.type === 'capability-request') {
                const request = parseHarnessCapabilityInvocationV1(message.request), controller = new AbortController();
                const capabilityTask = (async () => {
                    try {
                        if (this.stopping || this.failureReported || request.caller.hostGeneration !== this.hostGeneration || !this.onCapabilityRequest || this.capabilityRequests.has(request.rpcId) || this.capabilityRequests.size >= 128)
                            throw Error('CAPABILITY_SCOPE_REVOKED');
                        this.capabilityRequests.set(request.rpcId, { request, controller });
                        const data = await this.onCapabilityRequest(request, controller.signal);
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'capability-result', rpcId: request.rpcId, data });
                    }
                    catch (error) {
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'capability-result', rpcId: request.rpcId, data: null, error: error instanceof Error && /^[A-Z0-9_:.-]{1,256}$/.test(error.message) ? error.message : 'CAPABILITY_OPERATION_FAILED' });
                    }
                    finally {
                        this.capabilityRequests.delete(request.rpcId);
                    }
                })();
                this.capabilityTasks.add(capabilityTask);
                void capabilityTask.finally(() => this.capabilityTasks.delete(capabilityTask));
            }
            else if (message.type === 'capability-cancel') {
                const row = this.capabilityRequests.get(message.rpcId);
                if (row && JSON.stringify(row.request.caller) === JSON.stringify(message.caller))
                    row.controller.abort();
            }
            else if (message.type === 'video-tool-request') {
                const request = parseVideoToolInvocation(message.request), controller = new AbortController();
                void (async () => {
                    try {
                        if (this.stopping || this.failureReported || request.hostGeneration !== this.hostGeneration || !this.onVideoToolRequest || this.videoToolRequests.has(request.rpcId) || this.videoToolRequests.size >= 128)
                            throw Error('VIDEO_SCOPE_REVOKED');
                        this.videoToolRequests.set(request.rpcId, { request, controller });
                        const data = await this.onVideoToolRequest(request, controller.signal);
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'video-tool-result', rpcId: request.rpcId, data });
                    }
                    catch (error) {
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'video-tool-result', rpcId: request.rpcId, data: null, error: error instanceof Error && /^VIDEO_[A-Z_]+$/.test(error.message) ? error.message : 'VIDEO_TOOL_FAILED' });
                    }
                    finally {
                        this.videoToolRequests.delete(request.rpcId);
                    }
                })();
            }
            else if (message.type === 'video-tool-cancel') {
                const row = this.videoToolRequests.get(message.rpcId);
                if (row && row.request.hostGeneration === message.hostGeneration && JSON.stringify(row.request.scope) === JSON.stringify(message.scope))
                    row.controller.abort();
            }
            else if (message.type === 'research-tool-cancel') {
                const row = this.researchToolRequests.get(message.rpcId);
                if (row && JSON.stringify(row.context) === JSON.stringify(message.context))
                    row.controller.abort();
            }
            else if (message.type === 'media-request') {
                const request = parseHarnessMediaInvocationV1(message.request), controller = new AbortController();
                void (async () => {
                    try {
                        if (this.stopping || this.failureReported || request.context.hostGeneration !== this.hostGeneration ||
                            !this.onMediaRequest || this.mediaRequests.has(request.rpcId))
                            throw Error('HARNESS_MEDIA_SCOPE_REVOKED');
                        this.mediaRequests.set(request.rpcId, { context: request.context, controller });
                        const data = await this.onMediaRequest(request, controller.signal);
                        if (!this.stopping && child.connected && !controller.signal.aborted)
                            child.send({ type: 'media-result', rpcId: request.rpcId, data });
                    }
                    catch (error) {
                        const code = error instanceof Error && /^(?:HARNESS_MEDIA|AIGC)_[A-Z_]{1,64}$/.test(error.message) ? error.message : 'HARNESS_MEDIA_UNAVAILABLE';
                        if (!this.stopping && child.connected)
                            child.send({ type: 'media-result', rpcId: request.rpcId, data: null, error: code });
                    }
                    finally {
                        this.mediaRequests.delete(request.rpcId);
                    }
                })();
            }
            else if (message.type === 'media-cancel') {
                const pending = this.mediaRequests.get(message.rpcId);
                if (pending && JSON.stringify(pending.context) === JSON.stringify(message.context))
                    pending.controller.abort();
            }
            else if (message.type === 'platform-admit') {
                void (async () => {
                    const request = parsePlatformRequest(message.request);
                    try {
                        if (this.stopping || this.failureReported || request.hostGeneration !== this.hostGeneration || this.onPlatformRequest === undefined)
                            throw new Error('BUILTIN_HOST_UNAVAILABLE');
                        const data = parsePlatformPrepared(await this.onPlatformRequest(request));
                        if (!this.stopping && child.connected)
                            child.send({ type: 'platform-admit-result', clientRequestId: request.clientRequestId, data });
                    }
                    catch (error) {
                        const allowed = new Set(['NATIVE_TOOLS_UNAVAILABLE', 'NATIVE_TOOL_FUNDING_REQUIRED', 'NATIVE_TOOL_RATE_LIMITED', 'NATIVE_TOOL_NOT_ALLOWED', 'NATIVE_TOOL_BINDING_CONFLICT', 'NATIVE_TOOL_AUTHORITY_CHANGED', 'NATIVE_TOOL_MATERIAL_EXPIRED', 'NATIVE_TOOL_MATERIAL_CANCELLED', 'NATIVE_TOOL_MEMBERSHIP_RECONNECT_REQUIRED', 'NATIVE_TOOL_BODY_INVALID']);
                        const code = error instanceof BusinessFailure && allowed.has(error.code) ? error.code : 'BUILTIN_PLATFORM_UNAVAILABLE';
                        console.warn('STUDYBUDDY_PLATFORM_ADMIT_FAILED', code, error instanceof BusinessFailure && Number.isInteger(error.status) ? error.status : 0);
                        if (child.connected)
                            child.send({ type: 'platform-admit-result', clientRequestId: request.clientRequestId, data: null, error: code });
                    }
                })();
            }
            else if (message.type === 'platform-session')
                this.onPlatformSession?.(message.session);
            else if (message.type === 'shutdown-complete') {
                if (this.stopping)
                    this.shutdownCompleted = true;
                else
                    this.fail(new Error('dsh desktop host acknowledged an unrequested shutdown'));
            }
            else if (message.type === 'fatal')
                this.fail(new DesktopHostFatalError(message.message, message.diagnostic));
            else {
                const request = this.controlRequests.get(message.requestId);
                if (message.error === undefined)
                    request?.resolve(message);
                else
                    request?.reject(new Error(message.error));
            }
        });
        child.once('error', (error) => { this.fail(error); });
        this.exitPromise = new Promise((resolve) => {
            child.once('close', (code) => {
                const suffix = this.stderr.trim() === '' ? '' : `: ${this.stderr.trim()}`;
                if (code !== 0 && code !== null)
                    this.fail(new Error(`dsh desktop host exited with ${String(code)}${suffix}`));
                else
                    this.fail(new Error(`dsh desktop host stopped${suffix}`));
                resolve();
            });
        });
        return this.readyPromise;
    }
    /**
     * Inspect active work or lock request admission for update handoff.
     * @param action - Read-only inspection, admission lock, or recovery unlock.
     * @returns Whether live tasks would be affected. Locking drains admitted API requests before inspecting tasks;
     * an unanswered drain fails at the control-request deadline without authorizing installation.
     */
    async updateTasks(action) {
        const response = await this.control({ type: 'update-tasks', action }, 10_000, 'desktop update: task inspection timed out');
        if (response.type !== 'update-tasks')
            throw new Error('desktop update: Host answered with a different control response');
        return response.active;
    }
    /**
     * Ask the Host what quitting now would interrupt.
     * @returns Active tasks and armed scheduled reminders; rejects when the Host is unavailable or misses
     * {@link QUIT_INSPECTION_DEADLINE_MS}, and the shell then asks before quitting.
     */
    async inspectQuit() {
        const response = await this.control({ type: 'quit-inspection' }, QUIT_INSPECTION_DEADLINE_MS, 'desktop quit: inspection timed out');
        if (response.type !== 'quit-inspection')
            throw new Error('desktop quit: Host answered with a different control response');
        return { activeTasks: response.activeTasks, scheduledTasks: response.scheduledTasks };
    }
    /** Main-owned Host context; absent private protocol support fails closed.
     * @param scope - Authenticated account generation captured by Main.
     * @returns The current process incarnation. */
    builtinContext(scope) {
        if (this.hostGeneration === undefined || this.stopping || this.failureReported)
            throw new Error('BUILTIN_HOST_UNAVAILABLE');
        return parseNativeBuiltinHostContextV1({ scope, hostGeneration: this.hostGeneration });
    }
    /** Atomically install native material through private Node IPC.
     * @param snapshot - Exact source snapshot, never exposed to a renderer.
     * @returns Current secret-free readback. */
    async builtinApply(snapshot) {
        return parseNativeBuiltinCatalogAppliedV1(await this.builtinControl('apply', snapshot));
    }
    /** Read only one source's installed proof.
     * @param scope - Authenticated account generation.
     * @param operationId - Original native source journal identity.
     * @returns The exact installed source acknowledgement. */
    async builtinReadback(scope, operationId) {
        return parseNativeBuiltinCatalogAppliedV1(await this.builtinControl('readback', { scope, operationId }));
    }
    /** Publish only native-confirmed ready models.
     * @param proof - Native readiness bound to current private readback. */
    async builtinPublish(proof) { await this.builtinControl('publish', proof); }
    /** Close account or source admission before further IPC can complete.
     * @param scope - Account generation to fence.
     * @param localRef - Optional single-source revocation. */
    async builtinRevoke(scope, localRef) {
        await this.builtinControl('revoke', {
            scope, ...localRef === undefined ? {} : { localRef },
        });
    }
    /** Dispatch one protected diagnostic or user-approved validation.
     * @param request - Exact pending source selection and native request identity.
     * @returns Measured timings and actual provider terminal facts. */
    async builtinValidate(request) {
        return parseNativeBuiltinValidationResultV1(await this.builtinControl('validate', request, 60_000));
    }
    /** Publish the keyless native platform catalog through Main-owned IPC only. */
    async platformApply(snapshot) { await this.builtinControl('platform-apply', snapshot); }
    /** Fence one platform account alongside personal source revocation. */
    async platformRevoke(scope) { await this.builtinControl('platform-revoke', { scope }); }
    /** Bind media tools to the original product account; private control only. */
    async mediaApply(scope) { await this.builtinControl('media-scope', scope === null ? null : this.builtinContext(scope)); }
    async capabilityApply(scope, modules) { await this.capabilityCommand('scope', { owner: scope === null ? null : this.builtinContext(scope), modules }); }
    async capabilityCommand(action, data, signal) {
        const response = await this.control({ type: 'capability-control', action, data }, 30000, 'CAPABILITY_HOST_TIMEOUT', signal);
        if (response.type !== 'capability-control')
            throw Error('CAPABILITY_RESPONSE_INVALID');
        return response.data;
    }
    /** Invoke only the registered native research owner over the private child channel.
     * @param action - Closed Main-owned lifecycle or native action.
     * @param data - Validated private project/admission request.
     * @returns Correlated native result. */
    async researchCommand(action, data) {
        const response = await this.control({ type: 'research-control', action, data }, 30_000, 'HARNESS_RESEARCH_HOST_TIMEOUT');
        if (response.type !== 'research-control')
            throw Error('HARNESS_RESEARCH_RESPONSE_INVALID');
        return response.data;
    }
    /** Private admission and native video-tool lifecycle; never renderer RPC. */
    async videoCommand(action, data, signal) {
        const response = await this.control({ type: 'video-control', action, data }, action === 'native' ? 0 : 30000, 'VIDEO_HOST_TIMEOUT', signal);
        if (response.type !== 'video-control')
            throw Error('VIDEO_RESPONSE_INVALID');
        return response.data;
    }
    /** A native foreground operation waits for its own cancellation or result; it is never replayed. */
    async aigcCommand(action, data, signal) {
        const response = await this.control({ type: 'aigc-control', action, data }, action === 'native' ? 0 : 30_000, 'AIGC_HOST_TIMEOUT', signal);
        if (response.type !== 'aigc-control')
            throw Error('AIGC_RESPONSE_INVALID');
        return response.data;
    }
    /** Call only the native Skill Safety owner. @param action - Private closed operation. @param data - Keyless owner data. */
    async skillSafetyCommand(action, data) {
        const response = await this.control({ type: 'skill-safety-control', action, data }, 30_000, 'SKILL_SAFETY_UNAVAILABLE');
        if (response.type !== 'skill-safety-control')
            throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
        return response.data;
    }
    async builtinControl(action, data, deadline = 10_000) {
        const response = await this.control({ type: 'builtin-control', action, data }, deadline, 'BUILTIN_HOST_TIMEOUT');
        if (response.type !== 'builtin-control')
            throw new Error('BUILTIN_HOST_RESPONSE_INVALID');
        return response.data;
    }
    async control(request, deadlineMs, deadlineMessage, signal) {
        const child = this.child;
        if (child === undefined || !child.connected || this.failureReported || this.stopping) {
            if (request.type === 'builtin-control')
                throw new Error('BUILTIN_HOST_UNAVAILABLE');
            if (request.type === 'research-control')
                throw Error('HARNESS_RESEARCH_HOST_UNAVAILABLE');
            if (request.type === 'capability-control')
                throw Error('CAPABILITY_HOST_UNAVAILABLE');
            if (request.type === 'video-control')
                throw Error('VIDEO_HOST_UNAVAILABLE');
            if (request.type === 'aigc-control')
                throw Error('AIGC_HOST_UNAVAILABLE');
            if (request.type === 'skill-safety-control')
                throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE');
            throw new Error(`${request.type === 'update-tasks' ? 'desktop update' : 'desktop quit'}: Host is unavailable`);
        }
        const requestId = this.nextControlId++;
        let timer;
        let detach;
        try {
            return await new Promise((resolve, reject) => {
                signal?.throwIfAborted();
                this.controlRequests.set(requestId, { resolve, reject });
                if (deadlineMs > 0)
                    timer = setTimeout(() => { reject(new Error(deadlineMessage)); }, deadlineMs);
                if (signal) {
                    const abort = () => { reject(Error('AIGC_OPERATION_CANCELLED')); };
                    signal.addEventListener('abort', abort, { once: true });
                    detach = () => { signal.removeEventListener('abort', abort); };
                }
                child.send({ ...request, requestId }, (error) => { if (error !== null)
                    reject(error); });
            });
        }
        finally {
            detach?.();
            clearTimeout(timer);
            this.controlRequests.delete(requestId);
        }
    }
    /**
     * Request teardown and await child exit, escalating termination when needed.
     * @param requireGraceful - Reject update handoff after forced termination or unsuccessful child exit.
     * @returns Completion of owned process teardown. DesktopHostUncleanExitError confirms exit but refuses installation;
     * other failures do not confirm exit.
     */
    async stop(requireGraceful = false) {
        for (const request of this.skillSafetyRequests.values())
            request.controller.abort();
        await Promise.all([...this.skillSafetyRequests.values()].map(request => request.settled));
        const child = this.child;
        if (child === undefined)
            return;
        this.stopping = true;
        this.hostGeneration = undefined;
        this.onPlatformSession?.(null);
        this.cancelMediaRequests();
        await Promise.allSettled([...this.capabilityTasks]);
        if (child.connected)
            child.send({ type: 'shutdown' }, (error) => { if (error !== null)
                this.fail(error); });
        const exited = this.exitPromise ?? Promise.resolve();
        const graceful = await exitsWithin(exited, 10_000);
        if (!graceful)
            child.kill('SIGTERM');
        if (!await exitsWithin(exited, 5_000)) {
            child.kill('SIGKILL');
            if (!await exitsWithin(exited, 5_000)) {
                throw new Error('dsh desktop host did not exit after SIGKILL');
            }
        }
        this.child = undefined;
        if (requireGraceful && (!graceful || child.exitCode !== 0 || !this.shutdownCompleted)) {
            // This diagnostic reaches expandable UI; arbitrary plugin stderr can contain credentials.
            throw new DesktopHostUncleanExitError(`desktop update: Host did not complete graceful task teardown (exit ${String(child.exitCode)}, signal ${String(child.signalCode)}, shutdown acknowledged ${String(this.shutdownCompleted)}, graceful deadline exceeded ${String(!graceful)})`);
        }
    }
    fail(error) {
        this.hostGeneration = undefined;
        this.onPlatformSession?.(null);
        this.cancelMediaRequests();
        this.readyReject(error);
        for (const request of this.controlRequests.values())
            request.reject(error);
        this.controlRequests.clear();
        if (!this.failureReported && !this.stopping) {
            this.failureReported = true;
            try {
                this.onFailure?.(error);
            }
            catch (listenerError) {
                console.error('desktop host failure listener failed', listenerError);
            }
        }
    }
    cancelMediaRequests() {
        for (const row of this.capabilityRequests.values())
            row.controller.abort();
        this.capabilityRequests.clear();
        for (const controller of this.searchRequests.values())
            controller.abort();
        this.searchRequests.clear();
        for (const request of this.mediaRequests.values())
            request.controller.abort();
        this.mediaRequests.clear();
        for (const request of this.researchToolRequests.values())
            request.controller.abort();
        this.researchToolRequests.clear();
        for (const request of this.aigcToolRequests.values())
            request.controller.abort();
        this.aigcToolRequests.clear();
        for (const request of this.videoToolRequests.values())
            request.controller.abort();
        this.videoToolRequests.clear();
    }
}
//# sourceMappingURL=host-process.js.map