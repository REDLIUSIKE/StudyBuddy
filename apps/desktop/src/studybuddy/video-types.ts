import type { EmbeddedLease,EmbeddedTheme,OwnedScope } from '@studybuddy/contracts'
import type { VideoRenderRuntime,VideoCapabilityRequest,VideoCapabilityResult } from '../../../../integrations/openfilm/packages/openfilm/studio/server/embedded/ports.mjs'
export type { VideoScope } from '../../../../integrations/openfilm/packages/openfilm/studio/server/embedded/contract.mjs'
export type { VideoRenderRuntime,VideoCapabilityRequest,VideoCapabilityResult }
export interface VideoLaunchResources {
 directory:string;node:string;entry:string;plugin:string;domainEntry:string;staticDirectory:string;manifestSha256:string;renderRuntime:VideoRenderRuntime
 gitDirectory?:string
}
export interface VideoResourcePin {manifestSha256:string;sourceDigest:string;lockDigest:string}
export interface VideoResourceFile {path:string;size:number;sha256:string}
export interface VideoRuntimeManifest {
 schemaVersion:1;kind:'studybuddy-video-plugin';profile:'studybuddy-video';platform:string;arch:string
 upstream:{repository:'https://github.com/openfilm/openfilm.git';tag:'v0.1.7';commit:'6ad25014526e3e4abe8b671aa8009c1ce16ab7cf'}
 sourceDigest:string;lockDigest:string;entry:'compiled/domain.mjs';staticEntry:'web/index.html';files:VideoResourceFile[]
 shared:Record<'node'|'entry'|'plugin'|'browser'|'ffmpeg'|'ffprobe',VideoResourceFile&{root:'primary'|'dsh'|'aigc'|'video';version:string}>&{git?:(VideoResourceFile&{root:'primary'|'dsh'|'aigc'|'video';version:string})}
}
export interface VideoSurfaceHost {
 available():Promise<boolean>
 acquire():Promise<EmbeddedLease>;release(lease:string):Promise<void>;setTheme(lease:string,theme:EmbeddedTheme):Promise<void>;setVisible(lease:string,visible:boolean):Promise<void>
 subscribeInvalid(listener:(lease:string)=>void):()=>void;subscribeAction(listener:(notice:unknown)=>void):()=>void;acknowledgeReference(id:string):Promise<void>
}
export interface VideoNativeAdmission {scope:OwnedScope;hostGeneration:string;projectId:string;sessionId:string;lease:string;root:string}
export const VIDEO_IPC={available:'studybuddy:video-available',acquire:'studybuddy:video-acquire',release:'studybuddy:video-release',theme:'studybuddy:video-theme',visible:'studybuddy:video-visible',invalid:'studybuddy:video-invalid',guestAction:'studybuddy:video-guest-action',action:'studybuddy:video-action',acknowledgeReference:'studybuddy:video-reference-ack'} as const
