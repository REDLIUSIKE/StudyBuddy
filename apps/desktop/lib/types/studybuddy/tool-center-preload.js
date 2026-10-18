/** The tool page receives only fixed named operations, never generic IPC or Electron. */
import { contextBridge, ipcRenderer } from 'electron';
import { STUDYBUDDY_IPC } from "./types.js";
/** @param transport Private preload transport. @returns Fixed methods and UI-safe state; the lease stays inside this closure. */
export function createToolPageApi(transport) {
    const unwrap = async (promise) => {
        const reply = (await promise);
        // contextBridge copies plain rejected values. Error custom properties are
        // discarded, which otherwise turns unknown native writes into retryable
        // generic errors and hides the installation failure code.
        if (!reply.ok)
            throw { ...reply.error, code: reply.error?.code ?? 'TOOL_OPERATION_FAILED',
                message: reply.error?.message ?? reply.error?.code ?? 'TOOL_OPERATION_FAILED' };
        return reply.data;
    };
    let boot;
    const owner = () => (boot ??= unwrap(transport.invoke(STUDYBUDDY_IPC.toolPageState)));
    const call = async (method, args) => {
        const { owner: lease } = await owner();
        return unwrap(transport.invoke(STUDYBUDDY_IPC.toolOperation, lease.lease, method, args));
    };
    const labsCall = async (method, args) => {
        const { owner: lease } = await owner();
        return unwrap(transport.invoke(STUDYBUDDY_IPC.toolOperation, lease.lease, method, args));
    };
    const api = {
        startSkillSafetyAssistant: input => labsCall('startSkillSafetyAssistant', [input]),
        getSkillSafetyScannerStatus: () => labsCall('getSkillSafetyScannerStatus', []),
        prepareSkillSafetyScanner: input => labsCall('prepareSkillSafetyScanner', [input]),
        cancelSkillSafetyScannerPreparation: input => labsCall('cancelSkillSafetyScannerPreparation', [input]),
        getCodexChineseStatus: () => call('getCodexChineseStatus', []),
        applyCodexChinese: () => call('applyCodexChinese', []),
        restoreCodexChinese: () => call('restoreCodexChinese', []),
        addNativeUserModel: (...args) => call('addNativeUserModel', args),
        checkNativeUserSource: (...args) => call('checkNativeUserSource', args),
        configureSource: (...args) => call('configureSource', args),
        connectNativeTool: (...args) => call('connectNativeTool', args),
        connectNativeUserSource: (...args) => call('connectNativeUserSource', args),
        deleteNativeUserModel: (...args) => call('deleteNativeUserModel', args),
        getConfigurationViews: toolId => call('getConfigurationViews', toolId === undefined ? [] : [toolId]),
        getDirectoryStates: toolId => call('getDirectoryStates', toolId === undefined ? [] : [toolId]),
        getNativeRememberedChoices: (...args) => call('getNativeRememberedChoices', args),
        getNativeSourceCandidates: (...args) => call('getNativeSourceCandidates', args),
        getNativeToolCatalog: (...args) => call('getNativeToolCatalog', args),
        getNativeToolUserApiUsage: (...args) => call('getNativeToolUserApiUsage', args),
        getNativeUserModels: (...args) => call('getNativeUserModels', args),
        getSourceConfigurationContext: (...args) => call('getSourceConfigurationContext', args),
        launchNativeTool: (...args) => call('launchNativeTool', args),
        listNativeConnectionUi: (...args) => call('listNativeConnectionUi', args),
        listNativeUserModelRegistrations: (...args) => call('listNativeUserModelRegistrations', args),
        listNativeUserSources: (...args) => call('listNativeUserSources', args),
        openNativeToolInstall: (...args) => call('openNativeToolInstall', args),
        pickNativeWorkingDirectory: (...args) => call('pickNativeWorkingDirectory', args),
        pingNativeUserModel: (...args) => call('pingNativeUserModel', args),
        rememberNativeModelChoice: (...args) => call('rememberNativeModelChoice', args),
        reorderNativeUserModels: (...args) => call('reorderNativeUserModels', args),
        restoreNativeConnectionUi: (...args) => call('restoreNativeConnectionUi', args),
        resumeNativeUserModelSave: (...args) => call('resumeNativeUserModelSave', args),
        resumeNativeUserSourceSave: (...args) => call('resumeNativeUserSourceSave', args),
        retryNativeConnectionUi: (...args) => call('retryNativeConnectionUi', args),
        saveNativeUserModel: (...args) => call('saveNativeUserModel', args),
        saveNativeUserSource: (...args) => call('saveNativeUserSource', args),
        scanNativeTools: (...args) => call('scanNativeTools', args),
        testNativeUserModel: (...args) => call('testNativeUserModel', args),
        updateNativeUserModel: (...args) => call('updateNativeUserModel', args),
        getManagedInstallRoot: (...args) => call('getManagedInstallRoot', args),
        listInstallDrives: (...args) => call('listInstallDrives', args),
        setManagedInstallRoot: (...args) => call('setManagedInstallRoot', args),
        recoverManagedInstallRoot: (...args) => call('recoverManagedInstallRoot', args),
        prepareToolInstallation: (...args) => call('prepareToolInstallation', args),
        startInstall: (...args) => call('startInstall', args),
        getActiveInstall: (...args) => call('getActiveInstall', args),
        getInstallRun: (...args) => call('getInstallRun', args),
        retryInstallComponent: (...args) => call('retryInstallComponent', args),
        repairInstallComponent: (...args) => call('repairInstallComponent', args),
        cancelInstall: (...args) => call('cancelInstall', args),
        resumeInstall: (...args) => call('resumeInstall', args),
        listManagedComponents: (...args) => call('listManagedComponents', args),
        uninstallManagedComponent: (...args) => call('uninstallManagedComponent', args),
        exportInstallDiagnostics: (...args) => call('exportInstallDiagnostics', args),
        uploadDetectionFailureLogs: (...args) => call('uploadDetectionFailureLogs', args),
        uploadInstallFailureLogs: (...args) => call('uploadInstallFailureLogs', args),
        listPersistentTools: (...args) => call('listPersistentTools', args),
        restoreOfficialLogin: (...args) => call('restoreOfficialLogin', args),
        restoreToolOfficialLogin: (...args) => call('restoreToolOfficialLogin', args),
        resumeNativeToolRuntime: (...args) => call('resumeNativeToolRuntime', args),
        getNativeToolUserKeys: (...args) => call('getNativeToolUserKeys', args),
        listenInstallEvents: listener => listen(listener),
    };
    const listeners = new Set();
    let offEvents, subscribing;
    const listen = async (listener) => {
        listeners.add(listener);
        offEvents ??= transport.on(STUDYBUDDY_IPC.toolInstallEvent, (payload) => {
            for (const current of [...listeners]) {
                try {
                    current(payload);
                }
                catch (error) {
                    console.error('Tool install listener failed', error);
                }
            }
        });
        try {
            await (subscribing ??= owner().then(({ owner: lease }) => unwrap(transport.invoke(STUDYBUDDY_IPC.toolInstallSubscribe, lease.lease))));
        }
        catch (error) {
            listeners.delete(listener);
            if (!listeners.size) {
                offEvents();
                offEvents = undefined;
                subscribing = undefined;
            }
            throw error;
        }
        return () => {
            listeners.delete(listener);
            if (!listeners.size) {
                offEvents?.();
                offEvents = undefined;
                subscribing = undefined;
                void owner()
                    .then(({ owner: lease }) => unwrap(transport.invoke(STUDYBUDDY_IPC.toolInstallUnsubscribe, lease.lease)))
                    .catch(error => console.error('Tool install unsubscription failed', error));
            }
        };
    };
    return {
        api,
        state: () => unwrap(transport.invoke(STUDYBUDDY_IPC.toolPageState)).then(value => value.state),
        subscribeState: listener => transport.on(STUDYBUDDY_IPC.toolPageState, value => listener(value)),
        navigate: async (target) => {
            const { owner: lease } = await owner();
            await unwrap(transport.invoke(STUDYBUDDY_IPC.toolNavigate, lease.lease, target));
        },
    };
}
/** Install only on the exact registered document's main frame. */
export function exposeToolCenter() {
    if (!process.isMainFrame || !['dsh-tools://tool-center/index.html', 'dsh-tools://tool-center/labs.html'].includes(location.href))
        return;
    contextBridge.exposeInMainWorld('studybuddyTools', createToolPageApi({
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        on: (channel, listener) => {
            const callback = (_event, value) => listener(value);
            ipcRenderer.on(channel, callback);
            return () => {
                ipcRenderer.off(channel, callback);
            };
        },
    }));
}
//# sourceMappingURL=tool-center-preload.js.map