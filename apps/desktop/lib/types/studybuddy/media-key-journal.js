import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, writeFile, link, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { HARNESS_IMAGE_MODELS, HARNESS_VIDEO_MODEL, HARNESS_TTS_MODELS, HARNESS_ASR_MODELS, HARNESS_AUDIO_MODELS } from '@studybuddy/contracts';
const invalid = () => { throw Error('AIGC_JOURNAL_INVALID'); };
export const mediaRequestUUID = (v) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export const mediaTaskState = (s) => s === 'SUCCESS' || s === 'completed' ? 'completed' :
    s === 'FAILURE' || s === 'failed' ? 'failed' : s === 'IN_PROGRESS' || s === 'in_progress' ? 'in_progress' :
        s === 'SUBMITTED' || s === 'NOT_START' || s === 'queued' ? 'queued' : 'unknown';
const pendingSaves = new Map();
function parse(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return invalid();
    const r = v;
    if (Object.keys(r).sort().join(',') !== 'inputHash,kind,modelId,requestId,schemaVersion,state,taskId' || r.schemaVersion !== 1 ||
        !mediaRequestUUID(r.requestId) || !(r.kind === 'image' && HARNESS_IMAGE_MODELS.includes(r.modelId) || r.kind === 'video' && r.modelId === HARNESS_VIDEO_MODEL ||
        r.kind === 'audio' && (HARNESS_TTS_MODELS.includes(r.modelId) || HARNESS_AUDIO_MODELS.includes(r.modelId)) || r.kind === 'transcription' && HARNESS_ASR_MODELS.includes(r.modelId)) ||
        !/^[a-f0-9]{64}$/.test(r.inputHash) || !['queued', 'in_progress', 'completed', 'failed', 'unknown'].includes(r.state) ||
        !(r.taskId === null || typeof r.taskId === 'string' && /^task_[A-Za-z0-9_-]{1,120}$/.test(r.taskId)))
        return invalid();
    return r;
}
/** Private, keyless transport correlation. Original paid request journals stay intact. */
export class DiskMediaKeyJournal {
    root;
    constructor(root) {
        this.root = root;
    }
    location(owner, id) {
        if (!owner || owner.length > 256 || !mediaRequestUUID(id))
            return invalid();
        const directory = join(this.root, createHash('sha256').update(owner).digest('hex'));
        return { directory, path: join(directory, id + '.json') };
    }
    async directory(path) { await mkdir(path, { recursive: true }); const s = await lstat(path); if (!s.isDirectory() || s.isSymbolicLink())
        invalid(); }
    async get(owner, id) {
        const { path } = this.location(owner, id);
        try {
            const s = await lstat(path);
            if (!s.isFile() || s.isSymbolicLink() || s.size > 4096)
                invalid();
            const row = parse(JSON.parse(await readFile(path, 'utf8')));
            if (row.requestId !== id)
                invalid();
            return row;
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
    }
    async claim(owner, input) {
        const row = parse(input), { directory, path } = this.location(owner, row.requestId);
        await this.directory(directory);
        const temporary = join(directory, randomUUID() + '.pending');
        await writeFile(temporary, JSON.stringify(row), { flag: 'wx', mode: 0o600 });
        try {
            await link(temporary, path);
            return { row, created: true };
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
        finally {
            await unlink(temporary);
        }
        const old = await this.get(owner, row.requestId);
        if (!old)
            return invalid();
        return { row: old, created: false };
    }
    async save(owner, input) {
        const row = parse({ ...input }), { directory, path } = this.location(owner, row.requestId);
        const previous = pendingSaves.get(path) ?? Promise.resolve();
        let release;
        const pending = new Promise(resolve => { release = resolve; });
        pendingSaves.set(path, pending);
        await previous;
        try {
            await this.replace(owner, row, directory, path);
        }
        finally {
            release();
            if (pendingSaves.get(path) === pending)
                pendingSaves.delete(path);
        }
    }
    async replace(owner, row, directory, path) {
        const old = await this.get(owner, row.requestId);
        if (!old || old.inputHash !== row.inputHash || old.modelId !== row.modelId || old.kind !== row.kind)
            return invalid();
        // Keep known completion metadata; never persist media payloads.
        if (old.state === 'completed' && row.state !== 'completed')
            return;
        await this.directory(directory);
        const temporary = join(directory, randomUUID() + '.pending');
        await writeFile(temporary, JSON.stringify(row), { flag: 'wx', mode: 0o600 });
        try {
            for (let attempt = 0;; attempt++) {
                const current = await this.get(owner, row.requestId);
                if (!current || current.inputHash !== row.inputHash || current.modelId !== row.modelId || current.kind !== row.kind)
                    return invalid();
                if (current.state === 'completed' && row.state !== 'completed')
                    return;
                try {
                    await rename(temporary, path);
                    return;
                }
                catch (e) {
                    if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code ?? ''))
                        throw e;
                    // Windows readers/scanners can briefly deny atomic replacement. Retry
                    // only this metadata write; retain the old record and never resend HTTP.
                    await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
                }
            }
        }
        finally {
            await unlink(temporary).catch(() => { });
        }
    }
}
//# sourceMappingURL=media-key-journal.js.map