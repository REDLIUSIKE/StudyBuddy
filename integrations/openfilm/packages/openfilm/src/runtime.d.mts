import type { VideoRenderRuntime } from '../studio/server/embedded/ports.mjs';
import type {ChildProcess} from 'node:child_process';
export function withRenderRuntime<T>(runtime: VideoRenderRuntime | undefined, callback: () => T, required?: boolean, signal?: AbortSignal,track?:(work:Promise<unknown>)=>void): T;
export function trackRenderChild<T extends ChildProcess>(child:T):T;
export function currentRenderRuntime(): VideoRenderRuntime | undefined;
export function currentRenderSignal(): AbortSignal | undefined;
export function videoProgram(name: 'ffmpeg' | 'ffprobe'): string;
export function videoBrowser(): string | undefined;
