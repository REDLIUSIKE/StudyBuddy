import { fileURLToPath } from 'node:url';
/** Product overlay in both source launch and bundled Host resources. */
export function desktopSearchProfilePatch(moduleURL) {
    return fileURLToPath(new URL(moduleURL.endsWith('/src/index.ts') ? '../studybuddy-search.patch.yml' : './studybuddy-search.patch.yml', moduleURL));
}
//# sourceMappingURL=search-profile.js.map