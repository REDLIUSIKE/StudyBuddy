import type { VideoArtifact, VideoScope } from './contract.mjs';
export type VideoCapabilityOperation = 'catalog' | 'voice' | 'tts' | 'sfx' | 'music' | 'asr' | 'image-search' | 'image' | 'video' | 'web-search' | 'web-fetch' | 'translate' | 'custom-service' | 'session-export' | 'project-release';
export interface VideoInvocationCaller { schemaVersion: 1; grantRef: string; sessionId: string; toolCallId: string }
export interface VideoCapabilityRequest { scope: VideoScope; caller?: VideoInvocationCaller; requestId: string; operation: VideoCapabilityOperation; authorityRef?: string; input: unknown }
export interface VideoCapabilityResult { data: unknown; artifacts: VideoArtifact[]; receiptRef?: string }
export interface VideoCapabilityPort { request(request: VideoCapabilityRequest, signal: AbortSignal): Promise<VideoCapabilityResult> }
export interface VideoRenderRuntime { browserExecutable: string; ffmpegExecutable: string; ffprobeExecutable: string; identities: Record<string, { sha256: string; version: string }> }
