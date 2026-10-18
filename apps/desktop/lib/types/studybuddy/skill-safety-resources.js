/** Scanner resource identity, without credentials or runtime dependency installation. */
import { createHash } from 'node:crypto';
import { lstat, open, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
const file = z.object({ path: z.string().min(1).max(2048), sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().nonnegative().max(256 * 1024 * 1024) }).strict();
/** Fixed upstream identity and complete regular-file witnesses; shared Python is not copied twice. */
export const scannerResourceSchema = z.object({ schemaVersion: z.literal(1), target: z.literal('win32-x64'), pythonVersion: z.literal('3.12.14'),
    upstream: z.object({ repository: z.literal('https://github.com/cisco-ai-defense/skill-scanner'), version: z.literal('2.2.2'), commit: z.literal('ef5cfee8d15fe207e09d808ccb5be4b9ae6d321a') }).strict(),
    lockDigest: z.string().regex(/^[a-f0-9]{64}$/), configDigest: z.string().regex(/^[a-f0-9]{64}$/), files: z.array(file).min(3).max(30000), runtimeFiles: z.array(file).min(1).max(30000),
}).strict();
/**
 * Verify complete scanner resources and the selected shared Python bytes before process creation.
 * @param directory - Fixed cache/build directory selected by its owner, never a tool argument.
 * @param runtimeDirectory - Independently selected existing primary runtime, never downloaded here.
 * @param expectedManifestSha256 - Digest from the trusted client descriptor or build generator.
 * @returns Exact resource identity; unknown files and filesystem links are rejected.
 * @throws For untrusted manifest bytes, missing resources, links or changed interpreter bytes.
 */
export async function verifySkillScannerResources(directory, runtimeDirectory, expectedManifestSha256) {
    try {
        if (!isAbsolute(directory) || !isAbsolute(runtimeDirectory) || !/^[a-f0-9]{64}$/.test(expectedManifestSha256))
            throw Error();
        const bytes = await resourceBytes(join(directory, 'scanner-manifest.json'), 8 * 1024 * 1024);
        if (createHash('sha256').update(bytes).digest('hex') !== expectedManifestSha256)
            throw Error();
        const manifest = scannerResourceSchema.parse(JSON.parse(bytes.toString('utf8')));
        for (const name of ['worker.py', 'transport.py', 'network.py'])
            if (!manifest.files.some(file => file.path === name))
                throw Error();
        if (!manifest.runtimeFiles.some(file => file.path === 'python.exe'))
            throw Error();
        const paths = new Map((await listScannerResourceFiles(directory)).map(file => [file.path, file]));
        if (paths.get('scanner-manifest.json')?.sha256 !== expectedManifestSha256)
            throw Error();
        paths.delete('scanner-manifest.json');
        if (paths.size !== manifest.files.length)
            throw Error();
        const identities = new Set();
        for (const file of manifest.files) {
            validateSkillScannerRelativePath(file.path);
            const observed = paths.get(file.path);
            if (!observed || identities.has(file.path.toLowerCase()) || observed.sha256 !== file.sha256 || observed.size !== file.size)
                throw Error();
            identities.add(file.path.toLowerCase());
        }
        identities.clear();
        const python = join(runtimeDirectory, 'dependencies', 'python');
        for (const file of manifest.runtimeFiles) {
            if (identities.has(file.path.toLowerCase()))
                throw Error();
            identities.add(file.path.toLowerCase());
            await verifyFile(python, file);
        }
        return manifest;
    }
    catch {
        throw Error('SKILL_SAFETY_RESOURCE_INVALID');
    }
}
async function verifyFile(root, entry) {
    validateSkillScannerRelativePath(entry.path);
    const bytes = await resourceBytes(join(root, entry.path), entry.size);
    if (bytes.length !== entry.size || createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
        throw Error();
}
/** Reject Windows aliases, links' escape paths and alternate streams. @param path - Archive/manifest relative filename. */
export function validateSkillScannerRelativePath(path) {
    if (path.length > 2048 || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..' || /[\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
        throw Error('SKILL_SAFETY_RESOURCE_INVALID');
}
/** Check ancestors without following links. @param path - Owner-selected path. @param allowMissing - Permit not-yet-created descendants. */
export async function verifySkillScannerDirectoryPath(path, allowMissing = false) {
    for (let current = resolve(path);;) {
        try {
            if ((await lstat(current)).isSymbolicLink())
                throw Error('SKILL_SAFETY_RESOURCE_INVALID');
        }
        catch (error) {
            if (!allowMissing || !(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
                throw error;
        }
        const parent = dirname(current);
        if (parent === current)
            return;
        current = parent;
    }
}
async function resourceBytes(path, limit) {
    await verifySkillScannerDirectoryPath(path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > limit)
        throw Error('SKILL_SAFETY_RESOURCE_INVALID');
    const handle = await open(path, 'r');
    try {
        const before = await handle.stat();
        if (before.dev !== stat.dev || before.ino !== stat.ino)
            throw Error('SKILL_SAFETY_RESOURCE_INVALID');
        const bytes = await handle.readFile(), after = await handle.stat();
        if (bytes.length !== stat.size || after.size !== stat.size || after.mtimeMs !== before.mtimeMs)
            throw Error('SKILL_SAFETY_RESOURCE_INVALID');
        return bytes;
    }
    finally {
        await handle.close();
    }
}
/** Collect regular-file witnesses for build generation without following links. */
export async function listScannerResourceFiles(directory, exclude) {
    await verifySkillScannerDirectoryPath(directory);
    const files = [];
    let nodes = 0;
    const walk = async (path, prefix, depth) => {
        if (depth > 32 || ++nodes > 50000)
            throw Error('SKILL_SAFETY_RESOURCE_INVALID');
        for (const entry of await readdir(path, { withFileTypes: true })) {
            const relative = prefix + entry.name;
            if (exclude?.(relative))
                continue;
            validateSkillScannerRelativePath(relative);
            if (entry.isSymbolicLink())
                throw Error('SKILL_SAFETY_RESOURCE_INVALID');
            if (entry.isDirectory())
                await walk(join(path, entry.name), relative + '/', depth + 1);
            else if (entry.isFile()) {
                const stat = await lstat(join(path, entry.name));
                const bytes = await resourceBytes(join(path, entry.name), 256 * 1024 * 1024);
                files.push({ path: relative, size: stat.size, sha256: createHash('sha256').update(bytes).digest('hex') });
            }
            else
                throw Error('SKILL_SAFETY_RESOURCE_INVALID');
        }
    };
    await walk(directory, '', 0);
    return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
//# sourceMappingURL=skill-safety-resources.js.map