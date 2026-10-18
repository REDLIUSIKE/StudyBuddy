/** Private immutable source records and bounded snapshot readback. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { brandString } from '@deepseek-ai/dsh-brand';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
const text = z.string().min(1).max(256), digest = z.string().regex(/^[a-f0-9]{64}$/), revision = z.string().min(1).max(256);
const file = z.object({ relativePath: z.string().min(1).max(2048), sha256: digest, byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
/** A private exact locator, never supplied by a model or renderer. */
export const skillSafetyLocatorSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('installed'), instanceId: text, revision, sourceDigest: digest }).strict(),
    z.object({ kind: z.literal('github'), owner: text, repository: text, revision: z.string().regex(/^[a-f0-9]{40}$/), path: z.string().max(2048), files: z.array(z.object({ relativePath: z.string().min(1).max(2048), sha: z.string().regex(/^[a-f0-9]{40}$/), size: z.number().int().nonnegative() }).strict()).max(1000) }).strict(),
]);
const viewSchema = z.object({
    artifactId: text.transform(value => brandString(value)),
    jobId: text.transform(value => brandString(value)), sourceKind: z.enum(['installed', 'github']), revision, digest,
    fileCount: z.number().int().positive().max(1000), byteLength: z.number().int().nonnegative(),
}).strict();
const artifactSchema = z.object({
    version: z.literal(1), accountId: text, generation: z.number().int().nonnegative(), sessionId: text,
    directory: z.string().min(1).max(32768), source: skillSafetyLocatorSchema, files: z.array(file).min(1).max(1000), view: viewSchema,
}).strict();
/** Owns private files outside active skill and project roots. */
export class SkillSafetyArtifacts {
    options;
    root;
    constructor(options) {
        this.options = options;
        if (!isAbsolute(options.root))
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
        this.root = resolve(options.root);
    }
    /**
     * Create an isolated empty staging directory for public-source bytes.
     * @param actor - Current account/session.
     * @returns A newly owned directory; never an active skill root.
     */
    async createStage(actor) {
        this.assertScope(actor);
        await this.ensureRoot();
        const directory = join(this.root, 'stage-' + randomUUID());
        await mkdir(directory, { mode: 0o700 });
        this.assertScope(actor);
        return directory;
    }
    /**
     * Save a new private JSON identity atomically without overwriting another record.
     * @param actor - Current account/session.
     * @param kind - Private record owner.
     * @param id - Opaque owner-issued identity; hashed before path construction.
     * @param value - Owner-validated private data, never credential material.
     */
    async saveJson(actor, kind, id, value) {
        this.assertScope(actor);
        await this.ensureRoot();
        const bytes = Buffer.from(JSON.stringify(value) + '\n');
        if (bytes.length > 4 * 1024 * 1024)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT');
        const temporary = join(this.root, '.' + randomUUID() + '.tmp'), destination = this.recordPath(actor, kind, id);
        const handle = await open(temporary, 'wx', 0o600);
        try {
            try {
                await handle.writeFile(bytes);
                await handle.sync();
            }
            finally {
                await handle.close();
            }
            this.assertScope(actor);
            await link(temporary, destination);
            this.assertScope(actor);
        }
        finally {
            await unlink(temporary);
        }
    }
    /**
     * Read a bounded private record without granting any operation.
     * @param actor - Current account/session.
     * @param kind - Record owner.
     * @param id - Opaque owner-issued identity.
     * @returns Undecoded data for the owning strict schema.
     */
    async readJson(actor, kind, id) {
        this.assertScope(actor);
        await this.ensureRoot();
        try {
            const bytes = await readRegular(this.recordPath(actor, kind, id), 4 * 1024 * 1024);
            this.assertScope(actor);
            return JSON.parse(bytes.toString('utf8'));
        }
        catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
                throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
            if (error instanceof SkillSafetyError)
                throw error;
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID', { cause: error });
        }
    }
    /**
     * Admit checked snapshot bytes and retain their immutable identity.
     * @param actor - Current account/session.
     * @param jobId - Source lookup that owns this snapshot.
     * @param source - Exact private locator.
     * @param directory - Trusted native snapshot or owned public staging directory.
     * @param files - Actual file witnesses from native copying or blob acquisition.
     * @returns Keyless identity only; no path enters a tool result.
     */
    async accept(actor, jobId, source, directory, files) {
        this.assertScope(actor);
        const actual = await this.verifyFiles(directory, files);
        const view = { artifactId: brandString(randomUUID()), jobId, sourceKind: source.kind,
            revision: source.revision, digest: hash(JSON.stringify(actual)), fileCount: actual.length, byteLength: actual.reduce((total, value) => total + value.byteLength, 0) };
        const record = artifactSchema.parse({ version: 1, accountId: actor.accountId, generation: actor.generation, sessionId: actor.sessionId, directory, source, files: actual, view });
        await this.saveJson(actor, 'artifact', view.artifactId, record);
        return view;
    }
    /**
     * Recheck the stored manifest and every byte before scanner/installation use.
     * @param actor - Current account/session.
     * @param artifactId - Owned immutable identity.
     * @returns Private invocation data; changed or extra files fail closed.
     */
    async readSkillArtifact(actor, artifactId) {
        let record;
        try {
            record = artifactSchema.parse(await this.readJson(actor, 'artifact', artifactId));
        }
        catch (error) {
            if (error instanceof SkillSafetyError)
                throw error;
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID', { cause: error });
        }
        if (record.accountId !== actor.accountId || record.generation !== actor.generation || record.sessionId !== actor.sessionId || record.view.artifactId !== artifactId)
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE');
        const files = await this.verifyFiles(record.directory, record.files);
        if (record.view.sourceKind !== record.source.kind || record.view.revision !== record.source.revision || record.view.digest !== hash(JSON.stringify(files)) || record.view.fileCount !== files.length || record.view.byteLength !== files.reduce((sum, value) => sum + value.byteLength, 0))
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        this.assertScope(actor);
        return { directory: record.directory, files, source: record.source, view: record.view };
    }
    recordPath(actor, kind, id) { return join(this.root, hash(JSON.stringify([actor.accountId, actor.sessionId, kind, id])) + '.json'); }
    assertScope(actor) { if (!this.options.isCurrentScope(actor))
        throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'); }
    async ensureRoot() { await noLinks(this.root, true); await mkdir(this.root, { recursive: true, mode: 0o700 }); await noLinks(this.root); }
    async verifyFiles(directory, supplied) {
        if (!isAbsolute(directory) || supplied.length < 1 || supplied.length > this.options.maxFiles)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT');
        await noLinks(directory);
        const parsed = z.array(file).parse(supplied).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
        const expected = new Set(), actual = [];
        for (const entry of parsed) {
            validateRelative(entry.relativePath);
            if (expected.has(entry.relativePath.toLowerCase()))
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
            expected.add(entry.relativePath.toLowerCase());
        }
        if (!parsed.some(entry => entry.relativePath === 'SKILL.md'))
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID');
        let nodes = 0;
        const walk = async (path, prefix, depth) => {
            if (depth > 32)
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT');
            for (const entry of await readdir(path, { withFileTypes: true })) {
                if (++nodes > this.options.maxFiles * 2)
                    throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT');
                const relative = prefix + entry.name;
                validateRelative(relative);
                if (entry.isSymbolicLink())
                    throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
                if (entry.isDirectory())
                    await walk(join(path, entry.name), relative + '/', depth + 1);
                else if (entry.isFile())
                    actual.push(relative);
                else
                    throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
            }
        };
        await walk(directory, '', 0);
        if (actual.sort().join('\n') !== parsed.map(entry => entry.relativePath).join('\n'))
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        let total = 0;
        for (const entry of parsed) {
            total += entry.byteLength;
            if (total > this.options.maxBytes)
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT');
            const bytes = await readRegular(join(directory, entry.relativePath), entry.byteLength);
            if (bytes.length !== entry.byteLength || hash(bytes) !== entry.sha256)
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        }
        return parsed;
    }
}
/**
 * Reject traversal, Windows device/stream names and ambiguous filename spellings.
 * @param value - Repository-relative regular-file path.
 */
export function validateRelative(value) {
    if (!value || value.length > 2048 || value.includes('\\') || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..' || /[\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
        throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
}
async function noLinks(path, allowMissing = false) {
    for (let current = resolve(path);;) {
        try {
            if ((await lstat(current)).isSymbolicLink())
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
        }
        catch (error) {
            if (!(allowMissing && error instanceof Error && 'code' in error && error.code === 'ENOENT'))
                throw error;
        }
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
}
async function readRegular(path, limit) {
    await noLinks(path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > limit)
        throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
    const handle = await open(path, 'r');
    try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        const chunks = [];
        let length = 0;
        for (;;) {
            const chunk = Buffer.alloc(Math.min(64 * 1024, limit + 1 - length)), read = await handle.read(chunk);
            if (read.bytesRead === 0)
                break;
            length += read.bytesRead;
            if (length > limit)
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
            chunks.push(chunk.subarray(0, read.bytesRead));
        }
        const after = await handle.stat();
        if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== opened.mtimeMs)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        return Buffer.concat(chunks, length);
    }
    finally {
        await handle.close();
    }
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
//# sourceMappingURL=skill-safety-artifacts.js.map