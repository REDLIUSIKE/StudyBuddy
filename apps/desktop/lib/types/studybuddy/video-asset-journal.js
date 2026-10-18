/** Project artifact recovery only; native request journals retain all dispatch and billing authority. */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, link, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { assertVideoPath } from "./video-path.js";
import { TtsTimingSchema } from "./tts-timing.js";
export const VideoTtsDetailsSchema = z.strictObject({ wordTimestampsStatus: z.enum(['available', 'unavailable']), timing: TtsTimingSchema.optional() }).refine(value => (value.wordTimestampsStatus === 'available') === !!value.timing);
const hash = z.string().regex(/^[a-f0-9]{64}$/), text = z.string().min(1).max(4096);
const Artifact = z.strictObject({ relativePath: text, sha256: hash, mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg']) });
const common = { schemaVersion: z.literal(1), requestId: z.uuid(), inputHash: hash, contextHash: hash };
const Cache = z.discriminatedUnion('state', [
    z.strictObject({ ...common, state: z.literal('prepared') }),
    z.strictObject({ ...common, state: z.literal('ready'), artifact: Artifact, bytes: z.number().int().min(1).max(100 * 1024 * 1024), stagedRelativePath: text.nullable(), details: VideoTtsDetailsSchema.optional() }),
]);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const temporaryName = /^\.video-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.tmp$/;
export class VideoAssetJournal {
    root;
    identity;
    destination;
    check;
    file;
    retained;
    constructor(root, identity, destination, check) {
        this.root = root;
        this.identity = identity;
        this.destination = destination;
        this.check = check;
        this.file = join(root, '.film', 'studybuddy-media', identity.requestId + '.json');
    }
    retains(path) { return path === this.retained; }
    async safe() { this.check(); await assertVideoPath(this.root); if (await realpath(this.root) !== this.root)
        throw Error('VIDEO_ASSET_PATH_DENIED'); await assertVideoPath(this.file); this.check(); }
    async read() {
        await this.safe();
        try {
            const info = await lstat(this.file);
            if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024)
                throw Error('VIDEO_ASSET_CACHE_INVALID');
            const row = Cache.parse(JSON.parse(await readFile(this.file, 'utf8')));
            this.check();
            if (row.requestId !== this.identity.requestId || row.inputHash !== this.identity.inputHash || row.contextHash !== this.identity.contextHash)
                throw Error('VIDEO_REQUEST_CONFLICT');
            return row;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return null;
            throw error;
        }
    }
    async claim() {
        await this.safe();
        await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
        await this.safe();
        let created = true;
        try {
            await writeFile(this.file, JSON.stringify({ schemaVersion: 1, ...this.identity, state: 'prepared' }) + '\n', { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
            await this.read();
            created = false;
        }
        this.check();
        return created;
    }
    async save(row) {
        await this.safe();
        const temporary = this.file + '.' + randomUUID() + '.tmp';
        try {
            await writeFile(temporary, JSON.stringify(row) + '\n', { flag: 'wx', mode: 0o600 });
            await this.safe();
            await rename(temporary, this.file);
            this.check();
        }
        finally {
            await assertVideoPath(temporary);
            await rm(temporary, { force: true });
        }
    }
    async verified(path, row) {
        const file = await this.destination(path);
        await assertVideoPath(file);
        this.check();
        try {
            const before = await lstat(file);
            if (!before.isFile() || before.isSymbolicLink() || before.size !== row.bytes)
                throw Error('VIDEO_ASSET_CONFLICT');
            const input = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
            try {
                const actual = await input.stat();
                if (actual.ino !== before.ino || actual.dev !== before.dev || actual.size !== row.bytes || digest(await input.readFile()) !== row.artifact.sha256)
                    throw Error('VIDEO_ASSET_CONFLICT');
            }
            finally {
                await input.close();
            }
            this.check();
            return true;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return false;
            throw error;
        }
    }
    async recover(target) {
        const row = await this.read();
        if (!row || row.state !== 'ready')
            return null;
        return { artifact: await this.publish(row, target), ...(row.details ? { details: row.details } : {}) };
    }
    async stage(temporary, artifact, bytes, target, details) {
        const stagedRelativePath = relative(this.root, temporary).split(sep).join('/');
        if (!temporaryName.test(basename(temporary)))
            throw Error('VIDEO_ASSET_CACHE_INVALID');
        const row = Cache.parse({ schemaVersion: 1, ...this.identity, state: 'ready', artifact, bytes, stagedRelativePath, ...(details ? { details } : {}) });
        if (row.state !== 'ready')
            throw Error('VIDEO_ASSET_CACHE_INVALID');
        this.retained = temporary;
        await this.save(row);
        return this.publish(row, target);
    }
    async publish(row, target) {
        let source = row.artifact.relativePath;
        if (row.stagedRelativePath !== null) {
            if (!temporaryName.test(basename(row.stagedRelativePath)))
                throw Error('VIDEO_ASSET_CACHE_INVALID');
            if (await this.verified(row.stagedRelativePath, row))
                source = row.stagedRelativePath;
            else if (!await this.verified(source, row))
                throw Error('VIDEO_MEDIA_CONTENT_UNAVAILABLE');
        }
        else if (!await this.verified(source, row))
            throw Error('VIDEO_MEDIA_CONTENT_UNAVAILABLE');
        const filename = await target(row.artifact.mime), relativePath = relative(this.root, filename).split(sep).join('/'), artifact = { ...row.artifact, relativePath };
        await this.destination(relativePath);
        await assertVideoPath(filename);
        this.check();
        const existing = await lstat(filename).catch((error) => { if (error.code === 'ENOENT')
            return null; throw error; });
        if (existing) {
            if (relativePath !== row.artifact.relativePath)
                throw Error('VIDEO_ASSET_EXISTS');
            try {
                await this.verified(relativePath, row);
            }
            catch {
                throw Error(row.stagedRelativePath === null ? 'VIDEO_ASSET_CONFLICT' : 'VIDEO_ASSET_EXISTS');
            }
        }
        else {
            await mkdir(dirname(filename), { recursive: true });
            await this.destination(relativePath);
            await assertVideoPath(filename);
            this.check();
            const path = await this.destination(source), reuse = source === row.stagedRelativePath && dirname(path) === dirname(filename), temporary = reuse ? path : join(dirname(filename), '.video-' + randomUUID() + '.tmp');
            try {
                if (!reuse)
                    await copyFile(path, temporary, constants.COPYFILE_EXCL);
                this.check();
                await assertVideoPath(filename);
                await link(temporary, filename);
            }
            catch (error) {
                if (error.code === 'EEXIST')
                    throw Error('VIDEO_ASSET_EXISTS');
                throw error;
            }
            finally {
                if (!reuse) {
                    await assertVideoPath(temporary);
                    await rm(temporary, { force: true });
                }
            }
        }
        if (!await this.verified(relativePath, row))
            throw Error('VIDEO_MEDIA_CONTENT_UNAVAILABLE');
        this.check();
        await this.save({ ...row, artifact, stagedRelativePath: null });
        if (row.stagedRelativePath !== null) {
            const staged = await this.destination(row.stagedRelativePath);
            await assertVideoPath(staged);
            await rm(staged, { force: true });
            if (this.retained === staged)
                this.retained = undefined;
        }
        return artifact;
    }
}
//# sourceMappingURL=video-asset-journal.js.map