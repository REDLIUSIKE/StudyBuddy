/** Main-owned dsh composition contains only the pinned research domain plugin. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertResearchPath } from "./research-resources.js";
/** Create or revalidate the immutable account/resource-specific research profile.
 * @param accountDirectory - Existing account research root, separate from its projects.
 * @param resources - Verified executable and domain paths supplied by Main.
 * @returns Dedicated Harness home for this exact resource digest. */
export async function prepareResearchProfile(accountDirectory, resources) {
    if (!/^[a-f0-9]{64}$/.test(resources.manifestSha256))
        throw Error('RESEARCH_PROFILE_INVALID');
    const home = join(accountDirectory, 'runtime-v2', resources.manifestSha256);
    await assertResearchPath(home);
    const profile = 'profiles/studybuddy-research/', rootConfig = profile + 'cordis.yml';
    const expected = new Map([
        ['cordis.patch.yml', '[]\n'],
        [profile + 'package.json', JSON.stringify({ name: 'studybuddy-research-profile', private: true, type: 'module', dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2) + '\n'],
        [profile + 'pnpm-workspace.yaml', 'packages: []\n'],
        [profile + 'cordis.patch.yml', JSON.stringify([{ insert: [{ id: 'studybuddy-research', name: pathToFileURL(resources.plugin).href,
                            config: { domainEntry: resources.domainEntry, staticDirectory: resources.staticDirectory, pythonExecutable: resources.python } }] }], null, 2) + '\n'],
    ]);
    const directories = new Set(['profiles', 'profiles/studybuddy-research']);
    for (const [name, content] of expected) {
        const file = join(home, name);
        await assertResearchPath(file);
        await mkdir(dirname(file), { recursive: true });
        try {
            await writeFile(file, content, { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
        if (await readFile(file, 'utf8') !== content)
            throw Error('RESEARCH_PROFILE_INVALID');
    }
    const walk = async (prefix) => {
        for (const item of await readdir(join(home, prefix), { withFileTypes: true })) {
            const name = prefix + item.name;
            if (item.isSymbolicLink())
                throw Error('RESEARCH_PATH_DENIED');
            if (item.isDirectory()) {
                if (!directories.has(name))
                    throw Error('RESEARCH_PROFILE_INVALID');
                await walk(name + '/');
            }
            else if (!item.isFile() || !expected.has(name) && name !== rootConfig)
                throw Error('RESEARCH_PROFILE_INVALID');
            // dsh overwrites its generated root entry list before loading this profile.
        }
    };
    await walk('');
    await assertResearchPath(home);
    return home;
}
//# sourceMappingURL=research-profile.js.map