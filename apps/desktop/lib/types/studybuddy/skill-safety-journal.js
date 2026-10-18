/** Main-owned operation reservations; unknown effects are never replayed. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
import { skillSafetyJournalSchema, skillSafetyResultSchema } from "./skill-safety-journal-schema.js";
/** Serializes durable reservations and actual outcomes, not conversation stages. */
export class SkillSafetyJournal {
    options;
    root;
    maxBytes;
    maxRequests;
    tail = Promise.resolve();
    constructor(options) {
        this.options = options;
        if (!isAbsolute(options.root))
            throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID');
        this.root = resolve(options.root);
        this.maxBytes = positiveLimit(options.maxBytes ?? 4 * 1024 * 1024);
        this.maxRequests = positiveLimit(options.maxRequests ?? 1000);
    }
    /**
     * Reserve an effect once or return its actual settled result.
     * @param actor - Current native account/session.
     * @param requestId - Stable caller identity.
     * @param operation - Exact closed operation.
     * @param argumentDigest - Digest derived from validated effective arguments.
     * @returns A new pending reservation or an immutable done result.
     * @throws {SkillSafetyError} for reused arguments, stale scope or uncertain effects.
     */
    reserve(actor, requestId, operation, argumentDigest) {
        return this.update(actor, document => {
            const prior = Object.hasOwn(document.requests, requestId) ? document.requests[requestId] : undefined;
            if (prior !== undefined) {
                this.assertGeneration(actor, prior.generation);
                if (prior.operation !== operation || prior.argumentDigest !== argumentDigest)
                    throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT');
                if (prior.status !== 'done')
                    throw new SkillSafetyError('SKILL_SAFETY_OUTCOME_UNKNOWN');
                return prior;
            }
            if (Object.keys(document.requests).length >= this.maxRequests)
                throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_LIMIT');
            const record = { generation: actor.generation, requestId, operation, argumentDigest, status: 'pending' };
            document.requests[requestId] = record;
            return record;
        });
    }
    /**
     * Commit a real outcome; a settled result is immutable.
     * @param actor - Current native account/session.
     * @param requestId - Existing reservation.
     * @param result - Keyless actual result, decoded before durable publication.
     */
    async settle(actor, requestId, result) {
        await this.update(actor, document => {
            const prior = this.existing(actor, document, requestId);
            if (prior.status === 'done' && canonical(prior.result) !== canonical(result))
                throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT');
            document.requests[requestId] = { ...prior, status: 'done', result: skillSafetyResultSchema.parse(result) };
        });
    }
    /**
     * Record an uncertain interrupted effect without granting a retry.
     * @param actor - Current native account/session.
     * @param requestId - Accepted reservation.
     */
    async markUnknown(actor, requestId) {
        await this.update(actor, document => {
            const prior = this.existing(actor, document, requestId);
            if (prior.status !== 'done')
                document.requests[requestId] = { ...prior, status: 'unknown' };
        });
    }
    /**
     * Read without authorizing or replaying effects.
     * @param actor - Current native account/session.
     * @param requestId - Existing request identity.
     * @returns Validated record or undefined in this session's private document.
     */
    async read(actor, requestId) {
        await this.tail;
        this.assertScope(actor);
        const document = await this.load(actor);
        this.assertScope(actor);
        const prior = Object.hasOwn(document.requests, requestId) ? document.requests[requestId] : undefined;
        if (prior !== undefined)
            this.assertGeneration(actor, prior.generation);
        return prior;
    }
    existing(actor, document, requestId) {
        const prior = Object.hasOwn(document.requests, requestId) ? document.requests[requestId] : undefined;
        if (prior === undefined)
            throw new SkillSafetyError('SKILL_SAFETY_INVALID_STATE');
        this.assertGeneration(actor, prior.generation);
        return prior;
    }
    assertScope(actor) {
        if (!this.options.isCurrentScope(actor))
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
    }
    assertGeneration(actor, generation) {
        if (actor.generation !== generation)
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
    }
    pathFor(actor) { return join(this.root, hash(JSON.stringify([actor.accountId, actor.sessionId])) + '.json'); }
    async ensureRoot() {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        for (let current = this.root;;) {
            const stat = await lstat(current);
            if (!stat.isDirectory() || stat.isSymbolicLink())
                throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID');
            const parent = dirname(current);
            if (parent === current)
                break;
            current = parent;
        }
    }
    async load(actor) {
        await this.ensureRoot();
        const path = this.pathFor(actor);
        try {
            const stat = await lstat(path);
            if (!stat.isFile() || stat.isSymbolicLink())
                throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID');
            if (stat.size > this.maxBytes)
                throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_LIMIT');
            const handle = await open(path, 'r');
            try {
                const opened = await handle.stat();
                if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino)
                    throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID');
                const chunks = [];
                let length = 0;
                for (;;) {
                    const chunk = Buffer.alloc(Math.min(64 * 1024, this.maxBytes + 1 - length));
                    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
                    if (bytesRead === 0)
                        break;
                    length += bytesRead;
                    if (length > this.maxBytes)
                        throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_LIMIT');
                    chunks.push(chunk.subarray(0, bytesRead));
                }
                const document = skillSafetyJournalSchema.parse(JSON.parse(Buffer.concat(chunks, length).toString('utf8')));
                if (document.accountId !== actor.accountId || document.sessionId !== actor.sessionId)
                    throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
                return document;
            }
            finally {
                await handle.close();
            }
        }
        catch (error) {
            if (hasCode(error, 'ENOENT'))
                return { version: 2, accountId: actor.accountId, sessionId: actor.sessionId, requests: {} };
            if (error instanceof SkillSafetyError)
                throw error;
            throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID', { cause: error });
        }
    }
    update(actor, effect) {
        const work = this.tail.then(async () => {
            this.assertScope(actor);
            await this.ensureRoot();
            const path = this.pathFor(actor), lockPath = path + '.lock';
            let lock;
            try {
                lock = await open(lockPath, 'wx', 0o600);
            }
            catch (error) {
                if (hasCode(error, 'EEXIST'))
                    throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_BUSY');
                throw error;
            }
            try {
                const document = await this.load(actor);
                const result = effect(document);
                const serialized = JSON.stringify(skillSafetyJournalSchema.parse(document)) + '\n';
                await this.publish(actor, path, serialized);
                this.assertScope(actor);
                return result;
            }
            finally {
                await lock.close();
                await unlink(lockPath);
            }
        });
        this.tail = work.then(() => { }, () => { });
        return work;
    }
    async publish(actor, path, text) {
        if (Buffer.byteLength(text) > this.maxBytes)
            throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_LIMIT');
        const temporary = join(this.root, '.' + randomUUID() + '.tmp');
        const handle = await open(temporary, 'wx', 0o600);
        try {
            try {
                await handle.writeFile(text, 'utf8');
                await handle.sync();
            }
            finally {
                await handle.close();
            }
            this.assertScope(actor);
            await rename(temporary, path);
        }
        finally {
            try {
                await unlink(temporary);
            }
            catch (error) {
                if (!hasCode(error, 'ENOENT'))
                    throw error;
            }
        }
    }
}
function positiveLimit(value) {
    if (!Number.isSafeInteger(value) || value < 1 || value === Number.MAX_SAFE_INTEGER)
        throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID');
    return value;
}
function hash(text) { return createHash('sha256').update(text).digest('hex'); }
function canonical(value) {
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object' && value !== null) {
        const record = value;
        return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
    }
    return JSON.stringify(value) ?? 'null';
}
function hasCode(error, code) { return error instanceof Error && 'code' in error && error.code === code; }
//# sourceMappingURL=skill-safety-journal.js.map