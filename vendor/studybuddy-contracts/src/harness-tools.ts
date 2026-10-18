/** Closed tool-page capabilities and private native protocol v2. */
import type { EmbeddedTheme, HarnessOperations, NativeAccountApi, NativeOperationMap, OwnedScope } from './harness-account.js';
import type { HarnessLabsApi } from './harness-labs.js';
import type { LocalTool } from './native-model-management.js';
import type { AiAccountSummary } from './ai-account.js';
import type { NativeToolId } from './native-tools.js';
import type { NativeBuiltinPrivateOperationMap } from './native-builtin-consumer-v1.js';
import type { NativeToolCatalogV2, NativeToolConnectV2, NativeToolConnectionViewV2, NativeToolOwnedKeyV2 } from './native-tool-connection-v2.js';
import type { NativeSourceModelCandidateV3, NativeRememberedChoiceV1, NativeUserSourceConnectV3, NativeUserSourceConnectionViewV3, NativeConnectionUiView } from './native-source-ui-v3.js';
import type { SixToolId, NativeSourceConfigurationContextV1, NativeSourceConfigurationRequestV1, NativeToolConfigurationViewV1 } from './native-source-registration-v1.js';
import type { NativeToolConnectionView, ToolConnectionToolId } from './tool-connection.js';
import type {
  ActiveInstallView, AiToolId, ClientCommandError, DiagnosticsExportView, EnvironmentComponentId,
  EnvironmentInventory, InstallDriveView, InstallEventView, InstallPlan,
  InstallRunView, ManagedComponentView, ManagedInstallRootView, PersistentToolView,
  RepairActionId, SupportUploadView, UninstallRunView,
  ToolInstallPreparationView, ToolInstallPreparationResponse,
} from './harness-tool-dto.js';

type HarnessOriginalNativeAccountApi = Omit<NativeAccountApi,
  'getNativeBuiltinCatalog' | 'getNativeBuiltinSourceDetail' | 'refreshNativeBuiltinBalance' | 'runNativeBuiltinDiagnostic'
  | 'listNativeBuiltinReadiness' | 'resumeNativeBuiltinSource' | 'validateNativeBuiltinSource' | 'checkNativeUserSourceV3' | 'saveNativeUserSourceV3'
  | 'resumeNativeUserSourceSaveV3' | 'listNativeUserSourcesV3'>;
export interface HarnessToolApi extends HarnessOriginalNativeAccountApi, Pick<HarnessLabsApi,'getCodexChineseStatus'|'applyCodexChinese'|'restoreCodexChinese'> {
  configureSource(request:NativeSourceConfigurationRequestV1):Promise<NativeToolConfigurationViewV1>;
  connectNativeTool(request:NativeToolConnectV2):Promise<NativeToolConnectionViewV2>;
  connectNativeUserSource(request:NativeUserSourceConnectV3):Promise<NativeUserSourceConnectionViewV3>;
  getDirectoryStates(toolId?:NativeToolId):Promise<import('./native-source-registration-v1.js').NativeToolDirectoryState[]>;
  getConfigurationViews(toolId?:SixToolId):Promise<NativeToolConfigurationViewV1[]>;
  getNativeRememberedChoices():Promise<NativeRememberedChoiceV1[]>;
  getNativeSourceCandidates():Promise<NativeSourceModelCandidateV3[]>;
  getNativeToolCatalog():Promise<NativeToolCatalogV2>;
  getSourceConfigurationContext(toolId:SixToolId):Promise<NativeSourceConfigurationContextV1>;
  launchNativeTool(toolId:NativeToolId,cwd?:string):Promise<void>;
  openNativeToolInstall(toolId:NativeToolId):Promise<void>;
  pickNativeWorkingDirectory():Promise<string|null>;
  rememberNativeModelChoice(choice:NativeRememberedChoiceV1):Promise<void>;
  restoreNativeConnectionUi(toolId:NativeToolId):Promise<NativeConnectionUiView>;
  retryNativeConnectionUi(toolId:NativeToolId):Promise<NativeConnectionUiView>;
  scanNativeTools(toolId?:NativeToolId):Promise<LocalTool[]>;
  getManagedInstallRoot():Promise<ManagedInstallRootView>;
  listInstallDrives():Promise<InstallDriveView[]>;
  setManagedInstallRoot(driveLetter:string):Promise<ManagedInstallRootView>;
  recoverManagedInstallRoot(driveLetter:string):Promise<ManagedInstallRootView>;
  prepareToolInstallation(toolId:NativeToolId):Promise<ToolInstallPreparationView>;
  startInstall(plan:InstallPlan):Promise<InstallRunView>;
  getActiveInstall():Promise<ActiveInstallView|null>;
  getInstallRun(runId:string):Promise<InstallRunView>;
  retryInstallComponent(runId:string,componentId:EnvironmentComponentId):Promise<InstallRunView>;
  repairInstallComponent(runId:string,componentId:EnvironmentComponentId,repairActionId:RepairActionId):Promise<InstallRunView>;
  cancelInstall(runId:string):Promise<InstallRunView>;
  resumeInstall(runId:string):Promise<InstallRunView>;
  listManagedComponents():Promise<ManagedComponentView[]>;
  uninstallManagedComponent(componentId:EnvironmentComponentId,resourceIds:string[],confirmed:true):Promise<UninstallRunView>;
  exportInstallDiagnostics(runId:string):Promise<DiagnosticsExportView>;
  uploadDetectionFailureLogs(inventoryId:string,componentId:EnvironmentComponentId):Promise<SupportUploadView>;
  uploadInstallFailureLogs(runId:string,componentId:EnvironmentComponentId):Promise<SupportUploadView>;
  listenInstallEvents(listener:(event:InstallEventView)=>void):Promise<()=>void>;
  listPersistentTools():Promise<PersistentToolView[]>;
  restoreOfficialLogin(toolId:AiToolId,expectedVersion:number):Promise<PersistentToolView>;
  restoreToolOfficialLogin(toolId:ToolConnectionToolId):Promise<NativeToolConnectionView>;
  resumeNativeToolRuntime():Promise<void>;
  getNativeToolUserKeys(toolId:NativeToolId):Promise<NativeToolOwnedKeyV2[]>;
}

