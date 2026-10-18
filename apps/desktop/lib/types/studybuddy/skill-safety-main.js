import { PLATFORM_PROVIDER } from '@deepseek-ai/dsh-llm-studybuddy-builtin';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
import { parseSkillSafetyActor, parseSkillSafetyInvocation, parseSkillSafetyResult, parseSkillSafetyPrepared } from '@deepseek-ai/dsh-skill-safety-assistant/wire';
import { SkillSafetySources } from "./skill-safety-sources.js";
import { SkillsNativeClient } from "./skill-native-client.js";
import { SkillSafetyRecords } from "./skill-safety-records.js";
import { SkillSafetyTextConsumer } from "./skill-safety-text-consumer.js";
import { SkillSafetyScanner } from "./skill-safety-scanner.js";
import { SkillSafetyInstaller } from "./skill-safety-install.js";
import { SkillSafetyController } from "./skill-safety-controller.js";
import { runSkillScannerWorker } from "./skill-safety-transport.js";
import { requestSkillSafetyPublic } from "./skill-safety-public-request.js";
import { createSkillScannerDownload } from "./skill-safety-download.js";
import { parseSkillScannerRelease } from "./skill-safety-release.js";
import { brandString } from '@deepseek-ai/dsh-brand';
/** Match a live native selection to exactly one current admitted gateway choice.
 * @param selection - Read from the real live Host, not model/tool arguments.
 * @param choices - Fresh existing private native catalog.
 * @returns Exact matching authority, never a default or a funding fallback. */
export function resolveSkillSafetyChoice(selection, choices) {
    const matches = choices.filter(choice => choice.selection.exactModelId === selection.model && ('kind' in choice ? selection.provider === PLATFORM_PROVIDER : choice.selection.routeId === selection.provider));
    return matches.length === 1 ? matches[0] : undefined;
}
const liveSelection = z.object({ provider: z.string().min(1).max(256), model: z.string().min(1).max(256), reasoningEffort: z.string().min(1).max(256).optional() }).strict();
const sessionRef = z.object({ workspaceId: z.string().min(1).max(256).transform(value => brandString(value)), sessionId: z.string().min(1).max(256).transform(value => brandString(value)) }).strict();
const identity = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Own one lazy resource/controller composition and only feature-admitted native Sessions.
 * Native reads serialize credential-bound pipe replacement; a failed operation is not replayed. */
