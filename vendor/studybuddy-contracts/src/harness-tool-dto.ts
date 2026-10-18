/** Original desktop IPC DTOs used by the private Harness tool carrier. */
export type SupportLevel = "supported" | "compatibility" | "unsupported";

export type InstallDriveView = {
  driveLetter: string;
  rootPath: string;
  fileSystem: string;
  freeBytes: number;
  eligible: boolean;
};

export type ManagedInstallRootView = {
  configured: boolean;
  driveLetter: string | null;
  path: string | null;
  freeBytes: number | null;
  locked: boolean;
};

export type SupportUploadView = {
  uploadId: string;
  publicCode: string;
  status: "CREATED" | "UPLOADED" | "AVAILABLE" | "EXPIRED" | "REJECTED";
};

export type EnvironmentComponentId =
  | "git"
  | "git_bash"
  | "node"
  | "vs_code"
  | "cursor"
  | "visual_studio"
  | "build_tools"
  | "rust"
  | "python"
  | "wsl"
  | "codex"
  | "claude_code"
  | "dsh"
  | "hermes"
  | "kimicode"
  | "openclaw"
  | "workbuddy";

export type ComponentState = "installed" | "missing" | "incompatible" | "conflict" | "unknown";

export type AiToolId = "codex" | "claude_code";

export type PersistentToolStatus =
  | "not_installed"
  | "unsupported_version"
  | "available"
  | "activating"
  | "active"
  | "conflict"
  | "recovery_required"
  | "deactivating";

export type PersistentToolView = {
  toolId: AiToolId;
  version: string | null;
  receiptVersion: number;
  status: PersistentToolStatus;
  updatedAtEpochSeconds: number | null;
  canActivate: boolean;
  canDeactivate: boolean;
  canRepair: boolean;
  errorCode: string | null;
};

/** Exact authority tuple confirmed by the user before persistent activation. */

export type PlanAction = "reuse" | "install" | "blocked";

export type ComponentSource = "system" | "study_buddy" | "windows_store" | "official_installer";

export type LocationLabel =
  | "program_files"
  | "local_app_data"
  | "windows_apps"
  | "study_buddy_runtime"
  | "windows_system"
  | "other_program_directory";

export type SystemFacts = {
  os: string;
  architecture: string;
  windowsBuild: number | null;
  logicalProcessorCount: number;
  totalMemoryBytes: number | null;
  systemDriveFreeBytes: number | null;
  elevated: boolean | null;
  pendingReboot: boolean | null;
  webview2RuntimeVersion: string | null;
  supportLevel: SupportLevel;
};

export type ComponentDetection = {
  componentId: EnvironmentComponentId;
  state: ComponentState;
  version: string | null;
  source: ComponentSource | null;
  locationLabel: LocationLabel | null;
  reasonCode: string | null;
};

export type EnvironmentInventory = {
  schemaVersion: number;
  catalogVersion: string;
  inventoryId: string;
  system: SystemFacts;
  components: ComponentDetection[];
  checkedAt: string;
};

export type EnvironmentSelection = {
  inventoryId: string;
  componentIds: EnvironmentComponentId[];
};

export type PlanBlocker = {
  code: string;
  componentId: EnvironmentComponentId | null;
};

export type InstallPlanItem = {
  componentId: EnvironmentComponentId;
  action: PlanAction;
  reasonCode: string;
  requiredBy: EnvironmentComponentId[];
  downloadBytes: number;
  requiredDiskBytes: number;
  requiresAdmin: boolean;
  mayRequireReboot: boolean;
};

export type InstallPlan = {
  schemaVersion: number;
  catalogVersion: string;
  inventoryId: string;
  selectedComponentIds: EnvironmentComponentId[];
  items: InstallPlanItem[];
  totalDownloadBytes: number;
  totalRequiredDiskBytes: number;
  blockers: PlanBlocker[];
};

export type PlanEnvironmentResponse = {
  plan: InstallPlan;
  authorizationId: string | null;
};

/** Public preparation contains evidence and the existing exact plan, never private authority. */
export type ToolInstallPreparationView = Readonly<{inventory: EnvironmentInventory; plan: InstallPlan}>;
/** Main/native only. Null authority means a blocked plan may be displayed but never started. */
export type ToolInstallPreparationResponse = ToolInstallPreparationView & Readonly<{authorizationId: string | null}>;

export type InstallPhase =
  | "awaiting_confirmation"
  | "preparing"
  | "downloading"
  | "verifying_artifact"
  | "awaiting_elevation"
  | "installing"
  | "validating"
  | "reboot_required"
  | "resume_pending"
  | "repairing"
  | "completed"
  | "failed"
  | "cancelled";

export type CodexAcquisitionStage =
  | "detect_existing"
  | "check_verified_cache"
  | "official_store"
  | "official_web_installer"
  | "studybuddy_china_mirror"
  | "verify_package_set"
  | "install_package_set"
  | "validate_installed_package"
  | "launch_and_confirm_window";

export type InstallComponentView = {
  componentId: EnvironmentComponentId;
  phase: InstallPhase;
  progressPercent: number;
  errorCode: string | null;
  availableRepairActionIds: RepairActionId[];
  codexAcquisitionStage: CodexAcquisitionStage | null;
  requiresUserAction: boolean;
};

export type InstallRunView = {
  runId: string;
  catalogVersion: string;
  phase: InstallPhase;
  components: InstallComponentView[];
  rebootRequired: boolean;
};

export type ActiveInstallView = {
  run: InstallRunView;
  plan: InstallPlan;
};

export type RepairActionId =
  | "redownload"
  | "reverify"
  | "reextract"
  | "rebuild_shim"
  | "rerun_editor_installer"
  | "revalidate_editor"
  | "rerun_visual_cpp_installer"
  | "revalidate_visual_cpp"
  | "rerun_python_installer"
  | "revalidate_python"
  | "retry_wsl_features"
  | "revalidate_wsl"
  | "reinstall_ai_tool"
  | "revalidate_ai_tool";

export type InstallEventView = {
  sequence: number;
  revision: number;
  run: InstallRunView;
};

export type ManagedComponentView = {
  componentId: EnvironmentComponentId;
  ownership: "study_buddy_owned" | "study_buddy_modified";
  uninstallAvailable: boolean;
  defaultSelected: boolean;
  resources: ManagedResourceView[];
};

export type ManagedResourceView = {
  resourceId: string;
  kind:
    | "study_buddy_directory"
    | "verified_artifact"
    | "user_path_entry"
    | "registered_product"
    | "windows_feature";
  status: "available" | "removal_pending" | "conflict";
  removalAvailable: boolean;
  defaultSelected: boolean;
};

export type UninstallRunView = {
  componentId: EnvironmentComponentId;
  status: "completed" | "partial" | "retained" | "failed";
  removedCount: number;
  conflictCount: number;
  retainedCount: number;
  errorCode: string | null;
};

export type DiagnosticsExportView = {
  runId: string;
  status: "exported";
  bundle: {
    appVersion: string;
    windowsBuild: number | null;
    catalogVersion: string;
    errorCodes: string[];
    phaseTimestamps: Array<{
      sequence: number;
      phase: InstallPhase;
      unixSeconds: number;
    }>;
    sourceIds: string[];
    evidenceDigests: string[];
  };
  bundleDigest: string;
};

export type ClientCommandError = {
  code: string;
  message: string;
  requestId: string | null;
  availableAt?: string;
};