export type HarnessToolOperationMap = HarnessOperations<Omit<HarnessToolApi, 'listenInstallEvents'>>;
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
  'getCodexChineseStatus','applyCodexChinese','restoreCodexChinese',
] as const satisfies readonly (keyof HarnessToolOperationMap)[];

export type HarnessLogoutOutcome = Readonly<{
  localCleared:boolean;remoteRevoked:boolean;persistentCleanupRequired:boolean;
}>;
export type HarnessLogoutRecovery =
  | Readonly<{state:'none'}>
  | Readonly<{state:'pending';outcome:HarnessLogoutOutcome;error?:Readonly<{code:string}>}>
  | Readonly<{state:'complete';outcome:HarnessLogoutOutcome}>;
/** Main-only methods replace page system operations and retain original install authorization. */
export type NativeModelCatalogSyncViewV1 = Readonly<{
  schemaVersion: 1;
  records: readonly Readonly<{toolId:NativeToolId;state:'unchanged'|'updated'|'blocked'|'deferred';catalogRevision:string|null;errorCode:string|null}>[];
}>;
export type HarnessNativeOperationMap = NativeBuiltinPrivateOperationMap & NativeOperationMap & Omit<HarnessToolOperationMap,
  'pickNativeWorkingDirectory' | 'openNativeToolInstall' | 'prepareToolInstallation' | 'startInstall' | 'getActiveInstall'> & {
  prepareToolInstallation:Readonly<{args:[toolId:NativeToolId];result:ToolInstallPreparationResponse}>;
  startInstall:Readonly<{args:[authorizationId:string,plan:InstallPlan];result:InstallRunView}>;
  /** Main-only exact authorization recovery includes completed/cancelled runs; never issued to a page. */
  getActiveInstall:Readonly<{args:[] | [authorizationId:string];result:ActiveInstallView|null}>;
  resolveNativeToolInstallTarget:Readonly<{args:[toolId:NativeToolId];result:{url:string}}>;
  logoutNativeAccount:Readonly<{args:[];result:HarnessLogoutOutcome}>;
  /** Main schedules current-account managed catalog refresh; pages cannot issue this operation. */
  syncNativeModelCatalogs:Readonly<{args:[];result:NativeModelCatalogSyncViewV1}>;
};
export type HarnessNativeRequestV2<K extends keyof HarnessNativeOperationMap = keyof HarnessNativeOperationMap> = Readonly<{
  schemaVersion:2;requestId:string;scope:OwnedScope;method:K;args:HarnessNativeOperationMap[K]['args'];
}>;
export type HarnessNativeReplyV2 = Readonly<{
  schemaVersion:2;kind:'reply';requestId:string;scope:OwnedScope;data:unknown;error:ClientCommandError|null;
}>;
export type HarnessNativeReadyV2 = Readonly<{
  schemaVersion:2;kind:'ready';scope:OwnedScope;streamId:string;ready:boolean;error?:Readonly<{code:string}>;
}>;
export type HarnessInstallEventV2 = Readonly<{
  schemaVersion:2;kind:'install-event';scope:OwnedScope;streamId:string;runId:string;seq:number;payload:InstallEventView;
}>;
/** Private startup recovery has no current login and therefore no fabricated account scope. */
export type HarnessNativeLogoutRecoveryV2 = Readonly<{
  schemaVersion:2;kind:'logout-recovery';ready:boolean;logoutRecovery?:HarnessLogoutRecovery;error?:Readonly<{code:string}>;
}>;
export type HarnessNativeLogoutAckV2 = Readonly<{
  schemaVersion:2;kind:'logout-ack';acknowledged:boolean;error?:Readonly<{code:string}>;
}>;
export type HarnessNativeFrameV2 = HarnessNativeReplyV2 | HarnessNativeReadyV2 |
  HarnessInstallEventV2 | HarnessNativeLogoutRecoveryV2 | HarnessNativeLogoutAckV2;
export type ToolViewLease = Readonly<{lease:string;scope:OwnedScope;moduleId:string}>;
export type ToolPageState = Readonly<{
  scope:OwnedScope;enabled:boolean;refreshRevision:number;returnRevision:number;theme:EmbeddedTheme;
  /** Original authenticated cloud readback; null means unconfirmed, not zero balance. */
  accountSummary?:AiAccountSummary|null;
}>;
export type ToolNavigationNotice = Readonly<{scope:OwnedScope;target:'sources'|'recharge'|'tools'}>|Readonly<{scope:OwnedScope;target:'skill-safety';workspaceId:string;sessionId:string}>;
export type ToolSurfaceBounds = Readonly<{x:number;y:number;width:number;height:number}>;
export type ToolsPageHost = Readonly<{
  api:HarnessToolApi & import('./harness-labs.js').HarnessLabsApi;
  state():Promise<ToolPageState>;
  subscribeState(listener:(state:ToolPageState)=>void):()=>void;
  navigate(target:'sources'|'recharge'|'tools'):Promise<void>;
}>;
