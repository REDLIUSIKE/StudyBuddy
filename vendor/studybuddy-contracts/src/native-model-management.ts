/** User-owned model management DTOs. StudyBuddy login credentials are not model Keys. */
export interface ModelConfig {
  internalId: string;
  name: string;
  modelId?: string;
  baseUrl: string;
  apiKey: string;
  anthropicUrl?: string;
  modelType?: 'CLOUD' | 'LOCAL' | 'TUNNEL' | 'DEMO';
  openaiTested?: boolean;
  anthropicTested?: boolean;
  openaiLatency?: number;
  anthropicLatency?: number;
  scope?: 'modelCenter' | 'smartRouter';
}
export type NativeModelCreateInput = {
  name: string; baseUrl: string; apiKey: string; anthropicUrl?: string | undefined;
  modelId?: string; scope?: 'modelCenter' | 'smartRouter';
};
export type NativeModelUpdateInput = {
  name?: string; baseUrl?: string; apiKey?: string; anthropicUrl?: string; modelId?: string;
  openaiTested?: boolean; anthropicTested?: boolean; openaiLatency?: number; anthropicLatency?: number;
};
export type NativeDraftPing = Readonly<{success:boolean;latencyMs:number;url:string;errorCode:string|null}>;
export type NativeModelRegistrationView = Readonly<{
  localRef:string;localRevision:string|null;operationId:string|null;
  state:'unregistered'|'pending'|'active';
  registration:import('./native-user-models.js').NativeUserModelRegistrationV1|null;
}>;

/** Original scanner result, including optional fields consumed by EchoBird UI. */
export interface LocalTool {
  id: string;
  name: string;
  category: string;
  installed: boolean;
  detectedPath?: string;
  configPath?: string;
  activeModel?: string;
  website?: string;
  apiProtocol?: string[];
  iconBase64?: string;
  names?: Record<string, string>;
  startCommand?: string;
  launchFile?: string;
  command?: string;
  version?: string;
  noModelConfig?: boolean;
  noCwdPrompt?: boolean;
  launchUri?: string;
  path?: string;
  icon?: string;
  displayName?: string;
}
