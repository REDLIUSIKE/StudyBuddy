/** Explicit page allowlist; callbacks and private authority never travel as page RPC. */
export const HARNESS_TOOL_METHODS = [
    'addNativeUserModel', 'checkNativeUserSource', 'configureSource', 'connectNativeTool',
    'connectNativeUserSource', 'deleteNativeUserModel', 'getConfigurationViews', 'getDirectoryStates',
    'getNativeRememberedChoices', 'getNativeSourceCandidates', 'getNativeToolCatalog',
    'getNativeToolUserApiUsage', 'getNativeUserModels', 'getSourceConfigurationContext',
    'launchNativeTool', 'listNativeConnectionUi', 'listNativeUserModelRegistrations',
    'listNativeUserSources', 'openNativeToolInstall', 'pickNativeWorkingDirectory',
    'pingNativeUserModel', 'rememberNativeModelChoice', 'reorderNativeUserModels',
    'restoreNativeConnectionUi', 'resumeNativeUserModelSave', 'resumeNativeUserSourceSave',
    'retryNativeConnectionUi', 'saveNativeUserModel', 'saveNativeUserSource', 'scanNativeTools',
    'testNativeUserModel', 'updateNativeUserModel', 'getManagedInstallRoot', 'listInstallDrives',
    'setManagedInstallRoot', 'recoverManagedInstallRoot',
    'prepareToolInstallation',
    'startInstall', 'getActiveInstall', 'getInstallRun', 'retryInstallComponent',
    'repairInstallComponent', 'cancelInstall', 'resumeInstall', 'listManagedComponents',
    'uninstallManagedComponent', 'exportInstallDiagnostics', 'uploadDetectionFailureLogs',
    'uploadInstallFailureLogs', 'listPersistentTools', 'restoreOfficialLogin',
    'restoreToolOfficialLogin', 'resumeNativeToolRuntime', 'getNativeToolUserKeys',
    'getCodexChineseStatus', 'applyCodexChinese', 'restoreCodexChinese',
];
//# sourceMappingURL=harness-tools.js.map