/** Main refuses an unprepared candidate instead of loading an arbitrary local checkout. */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { RESEARCH_RUNTIME_PIN } from "./research-resource-pin.js";
import { assertResearchPath, verifyResearchRuntime } from "./research-resources.js";
import { verifyResearchSharedIntegrity } from "./research-shared-integrity.js";
/** Select separately prepared development and installed resource identities.
 * @param options - Main-owned application locations and reviewed pins.
 * @returns The resource directory and its matching pin, including an unprepared null pin. */
export function resolveResearchResourceLocation(options) {
    return options.packaged
        ? { directory: join(options.resourcesDirectory, 'studybuddy-research'), pin: options.productionPin }
        : { directory: resolve(options.appDirectory, '../..', '.dsh-build/studybuddy-research-development'), pin: options.developmentPin };
}
/** Validate the shared installation without placing another executable in research resources.
 * @param expected - Shared runtime bytes frozen by the research build.
 * @param roots - Main-selected physical directories, readable by plain Node.
 * @returns Exact Node, dsh launcher and Host plugin paths. */
export async function verifyResearchSharedRuntime(expected, roots) {
    const { primaryRuntimeDirectory, dshDirectory } = roots;
    if (!isAbsolute(primaryRuntimeDirectory) || !isAbsolute(dshDirectory) || /\.asar(?:[\\/]|$)/.test(dshDirectory))
        throw Error('RESEARCH_SHARED_RUNTIME_MISMATCH');
    await assertResearchPath(primaryRuntimeDirectory);
    const metadata = JSON.parse(await readFile(join(primaryRuntimeDirectory, 'runtime.json'), 'utf8'));
    if (!metadata || typeof metadata !== 'object' || !('node' in metadata) || metadata.node !== expected.nodeVersion || !('python' in metadata) || metadata.python !== expected.pythonVersion ||
        !('payloadDigest' in metadata) || metadata.payloadDigest !== expected.payloadDigest ||
        !('platform' in metadata) || metadata.platform !== process.platform || !('arch' in metadata) || metadata.arch !== process.arch)
        throw Error('RESEARCH_SHARED_RUNTIME_MISMATCH');
    const node = join(primaryRuntimeDirectory, 'dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node');
    const python = join(primaryRuntimeDirectory, 'dependencies/python', ...(process.platform === 'win32' ? ['python.exe'] : ['bin/python3']));
    const entry = join(dshDirectory, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
    const plugin = join(dshDirectory, 'node_modules/@deepseek-ai/dsh-desktop-host/lib/research-plugin.js');
    for (const interpreter of [node, python])
        await assertResearchPath(interpreter);
    const executables = [[node, expected.nodeSha256], [python, expected.pythonSha256],
        [entry, expected.dshEntrySha256], [plugin, expected.hostPluginSha256]];
    for (const [path, digest] of executables) {
        if (!(await stat(path)).isFile() || createHash('sha256').update(await readFile(path)).digest('hex') !== digest)
            throw Error('RESEARCH_SHARED_RUNTIME_MISMATCH');
    }
    for (const name of ['dsh', 'dsh-desktop-host']) {
        const value = JSON.parse(await readFile(join(dshDirectory, 'node_modules/@deepseek-ai', name, 'package.json'), 'utf8'));
        if (!value || typeof value !== 'object' || !('name' in value) || value.name !== `@deepseek-ai/${name}` || !('version' in value) || value.version !== expected.dshVersion)
            throw Error('RESEARCH_SHARED_RUNTIME_MISMATCH');
    }
    const verificationOptions = roots.workspaceDirectory === undefined ? {} : { workspaceDirectory: roots.workspaceDirectory };
    await verifyResearchSharedIntegrity(expected.integrity, roots, verificationOptions);
    return { node, python, entry, plugin };
}
/** Resolve the pinned domain and shared installation.
 * @param directory - Main-selected research resource directory.
 * @param roots - Same shared installation as Desktop.
 * @param pin - Reviewed identity selected for this launch mode; defaults to installed resources.
 * @returns Verified launch paths. */
export async function loadResearchResources(directory, roots, pin = RESEARCH_RUNTIME_PIN) {
    if (!pin)
        throw Error('RESEARCH_RESOURCE_NOT_PREPARED');
    const manifest = await verifyResearchRuntime(directory, pin);
    const shared = await verifyResearchSharedRuntime(manifest.sharedRuntime, roots);
    return { directory, ...shared, domainEntry: join(directory, manifest.entry), staticDirectory: join(directory, 'web'), manifestSha256: pin.manifestSha256 };
}
//# sourceMappingURL=research-resource-identity.js.map