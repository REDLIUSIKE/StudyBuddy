import type { OwnedScope } from '@studybuddy/contracts';
import type { OpenDialogOptions } from 'electron';
import type { VideoScope } from './video-types.ts';
import type { VideoPathAdmission } from '../../../../../integrations/openfilm/packages/openfilm/studio/server/embedded/domain.mjs';
type WithoutOwner<T> = T extends {
    accountGeneration: string;
} ? Omit<T, 'accountGeneration'> : never;
export type VideoPathInput = WithoutOwner<VideoPathAdmission>;
export type VideoPathKind = 'project' | 'asset' | 'export';
export interface VideoSavedPath {
    kind: VideoPathKind;
    path: string;
    projectId?: string;
}
interface NativeFilesOptions {
    show(options: OpenDialogOptions): Promise<{
        canceled: boolean;
        filePaths: string[];
    }>;
    admit(scope: OwnedScope, input: VideoPathInput): Promise<string[]>;
}
/** Only actual dialog results or preload-resolved dropped Files reach the private path owner. */
export declare class VideoNativeFiles {
    private readonly options;
    constructor(options: NativeFilesOptions);
    private admit;
    pick(scope: OwnedScope, project: VideoScope | null, value: unknown, check: () => void): Promise<string[]>;
    dropped(scope: OwnedScope, project: VideoScope | null, purpose: unknown, paths: unknown, check: () => void): Promise<string[]>;
}
/** Native user selections are persisted outside projects and separated by the authenticated account. */
export declare class VideoPathStore {
    private readonly directory;
    private readonly isCurrent;
    private readonly queues;
    constructor(directory: (scope: OwnedScope) => string, isCurrent: (scope: OwnedScope) => boolean);
    private check;
    read(scope: OwnedScope): Promise<VideoSavedPath[]>;
    canonical(scope: OwnedScope, kind: VideoPathKind, paths: readonly string[]): Promise<string[]>;
    available(scope: OwnedScope, kind: VideoPathKind, paths: readonly string[]): Promise<string[]>;
    commit(scope: OwnedScope, kind: VideoPathKind, paths: readonly string[], projectId?: string): Promise<void>;
    /** Persist an original domain rename only within the same admitted parent directory. */
    relocated(scope: OwnedScope, workspaceRoot: string, from: string, to: string): Promise<void>;
    private update;
}
export {};
//# sourceMappingURL=video-path-store.d.ts.map