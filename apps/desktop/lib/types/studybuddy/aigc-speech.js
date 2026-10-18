/** Main-only speech handoff through the original Key-authenticated Task executor. */
import { createHash } from 'node:crypto';
import { HARNESS_ASR_MODELS, HARNESS_VIDEO_ASR_MODELS, HARNESS_TTS_MODELS } from '@studybuddy/contracts';
import { ModelKeyClient } from "./model-key-client.js";
import { mediaRequestUUID, mediaTaskState } from "./media-key-journal.js";
import { parseMiniMaxTtsTiming } from "./tts-timing.js";
import { downloadMiniMaxTtsSubtitles } from "./tts-subtitle-download.js";
export { parseMiniMaxTtsTiming } from "./tts-timing.js";
export { downloadMiniMaxTtsSubtitles } from "./tts-subtitle-download.js";
const object = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error('AIGC_RESPONSE_INVALID');
    return v;
};
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const slot = (id) => 'mediaKey' + createHash('sha256').update(id).digest('hex');
const mimes = { wav: 'audio/wav', mp3: 'audio/mpeg', pcm: 'audio/pcm', flac: 'audio/flac' };
const binaryLimit = 64 * 1024 * 1024;
async function json(response, limit = 256 * 1024) {
    const length = response.headers.get('content-length');
    if (!response.ok || !response.body || length && (!/^\d+$/.test(length) || Number(length) > limit)) {
        await response.body?.cancel();
        throw Error('AIGC_MEDIA_UNAVAILABLE');
    }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.length;
            if (size > limit) {
                await reader.cancel();
                throw Error('AIGC_RESPONSE_INVALID');
            }
            chunks.push(part.value);
        }
        return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
    }
    finally {
        reader.releaseLock();
    }
}
/** Provider times are display seconds; only the existing gateway meters the original duration. */
export function parseTimedSpeechResult(value, requestId, modelId, maxDurationSeconds) {
    const row = object(value), duration = Number(row.duration), count = row.n_speakers;
    if (row.model !== modelId || typeof row.trace_id !== 'string' || !row.trace_id || typeof row.text !== 'string' || row.text.length > 131072 || row.text.includes('\0') || !Number.isFinite(duration) || duration <= 0 || duration > maxDurationSeconds || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 256 || !Array.isArray(row.segments) || row.segments.length > 20000 || row.text.trim() && !row.segments.length)
        throw Error('VIDEO_SPEECH_RESPONSE_INVALID');
    const ids = new Set(), speakers = new Set();
    let previous = -1;
    const segments = row.segments.map(value => {
        const word = object(value);
        if (typeof word.id !== 'number' || !Number.isSafeInteger(word.id) || word.id < 0 || ids.has(word.id) || typeof word.start !== 'number' || typeof word.end !== 'number' || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.start < previous || word.end < word.start || word.end > duration || typeof word.text !== 'string' || !word.text || word.text.includes('\0') || typeof word.speaker !== 'string' || !/^S[1-9][0-9]{0,2}$/.test(word.speaker))
            throw Error('VIDEO_SPEECH_RESPONSE_INVALID');
        ids.add(word.id);
        speakers.add(word.speaker);
        previous = word.start;
        return { id: word.id, start: word.start, end: word.end, speaker: word.speaker, text: word.text };
    });
    if (speakers.size > count)
        throw Error('VIDEO_SPEECH_RESPONSE_INVALID');
    return { requestId, modelId, state: 'completed', text: row.text, duration, nSpeakers: count, segments };
}
export class AigcSpeechClient {
    options;
    contentRows = new Map();
    key(scope, id) { return JSON.stringify([scope.accountId, scope.generation, id]); }
    assert(scope, signal) { if (!this.options.isCurrent(scope))
        throw Error('AIGC_SCOPE_REVOKED'); signal?.throwIfAborted(); }
    constructor(options) {
        this.options = options;
    }
    clearTransient() { for (const row of this.contentRows.values())
        clearTimeout(row.timer); this.contentRows.clear(); }
    async client(scope) {
        this.assert(scope);
        const target = await this.options.target(scope);
        this.assert(scope);
        return new ModelKeyClient({ baseUrl: target.baseUrl, readKey: async () => target.apiKey, fetch: this.options.fetch });
    }
    async catalog(scope, signal) {
        const client = await this.client(scope);
        const doc = await json(await client.speechCatalog(AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)])));
        this.assert(scope, signal);
        if (doc.schemaVersion !== 1 || typeof doc.catalogRevision !== 'string' || !doc.catalogRevision ||
            typeof doc.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(doc.sourceSha256) || !Array.isArray(doc.models) || doc.models.length > 32)
            throw Error('AIGC_RESPONSE_INVALID');
        const models = doc.models.map(v => {
            const row = object(v), guard = object(row.priceGuard);
            if (row.provider !== 'minimax' || typeof row.modelId !== 'string' || typeof row.displayName !== 'string' ||
                !(row.operation === 'tts' && HARNESS_TTS_MODELS.includes(row.modelId) && row.unit === 'character' ||
                    row.operation === 'asr' && [...HARNESS_ASR_MODELS, ...HARNESS_VIDEO_ASR_MODELS].includes(row.modelId) && row.unit === 'second') ||
                Object.keys(guard).sort().join(',') !== 'expressionSha256,pluginSha256,version' ||
                typeof guard.version !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(guard.version) ||
                typeof guard.expressionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(guard.expressionSha256) ||
                typeof guard.pluginSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(guard.pluginSha256))
                throw Error('AIGC_RESPONSE_INVALID');
            const voices = [];
            if (row.operation === 'tts') {
                if (!Array.isArray(row.voices) || !row.voices.length || row.voices.length > 256)
                    throw Error('AIGC_RESPONSE_INVALID');
                for (const v of row.voices) {
                    const voice = object(v);
                    if (typeof voice.title !== 'string' || !voice.title || typeof voice.voice !== 'string' || !voice.voice || /[\p{Cc}]/u.test(voice.voice))
                        throw Error('AIGC_RESPONSE_INVALID');
                    voices.push({ title: voice.title, voice: voice.voice });
                }
                if (new Set(voices.map(v => v.voice)).size !== voices.length)
                    throw Error('AIGC_RESPONSE_INVALID');
                if (!Array.isArray(row.sampleRates) || !row.sampleRates.length || row.sampleRates.some(v => ![8000, 16000, 22050, 24000, 32000, 44100].includes(Number(v))) ||
                    !Array.isArray(row.languages) || !row.languages.length || row.languages.some(v => !['zh-CN', 'en'].includes(String(v))))
                    throw Error('AIGC_RESPONSE_INVALID');
            }
            if (!Array.isArray(row.formats) || !row.formats.length || row.formats.some(v => typeof v !== 'string' ||
                row.operation === 'tts' && !Object.hasOwn(mimes, v)))
                throw Error('AIGC_RESPONSE_INVALID');
            const responseFormats = [], timestampLevels = [], subtitleTypes = [];
            for (const [field, target, allowed] of [['responseFormats', responseFormats, ['json', 'verbose_json']], ['timestampLevels', timestampLevels, ['sentence', 'word']], ['subtitleTypes', subtitleTypes, ['sentence', 'word']]]) {
                if (row[field] !== undefined) {
                    if (!Array.isArray(row[field]) || row[field].some(value => typeof value !== 'string' || !allowed.includes(value)))
                        throw Error('AIGC_RESPONSE_INVALID');
                    target.push(...row[field]);
                }
            }
            if (row.operation === 'asr' && (typeof row.maxFileBytes !== 'number' || !Number.isSafeInteger(row.maxFileBytes) || row.maxFileBytes <= 0 || row.maxFileBytes > 50_000_000 || typeof row.maxDurationSeconds !== 'number' || !Number.isSafeInteger(row.maxDurationSeconds) || row.maxDurationSeconds <= 0 || row.maxDurationSeconds > 500))
                throw Error('AIGC_RESPONSE_INVALID');
            return { modelId: row.modelId, displayName: row.displayName, operation: row.operation, priceGuard: { version: guard.version, expressionSha256: guard.expressionSha256, pluginSha256: guard.pluginSha256 },
                voices, formats: row.formats, sampleRates: (row.sampleRates ?? []), languages: (row.languages ?? []), responseFormats, timestampLevels, subtitleTypes, maxFileBytes: row.operation === 'asr' ? Number(row.maxFileBytes) : 0, maxDurationSeconds: row.operation === 'asr' ? Number(row.maxDurationSeconds) : 0 };
        });
        if (new Set(models.map(row => row.modelId)).size !== models.length)
            throw Error('AIGC_RESPONSE_INVALID');
        return { client, doc, models };
    }
    remember(scope, id, content) {
        const key = this.key(scope, id), old = this.contentRows.get(key);
        if (old)
            clearTimeout(old.timer);
        while (this.contentRows.size >= 8) {
            const first = this.contentRows.keys().next().value;
            if (first === undefined)
                break;
            clearTimeout(this.contentRows.get(first).timer);
            this.contentRows.delete(first);
        }
        const timer = setTimeout(() => this.contentRows.delete(key), 5 * 60_000);
        timer.unref();
        this.contentRows.set(key, { ...content, timer });
    }
    async output(scope, row, signal) {
        this.assert(scope, signal);
        const existing = this.contentRows.get(this.key(scope, row.requestId));
        if (existing)
            return existing;
        if (row.state !== 'completed' || !this.options.audioResults)
            return null;
        const saved = await this.options.audioResults.get(scope.accountId, row);
        this.assert(scope, signal);
        if (saved)
            this.remember(scope, row.requestId, saved);
        return saved;
    }
    async project(scope, row) {
        const content = row.state === 'completed' ? await this.output(scope, row) : null;
        return { schemaVersion: 1, requestId: row.requestId, modelId: row.modelId, kind: row.kind, state: row.state,
            contentAvailable: !!content, ...(content?.timing ? { timing: content.timing } : {}), ...(content?.timingRequested ? { wordTimestampsStatus: content.timing ? 'available' : 'unavailable' } : {}) };
    }
    async status(scope, row, signal) {
        if (row.kind !== 'audio' || !HARNESS_TTS_MODELS.includes(row.modelId))
            throw Error('AIGC_REQUEST_CONFLICT');
        if (row.state === 'completed' || row.state === 'failed')
            return this.project(scope, row);
        const response = await (await this.client(scope)).mediaRequestStatus(row.requestId, signal);
        if (response.status === 404) {
            await response.body?.cancel();
            return this.project(scope, row);
        }
        const result = await json(response);
        this.assert(scope, signal);
        if (result.model !== row.modelId || result.request_id !== row.requestId)
            throw Error('AIGC_RESPONSE_MODEL_INVALID');
        row = { ...row, state: mediaTaskState(result.status) };
        await this.options.journal.save(scope.accountId, row);
        this.assert(scope, signal);
        return this.project(scope, row);
    }
    async request(scope, path, value, signal) {
        this.assert(scope, signal);
        if (path === '/asr/catalog' && value === undefined) {
            const { doc, models } = await this.catalog(scope, signal);
            return { schemaVersion: 1, catalogRevision: doc.catalogRevision, sourceSha256: doc.sourceSha256, models: models.filter(row => row.operation === 'asr' && HARNESS_VIDEO_ASR_MODELS.includes(row.modelId) && row.responseFormats.includes('verbose_json') && row.timestampLevels.includes('word')).map(row => ({ providerId: slot(row.modelId), modelId: row.modelId, label: row.displayName, formats: row.formats, responseFormats: row.responseFormats, timestampLevels: row.timestampLevels, maxFileBytes: row.maxFileBytes, maxDurationSeconds: row.maxDurationSeconds, priceGuard: row.priceGuard })) };
        }
        if (path === '/asr/requests' && value !== undefined)
            return this.transcribeWords(scope, value, signal);
        if (path === '/speech/catalog' && value === undefined) {
            const { doc, models } = await this.catalog(scope, signal);
            return { schemaVersion: 1, catalogRevision: doc.catalogRevision, sourceSha256: doc.sourceSha256, models: models.filter(r => r.operation === 'tts').map(row => ({
                    providerId: slot(row.modelId), modelId: row.modelId, providerLabel: 'StudyBuddy 语音 · 平台额度', label: row.displayName, type: 'audio', fundingSource: 'platform',
                    voices: row.voices, formats: row.formats, sampleRates: row.sampleRates, languages: row.languages, subtitleTypes: row.subtitleTypes, priceGuard: row.priceGuard
                })) };
        }
        const status = /^\/speech\/requests\/([a-f0-9-]{36})$/.exec(path);
        if (status && mediaRequestUUID(status[1]) && value === undefined) {
            const row = await this.options.journal.get(scope.accountId, status[1]);
            this.assert(scope, signal);
            if (!row)
                throw Error('AIGC_TASK_NOT_FOUND');
            return this.status(scope, row, signal);
        }
        if (path !== '/speech/requests' || value === undefined)
            throw Error('AIGC_ENDPOINT_DENIED');
        const input = object(value), fields = ['requestId', 'handle', 'modelId', 'prompt', 'voiceId', 'speed', 'format', 'sampleRate', 'language', 'volume', 'pitch', 'bitrate', 'wordTimestamps'];
        if (Object.keys(input).some(key => !fields.includes(key)) || !mediaRequestUUID(input.requestId) || typeof input.modelId !== 'string' ||
            input.handle !== slot(input.modelId) || typeof input.prompt !== 'string' || !input.prompt.trim() || Array.from(input.prompt).length >= 10000 ||
            input.prompt.includes('\0') || typeof input.voiceId !== 'string' || typeof input.speed !== 'number' || !Number.isFinite(input.speed) ||
            input.speed < 0.5 || input.speed > 2 || input.wordTimestamps !== undefined && typeof input.wordTimestamps !== 'boolean')
            throw Error('AIGC_REQUEST_INVALID');
        const volume = input.volume ?? 1, pitch = input.pitch ?? 0;
        if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0 || volume > 10 ||
            typeof pitch !== 'number' || !Number.isInteger(pitch) || pitch < -12 || pitch > 12 ||
            input.bitrate !== undefined && ![32000, 64000, 128000, 256000].includes(Number(input.bitrate)))
            throw Error('AIGC_REQUEST_INVALID');
        const timed = input.wordTimestamps === true;
        const body = { model: input.modelId, text: input.prompt, stream: false, output_format: 'hex', subtitle_enable: timed, ...(timed ? { subtitle_type: 'word' } : {}),
            voice_setting: { voice_id: input.voiceId, speed: input.speed, vol: volume, pitch }, audio_setting: { format: input.format, sample_rate: input.sampleRate,
                channel: 1, ...input.bitrate === undefined ? {} : { bitrate: input.bitrate } }, language_boost: input.language === 'zh-CN' ? 'Chinese' : 'English' };
        const row = { schemaVersion: 1, requestId: input.requestId, kind: 'audio', modelId: input.modelId, inputHash: digest(body), taskId: null, state: 'unknown' };
        const old = await this.options.journal.get(scope.accountId, row.requestId);
        this.assert(scope, signal);
        if (old) {
            if (old.inputHash !== row.inputHash || old.modelId !== row.modelId || old.kind !== row.kind)
                throw Error('AIGC_REQUEST_CONFLICT');
            return this.status(scope, old, signal);
        }
        const { client, models } = await this.catalog(scope, signal), model = models.find(r => r.modelId === row.modelId && r.operation === 'tts');
        if (!model || !model.voices.some(v => v.voice === input.voiceId) || !model.formats.includes(String(input.format)) ||
            !model.sampleRates.includes(input.sampleRate) || !model.languages.includes(input.language))
            throw Error('AIGC_MODEL_UNAVAILABLE');
        if (timed && !model.subtitleTypes.includes('word'))
            throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE');
        const claimed = await this.options.journal.claim(scope.accountId, row);
        this.assert(scope, signal);
        if (!claimed.created) {
            if (claimed.row.inputHash !== row.inputHash || claimed.row.modelId !== row.modelId || claimed.row.kind !== row.kind)
                throw Error('AIGC_REQUEST_CONFLICT');
            return this.status(scope, claimed.row, signal);
        }
        const result = await json(await client.invoke({ schemaVersion: 1, requestId: row.requestId, exactModelId: row.modelId, protocol: 'minimax_speech.generate', purpose: 'audio' }, body, AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(190_000)]), model.priceGuard), binaryLimit * 2 + 256 * 1024);
        this.assert(scope, signal);
        const data = object(result.data), extra = object(result.extra_info);
        if (result.model !== row.modelId || Number(object(result.base_resp).status_code) !== 0 || Number(data.status) !== 2 ||
            typeof result.trace_id !== 'string' || !result.trace_id || typeof data.audio !== 'string' || !data.audio.length ||
            data.audio.length > binaryLimit * 2 || data.audio.length % 2 || !/^[a-fA-F0-9]+$/.test(data.audio) ||
            extra.audio_format !== input.format || Number(extra.audio_sample_rate) !== input.sampleRate)
            throw Error('AIGC_RESPONSE_INVALID');
        const bytes = Buffer.from(data.audio, 'hex'), format = input.format;
        if (format === 'wav' && (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') ||
            format === 'flac' && bytes.toString('ascii', 0, 4) !== 'fLaC' || format === 'mp3' && bytes.toString('ascii', 0, 3) !== 'ID3' && !(bytes[0] === 255 && (bytes[1] & 224) === 224))
            throw Error('AIGC_RESPONSE_INVALID');
        const content = { bytes, mime: mimes[format], ...(timed ? { timingRequested: true } : {}) };
        this.remember(scope, row.requestId, content);
        await this.options.audioResults?.save(scope.accountId, row, content);
        this.assert(scope, signal);
        row.state = 'completed';
        await this.options.journal.save(scope.accountId, row);
        this.assert(scope, signal);
        if (timed) {
            try {
                if (typeof data.subtitle_file !== 'string' || typeof extra.audio_length !== 'number')
                    throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE');
                const control = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30000)]);
                const document = await (this.options.readTtsSubtitles ?? downloadMiniMaxTtsSubtitles)(data.subtitle_file, control);
                this.assert(scope, signal);
                const timing = parseMiniMaxTtsTiming(document, extra.audio_length), result = { ...content, timing };
                this.remember(scope, row.requestId, result);
                await this.options.audioResults?.save(scope.accountId, row, result);
                this.assert(scope, signal);
            }
            catch {
                this.assert(scope, signal);
            }
        }
        return this.project(scope, row);
    }
    async content(scope, path, signal) {
        const match = /^\/speech\/requests\/([a-f0-9-]{36})\/content$/.exec(path);
        if (!match || !mediaRequestUUID(match[1]))
            throw Error('AIGC_ENDPOINT_DENIED');
        this.assert(scope, signal);
        const record = await this.options.journal.get(scope.accountId, match[1]);
        this.assert(scope, signal);
        if (!record || record.kind !== 'audio' || !HARNESS_TTS_MODELS.includes(record.modelId))
            throw Error('AIGC_TASK_CONTENT_UNAVAILABLE');
        const output = await this.output(scope, record, signal);
        if (!output)
            throw Error('AIGC_TASK_CONTENT_UNAVAILABLE');
        return new Response(Buffer.from(output.bytes), { headers: { 'Content-Type': output.mime, 'Cache-Control': 'no-store' } });
    }
    async transcribeWords(scope, value, signal) {
        const input = object(value);
        if (Object.keys(input).some(key => !['requestId', 'modelId', 'handle', 'audio', 'contextId'].includes(key)) || !mediaRequestUUID(input.requestId) || typeof input.modelId !== 'string' || !HARNESS_VIDEO_ASR_MODELS.includes(input.modelId) || input.handle !== slot(input.modelId) || !(input.audio instanceof Uint8Array) || !input.audio.length || typeof input.contextId !== 'string' || !/^[a-f0-9]{64}$/.test(input.contextId))
            throw Error('VIDEO_SPEECH_INPUT_INVALID');
        const { client, models } = await this.catalog(scope, signal), model = models.find(row => row.operation === 'asr' && row.modelId === input.modelId);
        if (!model || !model.formats.includes('wav') || !model.responseFormats.includes('verbose_json') || !model.timestampLevels.includes('word') || input.audio.length > model.maxFileBytes)
            throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE');
        const row = { schemaVersion: 1, requestId: input.requestId, kind: 'transcription', modelId: model.modelId, taskId: null, state: 'unknown', inputHash: digest({ modelId: model.modelId, audioSha256: createHash('sha256').update(input.audio).digest('hex'), contextId: input.contextId, responseFormat: 'verbose_json', timestampLevel: 'word' }) };
        const claimed = await this.options.journal.claim(scope.accountId, row);
        this.assert(scope, signal);
        if (!claimed.created)
            throw Error(claimed.row.inputHash === row.inputHash ? 'RESEARCH_SPEECH_ALREADY_SUBMITTED' : 'AIGC_REQUEST_CONFLICT');
        const form = new FormData();
        form.append('model', model.modelId);
        form.append('response_format', 'verbose_json');
        form.append('timestamp_level', 'word');
        form.append('stream', 'false');
        form.append('file', new Blob([Buffer.from(input.audio)], { type: 'audio/wav' }), 'speech.wav');
        const response = await client.invokeMultipart({ schemaVersion: 1, requestId: row.requestId, exactModelId: model.modelId, protocol: 'minimax_speech.transcribe', purpose: 'transcription' }, form, AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(190_000)]), model.priceGuard);
        const result = parseTimedSpeechResult(await json(response, 2 * 1024 * 1024), row.requestId, model.modelId, model.maxDurationSeconds);
        this.assert(scope, signal);
        row.state = 'completed';
        await this.options.journal.save(scope.accountId, row);
        this.assert(scope, signal);
        return result;
    }
    async transcribe(scope, input, signal, context) {
        this.assert(scope, signal);
        if (!mediaRequestUUID(input.requestId) || !HARNESS_ASR_MODELS.includes(input.modelId) || input.mimeType !== 'audio/wav' || !input.audio.length || input.audio.length > 50_000_000)
            throw Error('RESEARCH_SPEECH_INPUT_INVALID');
        const { client, models } = await this.catalog(scope, signal), model = models.find(row => row.operation === 'asr' && row.modelId === input.modelId);
        if (!model || !model.formats.includes('wav'))
            throw Error('RESEARCH_SPEECH_UNAVAILABLE');
        const row = { schemaVersion: 1, requestId: input.requestId, kind: 'transcription', modelId: input.modelId, taskId: null, state: 'unknown',
            inputHash: digest({ modelId: input.modelId, audioSha256: createHash('sha256').update(input.audio).digest('hex'), context }) };
        const claimed = await this.options.journal.claim(scope.accountId, row);
        this.assert(scope, signal);
        if (!claimed.created)
            throw Error(claimed.row.inputHash === row.inputHash ? 'RESEARCH_SPEECH_ALREADY_SUBMITTED' : 'AIGC_REQUEST_CONFLICT');
        const form = new FormData();
        form.append('model', input.modelId);
        form.append('response_format', 'json');
        form.append('stream', 'false');
        form.append('file', new Blob([Buffer.from(input.audio)], { type: 'audio/wav' }), 'voice.wav');
        const result = await json(await client.invokeMultipart({ schemaVersion: 1, requestId: input.requestId, exactModelId: input.modelId, protocol: 'minimax_speech.transcribe', purpose: 'transcription' }, form, AbortSignal.any([signal, AbortSignal.timeout(190_000)]), model.priceGuard));
        this.assert(scope, signal);
        const duration = Number(result.duration);
        if (result.model !== input.modelId || typeof result.trace_id !== 'string' || !result.trace_id ||
            typeof result.text !== 'string' || !result.text.trim() || result.text.length > 131072 || result.text.includes('\0') ||
            !Number.isFinite(duration) || duration <= 0 || duration > 500)
            throw Error('RESEARCH_SPEECH_RESPONSE_INVALID');
        row.state = 'completed';
        await this.options.journal.save(scope.accountId, row);
        this.assert(scope, signal);
        return { requestId: input.requestId, modelId: input.modelId, text: result.text.trim(), duration };
    }
}
//# sourceMappingURL=aigc-speech.js.map