import type { OwnedScope } from '@studybuddy/contracts'
import type { VideoScope } from './video-domain-types.ts'
export interface VideoToolInvocation {rpcId:string;hostGeneration:string;scope:VideoScope;operation:string;toolCallId:string;input:unknown}
export interface VideoProjectAdmission {scope:OwnedScope;hostGeneration:string;projectId:string;sessionId:string;lease:string;root:string}
export interface VideoProjectBinding {scope:VideoScope;ownedScope:OwnedScope;hostGeneration:string;lease:string;projectRoot:string}
