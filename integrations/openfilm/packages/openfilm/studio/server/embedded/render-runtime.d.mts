import type { VideoRenderRuntime } from './ports.mjs';
export interface VideoRuntimeIdentity { path: string; sha256: string; version: string }
export function resolveVideoRenderRuntime(input: { primaryRuntimeDirectory: string; candidateDirectory: string; expectedIdentities: Record<'browser' | 'ffmpeg' | 'ffprobe', VideoRuntimeIdentity> }): Promise<VideoRenderRuntime>;
