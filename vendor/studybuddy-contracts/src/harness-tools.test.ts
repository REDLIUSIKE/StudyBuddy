import { describe, expect, expectTypeOf, it } from 'vitest';
import * as contracts from './index.js';
import type { InstallPlan as OriginalPlan, InstallRunView as OriginalRun } from '../../../apps/desktop/src/generated/ipc.js';
import type { ModelConfig as OriginalModel, LocalTool as OriginalTool } from '../../../apps/desktop/src/vendor/echobird/api/types.js';

// A missing capability or an accidental account/system grant breaks the page API.
const expectedToolMethods = [
  'getCodexChineseStatus', 'applyCodexChinese', 'restoreCodexChinese',
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
].sort();

describe('Harness tool page capabilities', () => {
  it('includes the reviewed operation set without private or arbitrary commands', () => {
    expect(contracts.HARNESS_TOOL_METHODS).toBeDefined();
    expect([...contracts.HARNESS_TOOL_METHODS].sort()).toEqual(expectedToolMethods);
    expect(new Set(contracts.HARNESS_TOOL_METHODS).size).toBe(56);
    for (const forbidden of ['listenInstallEvents', 'preparePlatformCredential', 'logoutNativeAccount',
      'resolveNativeToolInstallTarget', 'syncNativeModelCatalogs', 'invoke', 'logout', 'detectEnvironment', 'planEnvironment']) {
      expect(contracts.HARNESS_TOOL_METHODS).not.toContain(forbidden);
    }
  });

  it('keeps original installation, native UI V3 and model management declarations', () => {
    expectTypeOf<contracts.BusinessOperationMap['listAiUsage']['result']>().toEqualTypeOf<contracts.AiUsagePage>();
    expectTypeOf<contracts.BusinessOperationMap['getAiUsageDetail']['result']>().toEqualTypeOf<contracts.AiUsageDetail>();
    expectTypeOf<contracts.HarnessToolOperationMap['startInstall']['args']>().toEqualTypeOf<[plan: OriginalPlan]>();
    expectTypeOf<contracts.HarnessToolOperationMap['startInstall']['result']>().toEqualTypeOf<OriginalRun>();
    expectTypeOf<contracts.HarnessNativeOperationMap['startInstall']['args']>().toEqualTypeOf<[authorizationId: string, plan: OriginalPlan]>();
    expectTypeOf<contracts.HarnessToolOperationMap['prepareToolInstallation']['args']>().toEqualTypeOf<[toolId: contracts.NativeToolId]>();
    expectTypeOf<contracts.HarnessToolOperationMap['prepareToolInstallation']['result']>().toEqualTypeOf<contracts.ToolInstallPreparationView>();
    expectTypeOf<contracts.HarnessNativeOperationMap['prepareToolInstallation']['result']>().toEqualTypeOf<contracts.ToolInstallPreparationResponse>();
    expectTypeOf<contracts.HarnessToolOperationMap['listNativeConnectionUi']['result']>().toEqualTypeOf<contracts.NativeConnectionUiView[]>();
    expectTypeOf<contracts.HarnessToolOperationMap['configureSource']['args']>().toEqualTypeOf<[request: contracts.NativeSourceConfigurationRequestV1]>();
    expectTypeOf<contracts.HarnessToolOperationMap['getNativeUserModels']['result']>().toEqualTypeOf<OriginalModel[]>();
    expectTypeOf<contracts.HarnessToolOperationMap['scanNativeTools']['result']>().toEqualTypeOf<OriginalTool[]>();
    expectTypeOf<Extract<keyof contracts.HarnessNativeOperationMap, 'pickNativeWorkingDirectory' | 'openNativeToolInstall'>>().toEqualTypeOf<never>();
  });
});
