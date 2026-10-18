import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertVideoPath } from "./video-path.js";
/** A dedicated Cordis profile loads only the exact compiled video domain. */
export async function prepareVideoProfile(accountRoot, resources) {
    if (!/^[a-f0-9]{64}$/.test(resources.manifestSha256))
        throw Error('VIDEO_PROFILE_INVALID');
    const home = join(accountRoot, 'runtime-v1', resources.manifestSha256), profile = 'profiles/studybuddy-video/';
    await assertVideoPath(home);
    const expected = new Map([
        ['cordis.patch.yml', '[]\n'],
        [profile + 'package.json', JSON.stringify({ name: 'studybuddy-video-profile', private: true, type: 'module', dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2) + '\n'],
        [profile + 'pnpm-workspace.yaml', 'packages: []\n'],
        [profile + 'cordis.patch.yml', JSON.stringify([{ insert: [{ id: 'studybuddy-video', name: pathToFileURL(resources.plugin).href, config: { domainEntry: resources.domainEntry, staticDirectory: resources.staticDirectory } }] }], null, 2) + '\n'],
    ]);
    for (const [name, content] of expected) {
        const file = join(home, name);
        await assertVideoPath(file);
        await mkdir(dirname(file), { recursive: true });
        try {
            await writeFile(file, content, { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
        if (await readFile(file, 'utf8') !== content)
            throw Error('VIDEO_PROFILE_INVALID');
    }
    const directories = new Set(['profiles', 'profiles/studybuddy-video']);
    const walk = async (prefix) => {
        for (const item of await readdir(join(home, prefix), { withFileTypes: true })) {
            const name = prefix + item.name;
            if (item.isSymbolicLink())
                throw Error('VIDEO_PATH_DENIED');
            if (item.isDirectory()) {
                if (!directories.has(name))
                    throw Error('VIDEO_PROFILE_INVALID');
                await walk(name + '/');
            }
            else if (!item.isFile() || !expected.has(name) && name !== profile + 'cordis.yml')
                throw Error('VIDEO_PROFILE_INVALID');
        }
    };
    await walk('');
    await assertVideoPath(home);
    return home;
}
//# sourceMappingURL=video-profile.js.map