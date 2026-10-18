import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { readVideoViewerSnapshot } from "./studybuddy/video-viewer-snapshot.js";
// Sandboxed top-frame adapter; film iframes receive no native API.
if (process.isMainFrame && location.protocol === 'http:' && location.hostname === '127.0.0.1') {
    const request = async (action) => { const result = await ipcRenderer.invoke('studybuddy:video-guest-action', action); if (!result.ok)
        throw Error(result.error?.code ?? 'VIDEO_ACTION_FAILED'); return result.data; };
    let project = Promise.resolve(), projectId = null, projectEpoch = 0;
    const selectProject = (id) => { projectId = id; projectEpoch++; project = request({ kind: 'project', projectId: id, projectEpoch }); void project.catch(() => { }); return project; };
    const selected = async () => { const id = projectId, epoch = projectEpoch; await project; if (!id || id !== projectId || epoch !== projectEpoch)
        throw Error('VIDEO_SCOPE_REVOKED'); return { projectId: id, projectEpoch: epoch }; };
    const paths = (value) => { if (!Array.isArray(value) || value.some(path => typeof path !== 'string'))
        throw Error('VIDEO_ACTION_FAILED'); return value; };
    const pick = async (purpose, folder, options) => {
        const binding = purpose === 'project' ? {} : await selected();
        return paths(await request({ kind: 'pick-paths', input: { purpose, folder, ...options }, ...binding }));
    };
    const dropped = async (files, purpose) => {
        const values = files.map(file => webUtils.getPathForFile(file));
        if (values.some(value => !value))
            return [];
        const binding = purpose === 'project' ? {} : await selected(), result = [];
        let batch = [];
        const flush = async () => { if (!batch.length)
            return; result.push(...paths(await request({ kind: 'drop-paths', purpose, paths: batch, ...binding }))); batch = []; };
        for (const value of values) {
            if (batch.length >= 128 || JSON.stringify([...batch, value]).length > 60000)
                await flush();
            batch.push(value);
        }
        await flush();
        return result;
    };
    contextBridge.exposeInMainWorld('studybuddyVideoHost', {
        version: 1, name: 'StudyBuddy', managedServices: { label: 'StudyBuddy', open: () => request({ kind: 'open-tools' }), models: async () => request({ kind: 'models', ...await selected() }) },
        folders: { pick: async (options) => { const { purpose = 'project', ...given } = options ?? {}; return (await pick(purpose, true, given))[0] ?? null; }, pathOf: (file) => webUtils.getPathForFile(file), pathsOf: (files) => dropped(files, 'project') },
        files: { pick: (options) => pick('asset', options.folder, options.title ? { title: options.title } : {}), pathsOf: (files) => dropped(files, 'asset') },
        onProject: selectProject,
        onProjectChanged: (id) => projectId === id ? selectProject(id) : Promise.resolve(),
        onSelection: (selection) => { void project.then(() => request({ kind: 'selection', selection })).catch(() => { }); },
        refer: (reference) => { const selected = projectId, epoch = projectEpoch, viewer = readVideoViewerSnapshot(); void project.then(() => { if (selected !== projectId || epoch !== projectEpoch)
            throw Error('VIDEO_SCOPE_REVOKED'); return request({ kind: 'reference', reference, projectId: selected, projectEpoch: epoch, viewer }); }).catch(() => { }); },
    });
}
//# sourceMappingURL=preload-studybuddy-video.js.map