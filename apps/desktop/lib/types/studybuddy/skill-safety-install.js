import { validateRelative } from "./skill-safety-artifacts.js";
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, link, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { load } from 'js-yaml';
import { z } from 'zod';
import { brandString } from '@deepseek-ai/dsh-brand';
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
import { listScannerResourceFiles, verifySkillScannerDirectoryPath } from "./skill-safety-resources.js";
const hash = (value) => createHash('sha256').update(value).digest('hex');
const publicationSchema = z.object({ version: z.literal(1), accountId: z.string(), generation: z.number().int().nonnegative(), sessionId: z.string(),
    requestId: z.string(), reportId: z.string(), name: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/), dev: z.string(), ino: z.string() }).strict();
/** Main owns the filesystem and minimal durable effect identity. */
export class SkillSafetyInstaller {
    options;
    userRoot;
    privateRoot;
    tail = Promise.resolve();
    constructor(options) {
        this.options = options;
        if (!isAbsolute(options.userRoot) || !isAbsolute(options.privateRoot))
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
        this.userRoot = resolve(options.userRoot);
        this.privateRoot = resolve(options.privateRoot);
        for (const [parent, child] of [[this.userRoot, this.privateRoot], [this.privateRoot, this.userRoot]]) {
            const path = relative(parent, child);
            if (path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep)))
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
        }
    }
    /**
     * Install a new eligible source with current scope and full byte/readback checks.
     * @param actor - Live native owner, never a model-provided account.
     * @param requestId - Stable effect identity used for a lost reply.
     * @param reportId - Private real report, not a caller-supplied verdict.
     * @param signal - Native question/turn lifetime.
     * @returns New writes/readback, conflict or uncertainty; never replacement.
     */
    installCheckedSkill(actor, requestId, reportId, signal) {
        const work = this.tail.then(() => this.install(actor, requestId, reportId, signal));
        this.tail = work.then(() => { }, () => { });
        return work;
    }
    async install(actor, requestId, reportId, signal) {
        const check = () => { if (signal.aborted)
            throw new SkillSafetyError('SKILL_SAFETY_CANCELLED'); if (!this.options.isCurrent(actor))
            throw new SkillSafetyError('SKILL_SAFETY_STALE_SCOPE'); };
        check();
        const report = await this.options.readReport(actor, reportId);
        check();
        if (report.reportId !== reportId || report.status !== 'complete' || !report.eligible || ['high', 'critical'].includes(report.maxSeverity) || report.findings.some(value => ['high', 'critical'].includes(value.severity)))
            throw new SkillSafetyError('SKILL_SAFETY_INSTALL_NOT_ALLOWED');
        const artifact = await this.options.readArtifact(actor, report.artifactId);
        check();
        if (artifact.source.kind !== 'github' || artifact.view.sourceKind !== 'github')
            throw new SkillSafetyError('SKILL_SAFETY_INSTALL_NOT_ALLOWED');
        const files = artifact.files.map(file => ({ ...file })).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
        for (const file of files)
            validateRelative(file.relativePath);
        if (hash(JSON.stringify(files)) !== artifact.view.digest)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        if (artifact.view.artifactId !== report.artifactId || artifact.view.digest !== report.artifactDigest || await measuredDigest(artifact.directory) !== report.artifactDigest)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
        const raw = await readFile(join(artifact.directory, 'SKILL.md'), 'utf8'), header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
        if (!header || header[1].length > 65536)
            throw new SkillSafetyError('SKILL_SAFETY_SOURCE_INVALID');
        const metadata = z.object({ name: z.string().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().min(1) }).passthrough().parse(load(header[1]));
        if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(metadata.name) || ['skill-safety-guide', 'cisco-skill-scanner'].includes(metadata.name))
            throw new SkillSafetyError('SKILL_SAFETY_INSTALL_NOT_ALLOWED');
        check();
        await verifySkillScannerDirectoryPath(this.userRoot, true);
        await verifySkillScannerDirectoryPath(this.privateRoot, true);
        await mkdir(this.userRoot, { recursive: true });
        await mkdir(this.privateRoot, { recursive: true, mode: 0o700 });
        await verifySkillScannerDirectoryPath(this.userRoot);
        await verifySkillScannerDirectoryPath(this.privateRoot);
        const operationId = brandString(hash(JSON.stringify([actor, requestId, reportId, this.userRoot])));
        const destination = join(this.userRoot, metadata.name), recordPath = join(this.privateRoot, operationId + '.json');
        const receipt = (status, readbackDigest) => ({ operationId, jobId: artifact.view.jobId, status,
            writesManifestDigest: artifact.view.digest, ...(readbackDigest === undefined ? {} : { readbackDigest }) });
        const readback = async () => {
            check();
            if (await measuredDigest(destination) !== artifact.view.digest)
                return receipt('unknown');
            const registered = await this.options.registryReadback(actor, metadata.name, destination, artifact.view.digest);
            check();
            return registered ? receipt('installed', artifact.view.digest) : receipt('unknown');
        };
        const prior = await readPublication(recordPath);
        if (prior) {
            if (prior.accountId !== actor.accountId || prior.generation !== actor.generation || prior.sessionId !== actor.sessionId || prior.requestId !== requestId || prior.reportId !== reportId || prior.name !== metadata.name || prior.digest !== report.artifactDigest)
                throw new SkillSafetyError('SKILL_SAFETY_REQUEST_CONFLICT');
            const actual = await lstat(destination, { bigint: true }).catch(() => undefined);
            if (!actual?.isDirectory() || actual.isSymbolicLink() || String(actual.dev) !== prior.dev || String(actual.ino) !== prior.ino)
                return receipt('unknown');
            return readback();
        }
        try {
            await lstat(destination);
            return receipt('conflict');
        }
        catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
                throw error;
        }
        const lockPath = join(this.privateRoot, hash(this.userRoot + '\n' + metadata.name) + '.lock');
        let lock;
        try {
            lock = await open(lockPath, 'wx', 0o600);
        }
        catch (error) {
            throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_BUSY', { cause: error });
        }
        let stage, published = false;
        try {
            check();
            try {
                await lstat(destination);
                return receipt('conflict');
            }
            catch (error) {
                if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
                    throw error;
            }
            stage = await mkdtemp(join(this.privateRoot, 'install-'));
            for (const file of files) {
                check();
                const target = join(stage, file.relativePath);
                await mkdir(dirname(target), { recursive: true, mode: 0o700 });
                await copyFile(join(artifact.directory, file.relativePath), target, constants.COPYFILE_EXCL);
            }
            if (await measuredDigest(stage) !== artifact.view.digest || await measuredDigest(artifact.directory) !== artifact.view.digest)
                throw new SkillSafetyError('SKILL_SAFETY_SOURCE_CHANGED');
            const identity = await lstat(stage, { bigint: true });
            const record = publicationSchema.parse({ version: 1, accountId: actor.accountId, generation: actor.generation, sessionId: actor.sessionId,
                requestId, reportId, name: metadata.name, digest: artifact.view.digest, dev: String(identity.dev), ino: String(identity.ino) });
            await writePublication(recordPath, record);
            check();
            await verifySkillScannerDirectoryPath(this.userRoot);
            try {
                await lstat(destination);
                return receipt('conflict');
            }
            catch (error) {
                if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
                    throw error;
            }
            // The Windows-only resource/preset uses same-volume directory publication, never a replacing copy.
            if (process.platform !== 'win32')
                throw new SkillSafetyError('SKILL_SAFETY_INSTALL_NOT_ALLOWED');
            await rename(stage, destination);
            published = true;
            check();
            return await readback();
        }
        finally {
            if (stage !== undefined && !published)
                await removePrivateStage(stage, this.privateRoot);
            await lock.close();
            await unlink(lockPath);
        }
    }
}
async function measuredDigest(directory) {
    const files = (await listScannerResourceFiles(directory)).map(file => ({ relativePath: file.path, sha256: file.sha256, byteLength: file.size })).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
    if (files.length < 1 || files.length > 1000 || files.reduce((sum, file) => sum + file.byteLength, 0) > 25 * 1024 * 1024)
        throw new SkillSafetyError('SKILL_SAFETY_SOURCE_LIMIT');
    return hash(JSON.stringify(files));
}
async function readPublication(path) {
    try {
        await verifySkillScannerDirectoryPath(path);
        const stat = await lstat(path);
        if (!stat.isFile() || stat.size > 8192)
            throw new SkillSafetyError('SKILL_SAFETY_JOURNAL_INVALID');
        return publicationSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return;
        throw error;
    }
}
async function writePublication(path, record) {
    const temporary = join(dirname(path), '.' + randomUUID() + '.tmp'), handle = await open(temporary, 'wx', 0o600);
    try {
        try {
            await handle.writeFile(JSON.stringify(record) + '\n');
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        ;
        await link(temporary, path);
    }
    finally {
        await unlink(temporary);
    }
}
async function removePrivateStage(stage, root) {
    if (dirname(stage) !== root || !basename(stage).startsWith('install-'))
        throw new SkillSafetyError('SKILL_SAFETY_SOURCE_UNSAFE');
    await verifySkillScannerDirectoryPath(stage);
    const remove = async (directory) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink())
                await unlink(path);
            else if (entry.isDirectory()) {
                await remove(path);
                await rmdir(path);
            }
            else
                await unlink(path);
        }
        await rmdir(directory);
    };
    await remove(stage);
}
//# sourceMappingURL=skill-safety-install.js.map