import type { VideoScope, VideoEdit, VideoProjectSnapshot, VideoArtifact, VideoRevision } from './contract.mjs';
export { validateVideoScope, validateVideoEdit, VIDEO_DOMAIN_VERSION } from './contract.mjs';
import type { VideoCapabilityPort, VideoRenderRuntime,VideoCapabilityResult } from './ports.mjs';
export interface EmbeddedVideoOptions {
  accountGeneration: string;
  workspaceRoot: string;
  stateRoot: string;
  staticDirectory: string;
  guestAuthorization: string;
  resolveProject(scope: VideoScope): Promise<string>;
  isCurrentScope(scope: VideoScope): boolean;
  scopeForRoot?(root:string):VideoScope|undefined;
  projectSignalForRoot?(root:string):AbortSignal|undefined;
  /** Private native owner persists a successfully renamed original project, including library-only projects. */
  projectRelocated?(event:{projectId:string;from:string;to:string}):Promise<void>;
  capabilities: VideoCapabilityPort;
  renderRuntime?: VideoRenderRuntime;
  signal?: AbortSignal;
}
export interface EmbeddedVideoDomain {
  capabilityProjects(input:{action:'list'}|{action:'create';title:string}):Promise<unknown>;
  capability(scope:VideoScope,caller:import('./ports.mjs').VideoInvocationCaller,operation:string,input:unknown,signal?:AbortSignal):Promise<unknown>;
  /** Only the private native owner supplies selected paths; project, import and export grants stay separate. */
  admitPaths(admission:VideoPathAdmission):Promise<{admitted:true}>;
  projectInfo(projectId:string):Promise<{id:string;path:string;name:string}>;
  start(): Promise<{ editorOrigin: string; filmOrigin: string }>;
  /** Called after the native owner aborts this project; waits for its tasks and subprocesses. */
  quiesceProject(scope:VideoScope):Promise<void>;
  readProject(scope: VideoScope): Promise<VideoProjectSnapshot>;
  readGuide(scope:VideoScope,guide:'manual'|'spec'):Promise<{guide:string;text:string;revision:VideoRevision}>;
  readFile(scope: VideoScope, relativePath: string): Promise<{ text: string; revision: VideoRevision }>;
  applyEdit(scope: VideoScope, expectedRevision: VideoRevision, edit: VideoEdit): Promise<{ revision: VideoRevision; conflict?: false } | { conflict: true; revision: VideoRevision }>;
  look(scope: VideoScope, input: { args?: string[]; options?: {count?:number;offline?:boolean} }): Promise<{ok:boolean;lines:string[];artifacts:VideoArtifact[]}>;
  /** Original media landing path, shared by native tools and Studio. */
  mediaRequest(scope:VideoScope,input:{operation:'voice'|'tts'|'sfx'|'image'|'video';authorityRef:string;requestId:string;input:unknown},signal?:AbortSignal):Promise<VideoCapabilityResult>;
  /** Writes original word-timed VTT; preserves concurrent manual edits and stable paid chunk identities. */
  transcribe(scope:VideoScope,src:string,signal?:AbortSignal):Promise<{src:string;requestIds:string[];artifacts:VideoArtifact[]}>;
  /** Translate subtitles through the current native Session; retain source times and concurrent edits. */
  translate(scope:VideoScope,language:string,signal?:AbortSignal):Promise<{language:string;translated:string[];already:number;same:number;failed:{src:string;error:string}[]}>;
  createExport(scope: VideoScope, input: import('../exports.mjs').ExportAsk&{folder?:string}): Promise<{ jobId: string }>;
  cancelExport(scope: VideoScope, jobId: string): Promise<void>;
  readExports(scope:VideoScope,jobId?:string):Promise<{jobs:import('../exports.mjs').ExportJob[]}>;
  close(): Promise<void>;
}
export type VideoPathAdmission={accountGeneration:string;paths:string[]}&({kind:'project'}|{kind:'asset'|'export';scope:VideoScope});
export function createEmbeddedVideoDomain(options: EmbeddedVideoOptions): Promise<EmbeddedVideoDomain>;
