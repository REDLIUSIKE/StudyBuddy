/** Immutable account/resource-specific composition for the single AIGC domain plugin. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertAigcPath } from "./aigc-resources.js";
export async function prepareAigcProfile(accountDirectory, resources) {
    if (!isAbsolute(accountDirectory) || !/^[a-f0-9]{64}$/.test(resources.manifestSha256)
        || ![resources.directory, resources.node, resources.entry, resources.plugin, resources.domainEntry, resources.staticDirectory].every(isAbsolute))
        throw Error('AIGC_PROFILE_INVALID');
    const home = join(accountDirectory, 'runtime-v2', resources.manifestSha256), profile = 'profiles/studybuddy-aigc/';
    await assertAigcPath(home);
    const expected = new Map([
        ['cordis.patch.yml', '[]\n'],
        [profile + 'package.json', JSON.stringify({ name: 'studybuddy-aigc-profile', private: true, type: 'module', dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2) + '\n'],
        [profile + 'pnpm-workspace.yaml', 'packages: []\n'],
        [profile + 'cordis.patch.yml', JSON.stringify([{ insert: [{ id: 'studybuddy-aigc', name: pathToFileURL(resources.plugin).href,
                            config: { domainEntry: resources.domainEntry, resourceDirectory: resources.directory, staticDirectory: resources.staticDirectory } }] }], null, 2) + '\n'],
    ]);
    for (const [name, content] of expected) {
        const path = join(home, name);
        await assertAigcPath(path);
        await mkdir(dirname(path), { recursive: true });
        try {
            await writeFile(path, content, { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
        if (await readFile(path, 'utf8') !== content)
            throw Error('AIGC_PROFILE_INVALID');
    }
    const directories = new Set(['profiles', 'profiles/studybuddy-aigc']);
    const walk = async (prefix) => {
        for (const item of await readdir(join(home, prefix), { withFileTypes: true })) {
            const name = prefix + item.name;
            if (item.isSymbolicLink())
                throw Error('AIGC_RUNTIME_PATH_DENIED');
            if (item.isDirectory()) {
                if (!directories.has(name))
                    throw Error('AIGC_PROFILE_INVALID');
                await walk(name + '/');
            }
            else if (!item.isFile() || !expected.has(name) && name !== profile + 'cordis.yml')
                throw Error('AIGC_PROFILE_INVALID');
        }
    };
    await walk('');
    await assertAigcPath(home);
    return home;
}
//# sourceMappingURL=aigc-profile.js.map