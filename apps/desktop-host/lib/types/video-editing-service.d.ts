import { Context, Service } from '@deepseek-ai/cordis';
import type { EmbeddedVideoDomain, VideoScope, VideoEdit, VideoRevision } from './video-domain-types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        videoEditing: VideoEditingService;
    }
}
/** The video domain's lifecycle and editing capability, independent of its transport. */
export declare abstract class VideoEditingService extends Service implements EmbeddedVideoDomain {
    abstract capabilityProjects(input: Parameters<EmbeddedVideoDomain['capabilityProjects']>[0]): Promise<unknown>;
    abstract capability(...args: Parameters<EmbeddedVideoDomain['capability']>): Promise<unknown>;
    abstract admitPaths(admission: Parameters<EmbeddedVideoDomain['admitPaths']>[0]): ReturnType<EmbeddedVideoDomain['admitPaths']>;
    abstract projectInfo(projectId: string): ReturnType<EmbeddedVideoDomain['projectInfo']>;
    abstract start(): ReturnType<EmbeddedVideoDomain['start']>;
    abstract quiesceProject(scope: VideoScope): Promise<void>;
    abstract readProject(scope: VideoScope): ReturnType<EmbeddedVideoDomain['readProject']>;
    abstract readGuide(scope: VideoScope, guide: 'manual' | 'spec'): ReturnType<EmbeddedVideoDomain['readGuide']>;
    abstract readFile(scope: VideoScope, path: string): ReturnType<EmbeddedVideoDomain['readFile']>;
    abstract applyEdit(scope: VideoScope, revision: VideoRevision, edit: VideoEdit): ReturnType<EmbeddedVideoDomain['applyEdit']>;
    abstract look(scope: VideoScope, input: Parameters<EmbeddedVideoDomain['look']>[1]): ReturnType<EmbeddedVideoDomain['look']>;
    abstract transcribe(scope: VideoScope, src: string, signal?: AbortSignal): ReturnType<EmbeddedVideoDomain['transcribe']>;
    abstract mediaRequest(scope: VideoScope, input: Parameters<EmbeddedVideoDomain['mediaRequest']>[1], signal?: AbortSignal): ReturnType<EmbeddedVideoDomain['mediaRequest']>;
    abstract translate(scope: VideoScope, language: string, signal?: AbortSignal): ReturnType<EmbeddedVideoDomain['translate']>;
    abstract createExport(scope: VideoScope, input: Parameters<EmbeddedVideoDomain['createExport']>[1]): ReturnType<EmbeddedVideoDomain['createExport']>;
    abstract cancelExport(scope: VideoScope, id: string): Promise<void>;
    abstract readExports(scope: VideoScope, id?: string): ReturnType<EmbeddedVideoDomain['readExports']>;
    abstract close(): Promise<void>;
}
/** Provider for one verified compiled domain; owns idempotent start and close. */
export declare class CompiledVideoEditingService extends VideoEditingService {
    private readonly domain;
    private starting?;
    private closing?;
    constructor(ctx: Context, domain: EmbeddedVideoDomain);
    private admitted;
    capabilityProjects(input: Parameters<EmbeddedVideoDomain['capabilityProjects']>[0]): Promise<unknown>;
    capability(...args: Parameters<EmbeddedVideoDomain['capability']>): Promise<unknown>;
    admitPaths(admission: Parameters<EmbeddedVideoDomain['admitPaths']>[0]): ReturnType<EmbeddedVideoDomain['admitPaths']>;
    projectInfo(projectId: string): ReturnType<EmbeddedVideoDomain['projectInfo']>;
    start(): ReturnType<EmbeddedVideoDomain['start']>;
    quiesceProject(scope: VideoScope): Promise<void>;
    readProject(scope: VideoScope): ReturnType<EmbeddedVideoDomain['readProject']>;
    readGuide(scope: VideoScope, guide: 'manual' | 'spec'): ReturnType<EmbeddedVideoDomain['readGuide']>;
    readFile(scope: VideoScope, path: string): ReturnType<EmbeddedVideoDomain['readFile']>;
    applyEdit(scope: VideoScope, revision: VideoRevision, edit: VideoEdit): ReturnType<EmbeddedVideoDomain['applyEdit']>;
    look(scope: VideoScope, input: Parameters<EmbeddedVideoDomain['look']>[1]): ReturnType<EmbeddedVideoDomain['look']>;
    transcribe(scope: VideoScope, src: string, signal?: AbortSignal): ReturnType<EmbeddedVideoDomain['transcribe']>;
    mediaRequest(scope: VideoScope, input: Parameters<EmbeddedVideoDomain['mediaRequest']>[1], signal?: AbortSignal): ReturnType<EmbeddedVideoDomain['mediaRequest']>;
    translate(scope: VideoScope, language: string, signal?: AbortSignal): ReturnType<EmbeddedVideoDomain['translate']>;
    createExport(scope: VideoScope, input: Parameters<EmbeddedVideoDomain['createExport']>[1]): ReturnType<EmbeddedVideoDomain['createExport']>;
    cancelExport(scope: VideoScope, id: string): Promise<void>;
    readExports(scope: VideoScope, id?: string): ReturnType<EmbeddedVideoDomain['readExports']>;
    close(): Promise<void>;
}
//# sourceMappingURL=video-editing-service.d.ts.map