/** Reuse current native media execution and receipts; this adapter owns no provider key or price. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, rm, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { HARNESS_VIDEO_TTS_MODELS } from '@studybuddy/contracts';
import { mediaRequestUUID } from "./media-key-journal.js";
import { readVideoSpeech } from "./video-speech-input.js";
import { VideoAssetJournal, VideoTtsDetailsSchema } from "./video-asset-journal.js";
import { assertVideoPath } from "./video-path.js";
const record = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('VIDEO_NATIVE_RESPONSE_INVALID');
    return value;
};
const identity = (scope) => JSON.stringify([scope.accountGeneration, scope.workspaceId, scope.projectId, scope.sessionId]);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const prefix = (operation) => operation === 'image' ? '/images' : operation === 'tts' ? '/speech' : operation === 'sfx' ? '/audio' : operation === 'asr' ? '/asr' : '';
const mediaTypes = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/flac': '.flac', 'audio/ogg': '.ogg' };
const videoTtsModels = new Set(HARNESS_VIDEO_TTS_MODELS);
function generationBody(operation, choice, native, requestId) {
    const { modelId: _model, handle: _handle, requestId: _request, ...parameters } = native;
    return { ...parameters, requestId, handle: choice.providerId, ...(operation === 'video' ? {} : { modelId: choice.modelId }) };
}
async function admittedAsset(root, out) {
    const plain = out.replaceAll('\\', '/');
    if (!plain.startsWith('assets/') || isAbsolute(plain) || plain.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':') || part.includes('\0')))
        throw Error('VIDEO_ASSET_PATH_DENIED');
    const target = join(root, plain);
    let ancestor = dirname(target);
    for (;;) {
        try {
            await stat(ancestor);
            break;
        }
        catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
                throw error;
        }
        const parent = dirname(ancestor);
        if (parent === ancestor)
            throw Error('VIDEO_ASSET_PATH_DENIED');
        ancestor = parent;
    }
    const rel = relative(root, await realpath(ancestor));
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep))
        throw Error('VIDEO_ASSET_PATH_DENIED');
    return target;
}
/** Model choices are short-lived projections of the native catalog, scoped to a project Session. */
export class VideoMediaAdapter {
    options;
    choices = new Map();
    requests = new Map();
    constructor(options) {
        this.options = options;
        if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 1 || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)
            throw Error('VIDEO_MEDIA_CONFIG_INVALID');
    }
    check(scope, signal) {
        signal.throwIfAborted();
        if (!this.options.isCurrent(scope))
            throw Error('VIDEO_SCOPE_REVOKED');
    }
    /** Read the existing native media catalogs and issue scoped selection references. */
    async catalog(scope, signal, caller) {
        this.check(scope, signal);
        const binding = await this.options.binding(scope, caller);
        const catalogs = await Promise.all(['image', 'video', 'tts', 'sfx', 'asr'].map(async (operation) => {
            try {
                return { operation, document: record(await this.options.api.request(binding.scope, prefix(operation) + '/catalog', undefined, signal)) };
            }
            catch (error) {
                const code = error instanceof Error && ['AIGC_RESPONSE_INVALID', 'AIGC_MEDIA_UNAVAILABLE', 'AIGC_REQUEST_INVALID', 'AIGC_SCOPE_REVOKED', 'AIGC_ENDPOINT_DENIED', 'BUILTIN_SCOPE_REVOKED', 'MODEL_KEY_RESPONSE_INVALID', 'MODEL_KEY_UNAVAILABLE'].includes(error.message) ? error.message : 'VIDEO_NATIVE_CATALOG_UNAVAILABLE';
                console.warn('StudyBuddy video catalog unavailable', { operation, code });
                throw error;
            }
        }));
        this.check(scope, signal);
        const result = [];
        for (const { operation, document } of catalogs) {
            if (document.schemaVersion !== 1 || !Array.isArray(document.models))
                throw Error('VIDEO_NATIVE_CATALOG_INVALID');
            for (const value of document.models) {
                const row = record(value);
                if (typeof row.modelId !== 'string' || !row.modelId || typeof row.providerId !== 'string' || !row.providerId)
                    throw Error('VIDEO_NATIVE_CATALOG_INVALID');
                if (operation === 'tts' && !videoTtsModels.has(row.modelId))
                    continue;
                const authorityRef = randomUUID();
                const parameters = Object.fromEntries(['sizes', 'modes', 'durations', 'resolutions', 'ratios', 'generateAudio', 'voices', 'formats', 'sampleRates', 'languages', 'maxCharacters', 'maxInputCodePoints', 'defaultFormat', 'defaultSampleRates', 'maxOriginalDurationSeconds', 'responseFormats', 'timestampLevels', 'subtitleTypes', 'maxFileBytes', 'maxDurationSeconds', 'priceGuard'].filter(key => row[key] !== undefined).map(key => [key, row[key]]));
                // A valid native model may lack a capability this editor requires. It receives no video authority;
                // unrelated native capabilities remain usable, without choosing another model or issuing a request.
                if (operation === 'tts' && (!Array.isArray(row.subtitleTypes) || !row.subtitleTypes.includes('word') || !Array.isArray(row.formats) || !row.formats.some(format => format !== 'pcm')))
                    continue;
                if (operation === 'asr' && (!Array.isArray(row.formats) || !row.formats.includes('wav') || !Array.isArray(row.responseFormats) || !row.responseFormats.includes('verbose_json') || !Array.isArray(row.timestampLevels) || !row.timestampLevels.includes('word') || typeof row.maxFileBytes !== 'number' || !Number.isSafeInteger(row.maxFileBytes) || row.maxFileBytes <= 0 || row.maxFileBytes > 50_000_000 || typeof row.maxDurationSeconds !== 'number' || !Number.isSafeInteger(row.maxDurationSeconds) || row.maxDurationSeconds <= 0 || row.maxDurationSeconds > 500))
                    continue;
                this.choices.set(authorityRef, { scope: { ...scope }, ...(binding.callerSessionId ? { callerSessionId: binding.callerSessionId } : {}), operation, modelId: row.modelId, providerId: row.providerId, voices: row.voices, parameters });
                if ((operation === 'sfx' || operation === 'tts') && Array.isArray(parameters.formats))
                    parameters.formats = parameters.formats.filter(format => format !== 'pcm');
                result.push({ authorityRef, operation, modelId: row.modelId, label: typeof row.label === 'string' ? row.label : row.modelId, parameters, ...(operation === 'tts' && Array.isArray(row.voices) ? { voices: row.voices } : {}) });
            }
        }
        return result;
    }
    /** Dispatch once through the existing native authority, preserving its result and request identity. */
    async request(request, signal) {
        const { scope, operation } = request;
        this.check(scope, signal);
        if (operation === 'catalog')
            return { data: await this.catalog(scope, signal, request.caller), artifacts: [] };
        if (!['image', 'video', 'tts', 'sfx', 'asr', 'voice'].includes(operation))
            throw Error('VIDEO_CAPABILITY_UNAVAILABLE');
        const choice = request.authorityRef ? this.choices.get(request.authorityRef) : undefined;
        if (!choice || identity(choice.scope) !== identity(scope) || choice.operation !== (operation === 'voice' ? 'tts' : operation))
            throw Error('VIDEO_AUTHORITY_REQUIRED');
        if (choice.callerSessionId !== request.caller?.sessionId)
            throw Error('VIDEO_AUTHORITY_REQUIRED');
        if (operation === 'voice')
            return { data: choice.voices ?? [], artifacts: [] };
        if (!mediaRequestUUID(request.requestId))
            throw Error('VIDEO_REQUEST_ID_INVALID');
        const input = record(request.input), native = { ...record(input.native) };
        if ((operation === 'sfx' || operation === 'tts') && native.format === 'pcm' || operation === 'tts' && native.wordTimestamps !== undefined && native.wordTimestamps !== true)
            throw Error('VIDEO_MEDIA_INPUT_INVALID');
        if (operation === 'tts')
            native.wordTimestamps = true;
        if (Object.keys(input).some(key => !['native', 'out'].includes(key)) || input.out !== undefined && typeof input.out !== 'string')
            throw Error('VIDEO_MEDIA_INPUT_INVALID');
        if (native.modelId !== undefined && native.modelId !== choice.modelId || native.handle !== undefined && native.handle !== choice.providerId || native.requestId !== undefined && native.requestId !== request.requestId)
            throw Error('VIDEO_AUTHORITY_MISMATCH');
        // The native transport still validates on dispatch. Preflight must precede
        // both journals so a local input error cannot reserve a paid request identity.
        if (operation === 'image' || operation === 'video') {
            try {
                this.options.api.validateGeneration?.(operation, generationBody(operation, choice, native, request.requestId));
            }
            catch (error) {
                if (error instanceof Error && error.message === 'AIGC_REQUEST_INVALID')
                    throw Error('VIDEO_MEDIA_INPUT_INVALID');
                throw error;
            }
        }
        const hash = digest({ operation, modelId: choice.modelId, providerId: choice.providerId, input });
        const key = identity(scope) + ':' + (request.caller?.sessionId ?? scope.sessionId) + ':' + request.requestId + ':' + digest(input.out ?? null), previous = this.requests.get(key);
        if (previous?.hash !== undefined && previous.hash !== hash)
            throw Error('VIDEO_REQUEST_CONFLICT');
        if (previous?.result)
            return previous.result;
        if (request.caller) {
            if (!this.options.authorize)
                throw Error('VIDEO_BUDGET_UNAVAILABLE');
            await this.options.authorize(request, choice.modelId, signal);
            this.check(scope, signal);
        }
        const result = operation === 'asr' ? this.transcribe(request, choice, input, native, signal) : this.generate(request, choice, input, native, signal);
        const entry = { hash, result };
        this.requests.set(key, entry);
        // Coalesce only active observations. A later call must reconcile the native request or verify its disk artifact.
        try {
            return await result;
        }
        finally {
            if (this.requests.get(key) === entry)
                delete entry.result;
        }
    }
    async transcribe(request, choice, input, native, signal) {
        if (input.out !== undefined)
            throw Error('VIDEO_SPEECH_INPUT_INVALID');
        const binding = await this.options.binding(request.scope, request.caller);
        this.check(request.scope, signal);
        const audio = await readVideoSpeech(binding.projectRoot, native, Number(choice.parameters.maxFileBytes), Number(choice.parameters.maxDurationSeconds), signal);
        this.check(request.scope, signal);
        const data = record(await this.options.api.request(binding.scope, '/asr/requests', { requestId: request.requestId, modelId: choice.modelId, handle: choice.providerId, audio, contextId: digest([identity(request.scope), binding.callerSessionId ?? request.scope.sessionId]) }, signal));
        this.check(request.scope, signal);
        if (data.requestId !== request.requestId || data.modelId !== choice.modelId || data.state !== 'completed' || typeof data.text !== 'string' || typeof data.duration !== 'number' || !Number.isFinite(data.duration) || data.duration <= 0 || data.duration > Number(choice.parameters.maxDurationSeconds) || !Array.isArray(data.segments))
            throw Error('VIDEO_SPEECH_RESPONSE_INVALID');
        return { data, artifacts: [], receiptRef: request.requestId };
    }
    async generate(request, choice, input, native, signal) {
        const { scope, requestId, operation } = request, binding = await this.options.binding(scope, request.caller);
        this.check(scope, signal);
        const root = await realpath(binding.projectRoot);
        const out = typeof input.out === 'string' ? input.out : 'assets/' + operation + '/' + requestId;
        const target = await admittedAsset(root, out);
        this.check(scope, signal);
        const targetFor = async (mime) => { const extension = mediaTypes[mime]; if (!extension)
            throw Error('VIDEO_MEDIA_CONTENT_INVALID'); const filename = (extname(target) ? target.slice(0, -extname(target).length) : target) + extension; await admittedAsset(root, relative(root, filename).split(sep).join('/')); return filename; };
        const cache = new VideoAssetJournal(root, { requestId, inputHash: digest({ operation, modelId: choice.modelId, providerId: choice.providerId, native }), contextHash: digest([binding.scope.accountId, scope.projectId, binding.callerSessionId ?? scope.sessionId]) }, path => admittedAsset(root, path), () => this.check(scope, signal));
        const recovered = await cache.recover(targetFor);
        if (recovered)
            return { data: { requestId, modelId: choice.modelId, state: 'completed', ...recovered.details }, artifacts: [recovered.artifact], receiptRef: requestId };
        for (const mime of Object.keys(mediaTypes).filter(mime => operation === 'image' ? mime.startsWith('image/') : operation === 'video' ? mime === 'video/mp4' : mime.startsWith('audio/'))) {
            const filename = await targetFor(mime), existing = await lstat(filename).catch((error) => { if (error.code === 'ENOENT')
                return null; throw error; });
            if (existing)
                throw Error('VIDEO_ASSET_EXISTS');
        }
        const created = await cache.claim();
        this.check(scope, signal);
        const path = prefix(operation) + '/requests';
        const body = generationBody(operation, choice, native, requestId);
        // A prepared project claim survives timeouts, cancellation and restart: observe its UUID, never dispatch it again.
        let task = record(await this.options.api.request(binding.scope, created ? path : path + '/' + requestId, created ? body : undefined, signal));
        const deadline = Date.now() + this.options.timeoutMs;
        for (;;) {
            this.check(scope, signal);
            if (task.requestId !== requestId || task.modelId !== choice.modelId || !['queued', 'in_progress', 'completed', 'failed', 'unknown'].includes(String(task.state)))
                throw Error('VIDEO_NATIVE_RESPONSE_INVALID');
            if (task.state === 'unknown' || task.state === 'failed')
                return { data: { requestId, modelId: choice.modelId, state: task.state }, artifacts: [], receiptRef: requestId };
            if (task.state === 'completed')
                break;
            if (Date.now() >= deadline)
                return { data: { requestId, modelId: choice.modelId, state: task.state }, artifacts: [], receiptRef: requestId };
            await new Promise((resolve, reject) => {
                const cancel = () => { clearTimeout(timer); reject(Error('VIDEO_SCOPE_REVOKED')); };
                const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, this.options.pollIntervalMs);
                signal.addEventListener('abort', cancel, { once: true });
            });
            task = record(await this.options.api.request(binding.scope, path + '/' + requestId, undefined, signal));
        }
        if (task.contentAvailable !== true)
            throw Error('VIDEO_MEDIA_CONTENT_UNAVAILABLE');
        let details;
        if (operation === 'tts') {
            const parsed = VideoTtsDetailsSchema.safeParse({ wordTimestampsStatus: task.wordTimestampsStatus, ...(task.timing ? { timing: task.timing } : {}) });
            details = parsed.success ? parsed.data : { wordTimestampsStatus: 'unavailable' };
        }
        const response = await this.options.api.content(binding.scope, path + '/' + requestId + '/content', signal);
        try {
            this.check(scope, signal);
        }
        catch (error) {
            await response.body?.cancel();
            throw error;
        }
        const mime = response.headers.get('content-type')?.split(';')[0] ?? '', extension = mediaTypes[mime];
        if (!response.ok || !response.body || !extension || operation === 'image' && !mime.startsWith('image/') || operation === 'video' && mime !== 'video/mp4' || (operation === 'tts' || operation === 'sfx') && !mime.startsWith('audio/')) {
            await response.body?.cancel();
            throw Error('VIDEO_MEDIA_CONTENT_INVALID');
        }
        const reader = response.body.getReader(), hash = createHash('sha256');
        const cancel = () => { void reader.cancel().catch(() => { }); };
        signal.addEventListener('abort', cancel, { once: true });
        let file, temporary;
        let size = 0;
        try {
            this.check(scope, signal);
            await admittedAsset(root, out);
            const filename = await targetFor(mime), parent = dirname(filename);
            await mkdir(parent, { recursive: true });
            const realParent = await realpath(parent), rel = relative(root, realParent);
            if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep))
                throw Error('VIDEO_ASSET_PATH_DENIED');
            temporary = join(realParent, '.video-' + randomUUID() + '.tmp');
            file = await open(temporary, 'wx');
            for (;;) {
                const next = await reader.read();
                if (next.done)
                    break;
                this.check(scope, signal);
                size += next.value.byteLength;
                if (size > 100 * 1024 * 1024)
                    throw Error('VIDEO_MEDIA_CONTENT_TOO_LARGE');
                hash.update(next.value);
                await file.write(next.value);
            }
            this.check(scope, signal);
            await file.sync();
            await file.close();
            const artifact = await cache.stage(temporary, { relativePath: relative(root, filename).split(sep).join('/'), sha256: hash.digest('hex'), mime }, size, targetFor, details);
            return { data: { requestId, modelId: choice.modelId, state: 'completed', ...details }, artifacts: [artifact], receiptRef: requestId };
        }
        catch (error) {
            await reader.cancel().catch(() => { });
            await file?.close().catch(() => { });
            if (temporary && !cache.retains(temporary)) {
                await assertVideoPath(temporary);
                await rm(temporary, { force: true });
            }
            throw error;
        }
        finally {
            signal.removeEventListener('abort', cancel);
            reader.releaseLock();
        }
    }
    /** Revoke catalog projections and in-memory observations when the account owner closes. */
    clear() { this.choices.clear(); this.requests.clear(); }
}
//# sourceMappingURL=video-media.js.map