export class SkillSafetyMain {
    options;
    owned = new AbortController();
    admitted = new Map();
    pending = new Set();
    native;
    nativeTail = Promise.resolve();
    loading;
    resources;
    resourceLoading;
    manualCalls = new Map();
    revoking;
    disposed = false;
    constructor(options) {
        this.options = options;
    }
    isCurrent = (actor) => {
        const scope = this.options.auth.scope(), admission = this.admitted.get(actor.sessionId), host = this.options.host();
        return !!scope && !!host && !!admission && !this.disposed && !this.owned.signal.aborted && resolve(this.options.harnessHome()).toLowerCase() === resolve(join(this.options.userDataDirectory, 'harness', actor.accountId)).toLowerCase() && scope.accountId === actor.accountId && scope.generation === actor.generation && identity(admission.actor) === identity(actor) && admission.hostGeneration === host.builtinContext(scope).hostGeneration;
    };
    nativeCall(actor, run) {
        const result = this.nativeTail.then(() => this.options.auth.withSession(async (session) => {
            if (!this.isCurrent(actor) || session.scope.accountId !== actor.accountId || session.scope.generation !== actor.generation)
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
            const credentialDigest = identity(session.accessToken);
            if (this.native && (identity(this.native.scope) !== identity(session.scope) || this.native.credentialDigest !== credentialDigest)) {
                const prior = this.native;
                this.native = undefined;
                await prior.value.dispose();
            }
            if (!this.isCurrent(actor))
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
            if (!this.native)
                this.native = { scope: { ...session.scope }, credentialDigest, value: new SkillsNativeClient(this.options.nativeRuntime, session, this.options.harnessHome(), this.options.version) };
            const current = this.native;
            try {
                const result = await run(current.value);
                if (!this.isCurrent(actor))
                    throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
                return result;
            }
            catch (error) {
                if (this.native === current)
                    this.native = undefined;
                await current.value.dispose();
                throw error;
            }
        }));
        this.nativeTail = result.then(() => { }, () => { });
        return result;
    }
    async choice(actor) {
        if (!this.isCurrent(actor))
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        const raw = await this.options.host().skillSafetyCommand('inspect-model', { sessionId: actor.sessionId });
        if (!this.isCurrent(actor) || raw === null)
            return undefined;
        const selected = liveSelection.parse(raw), scope = { accountId: actor.accountId, generation: actor.generation };
        const choices = selected.provider === PLATFORM_PROVIDER ? await this.options.platform.consumerCatalog(scope) : await this.options.consumer.consumerCatalog(scope);
        if (!this.isCurrent(actor))
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        return resolveSkillSafetyChoice(selected, choices);
    }
    async model(actor) {
        const selected = await this.choice(actor);
        if (!selected)
            throw new SkillSafetyError('SKILL_SAFETY_MODEL_CHANGED');
        return { identity: identity(selected), label: selected.selection.exactModelId, funding: 'kind' in selected ? 'StudyBuddy 平台余额' : selected.sourceLabel + '的自备 Key' };
    }
    resourceOwner() {
        return this.resourceLoading ??= (async () => {
            const release = parseSkillScannerRelease(JSON.parse(await readFile(this.options.releaseFile, 'utf8')));
            const resources = this.resources ??= createSkillScannerDownload({ release, cacheDirectory: join(this.options.userDataDirectory, 'skill-safety', 'resources', 'win32-x64'), runtimeDirectory: this.options.runtimeDirectory });
            return { release, resources };
        })().catch(error => { this.resourceLoading = undefined; throw error; });
    }
    /** Labs-only fixed resource operations; owner is checked by the native frame bridge. */
    async manual(owner, method, args) {
        const epoch = this.owned, scope = owner.scope;
        const current = () => {
            if (epoch.signal.aborted)
                throw new SkillSafetyError('SKILL_SAFETY_CANCELLED');
            if (this.disposed || epoch !== this.owned || identity(scope) !== identity(this.options.auth.scope()) || resolve(this.options.harnessHome()).toLowerCase() !== resolve(join(this.options.userDataDirectory, 'harness', scope.accountId)).toLowerCase())
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        };
        current();
        if (method === 'getSkillSafetyScannerStatus') {
            if (args.length)
                throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
            const { resources } = await this.resourceOwner();
            current();
            const result = await resources.status(epoch.signal);
            current();
            return result;
        }
        const input = args[0];
        if (args.length !== 1 || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('requestId' in input) || typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 256)
            throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
        if (method === 'startSkillSafetyAssistant') {
            const result = await this.begin(input.requestId);
            current();
            return result;
        }
        const key = owner.lease + '\0' + input.requestId;
        if (method === 'cancelSkillSafetyScannerPreparation') {
            const call = this.manualCalls.get(key);
            if (call && identity(call.owner.scope) === identity(scope)) {
                call.abort.abort();
                await call.settled;
            }
            current();
            return undefined;
        }
        if (method !== 'prepareSkillSafetyScanner')
            throw new SkillSafetyError('SKILL_SAFETY_COMMAND_INVALID');
        const prior = this.manualCalls.get(key);
        if (prior) {
            if (identity(prior.owner.scope) !== identity(scope))
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
            return prior.result;
        }
        if (this.manualCalls.size >= 16)
            throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_LIMIT');
        const abort = new AbortController(), signal = AbortSignal.any([abort.signal, epoch.signal]);
        const result = (async () => {
            const { resources } = await this.resourceOwner();
            current();
            if (signal.aborted)
                throw new SkillSafetyError('SKILL_SAFETY_CANCELLED');
            await resources.prepare(signal);
            if (signal.aborted)
                throw new SkillSafetyError('SKILL_SAFETY_CANCELLED');
            current();
            const result = await resources.status(signal);
            current();
            return result;
        })();
        const settled = result.then(() => { }, () => { }).finally(() => { this.manualCalls.delete(key); this.pending.delete(settled); });
        this.manualCalls.set(key, { owner: structuredClone(owner), abort, result, settled });
        this.pending.add(settled);
        return result;
    }
    /** Release only waiters initiated by this exact native page lease. */
    releaseManual(owner) {
        for (const call of this.manualCalls.values())
            if (call.owner.lease === owner.lease && identity(call.owner.scope) === identity(owner.scope))
                call.abort.abort();
    }
    load() {
        return this.loading ??= (async () => {
            const { release, resources } = await this.resourceOwner();
            const root = join(this.options.userDataDirectory, 'skill-safety');
            const records = new SkillSafetyRecords(join(root, 'private-records'), this.isCurrent);
            const sources = new SkillSafetySources({ root: join(root, 'private-sources'), isCurrentScope: this.isCurrent,
                native: { inventory: (actor, signal) => this.nativeCall(actor, native => native.safetyInventory(signal)), snapshot: (actor, input, signal) => this.nativeCall(actor, native => native.safetySnapshot(input, signal)), verify: (actor, input, signal) => this.nativeCall(actor, native => native.safetyVerify(input, signal)) },
                request: (url, signal) => requestSkillSafetyPublic(url, signal, 10 * 1024 * 1024),
                limits: { maxCandidates: 20, maxDownloadBytes: 10 * 1024 * 1024, maxStagedBytes: 25 * 1024 * 1024, maxFiles: 1000, maxRedirects: 3, acquisitionTimeoutMs: 60_000 } });
            const text = new SkillSafetyTextConsumer({ consumer: this.options.consumer, platform: this.options.platform, selection: actor => this.choice(actor), isCurrent: this.isCurrent, records, fetch: this.options.fetch, audit: (actor, value) => records.audit(actor, value) });
            const scanner = new SkillSafetyScanner({ readArtifact: (actor, id) => sources.readSkillArtifact(actor, id), isCurrent: this.isCurrent, modelIdentity: async (actor) => (await this.model(actor)).identity,
                judge: (actor, id, request, signal) => text.call(actor, id, request, signal), worker: runSkillScannerWorker,
                verifyResources: async (signal) => {
                    const verified = await resources.prepare(signal);
                    return { identity: 'cisco@2.2.2:' + release.manifestSha256, configDigest: verified.manifest.configDigest,
                        executable: join(this.options.runtimeDirectory, 'dependencies', 'python', 'python.exe'), args: ['-I', '-S', '-B', join(verified.directory, 'worker.py')], cwd: verified.directory };
                } });
            const installer = new SkillSafetyInstaller({ userRoot: join(this.options.harnessHome(), 'skills'), privateRoot: join(root, 'private-install'), isCurrent: this.isCurrent,
                readReport: (actor, id) => records.readReport(actor, id), readArtifact: (actor, id) => sources.readSkillArtifact(actor, id),
                registryReadback: async (actor, name, directory, digest) => this.isCurrent(actor) && await this.options.host().skillSafetyCommand('registry-readback', { sessionId: actor.sessionId, name, directory, digest }) === true && this.isCurrent(actor) });
            return new SkillSafetyController({ sources, scanner, installer, resources, release, isCurrent: this.isCurrent, model: actor => this.model(actor), journalRoot: join(root, 'operations'), readReport: (actor, id) => records.readReport(actor, id), saveReport: (actor, report) => records.saveReport(actor, report) });
        })().catch(error => { this.loading = undefined; throw error; });
    }
    /** Open one feature-managed native Session without downloading or calling a model. */
    async begin(requestId) {
        await this.revoking;
        const scope = this.options.auth.scope(), host = this.options.host(), epoch = this.owned;
        if (this.disposed || !scope || !host || !requestId.trim() || requestId.length > 256)
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        const check = () => { if (epoch !== this.owned || identity(scope) !== identity(this.options.auth.scope()) || host !== this.options.host())
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'); };
        const context = host.builtinContext(scope);
        await host.skillSafetyCommand('scope', context);
        check();
        const ref = sessionRef.parse(await host.skillSafetyCommand('begin-session', { requestId }));
        check();
        const actor = parseSkillSafetyActor(await host.skillSafetyCommand('bind', { sessionId: ref.sessionId }));
        check();
        if (actor.accountId !== scope.accountId || actor.generation !== scope.generation || actor.sessionId !== ref.sessionId)
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        this.admitted.set(ref.sessionId, { actor, hostGeneration: context.hostGeneration });
        return ref;
    }
    /** Handle only strict private Host calls and await native cancellation before replying. */
    async handle(input, signal) {
        const request = parseSkillSafetyInvocation(input), { actor } = request.context, operation = request.operation;
        const active = this.admitted.get(actor.sessionId);
        if (!active || active.hostGeneration !== request.context.hostGeneration || identity(active.actor) !== identity(actor))
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        const lifetime = AbortSignal.any([signal, this.owned.signal]);
        const run = (async () => {
            const controller = await this.load();
            if (operation.kind === 'release') {
                controller.release(actor, parseSkillSafetyPrepared(operation.prepared));
                return null;
            }
            if (!this.isCurrent(actor))
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
            return operation.kind === 'preflight' ? await controller.preflight(actor, operation.command, lifetime) : parseSkillSafetyResult(await controller.execute(actor, parseSkillSafetyPrepared(operation.prepared), operation.answer === undefined ? undefined : { answers: operation.answer.answers.map(value => ({ id: value.id, selected: value.selected, ...(value.custom === undefined ? {} : { custom: value.custom }) })) }, lifetime));
        })();
        const settled = run.then(() => { }, () => { });
        this.pending.add(settled);
        try {
            return await run;
        }
        finally {
            this.pending.delete(settled);
        }
    }
    /** Revoke account actions immediately, then await all owned private/native work. */
    revoke() {
        if (this.revoking)
            return this.revoking;
        this.owned.abort();
        this.admitted.clear();
        const current = this.native;
        this.native = undefined;
        const value = Promise.allSettled([...this.pending, this.nativeTail, current?.value.dispose(), this.options.host()?.skillSafetyCommand('scope', null)]).then(results => {
            this.loading = undefined;
            this.owned = new AbortController();
            const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
            if (failures.length)
                throw new SkillSafetyError('SKILL_SAFETY_UNAVAILABLE', { cause: new AggregateError(failures) });
        }).finally(() => { if (this.revoking === value)
            this.revoking = undefined; });
        this.revoking = value;
        return value;
    }
    /** Close the feature's optional downloader and native pipes, preserving cache and user data. */
    async dispose() { this.disposed = true; this.owned.abort(); await Promise.all([this.revoke(), this.resources?.dispose()]); }
}
//# sourceMappingURL=skill-safety-main.js.map