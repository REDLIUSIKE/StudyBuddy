/** Public page leases carry no model route, gateway ticket or account credential. */
import type { EmbeddedLease, EmbeddedTheme } from '@studybuddy/contracts';
import type { ResearchSharedIntegrity } from './research-shared-integrity-types.ts';
export interface ResearchSurfaceHost {
    acquire(): Promise<EmbeddedLease>;
    release(lease: string): Promise<void>;
    setTheme(lease: string, theme: EmbeddedTheme): Promise<void>;
    setVisible(lease: string, visible: boolean): Promise<void>;
    subscribeInvalid(listener: (lease: string) => void): () => void;
    subscribeAction(listener: (notice: unknown) => void): () => void;
    acknowledgeIntent(id: string): Promise<void>;
}
export declare const RESEARCH_IPC: {
    readonly acquire: "studybuddy:research-acquire";
    readonly release: "studybuddy:research-release";
    readonly theme: "studybuddy:research-theme";
    readonly visible: "studybuddy:research-visible";
    readonly invalid: "studybuddy:research-invalid";
    readonly project: "studybuddy:research-project";
    readonly guestAction: "studybuddy:research-guest-action";
    readonly action: "studybuddy:research-action";
    readonly acknowledgeIntent: "studybuddy:research-intent-ack";
};
export interface ResearchRuntimeManifest {
    schemaVersion: 2;
    kind: 'studybuddy-research-plugin';
    profile: 'studybuddy-research';
    platform: string;
    arch: string;
    upstream: {
        repository: string;
        commit: string;
    };
    sourceCommit: string;
    sourceDigest: string;
    lockDigest: string;
    entry: 'server/research-domain.mjs';
    staticEntry: 'web/index.html';
    sharedRuntime: ResearchSharedRuntimeIdentity;
    build: {
        assemblerSha256: string;
        serverBuildSha256: string;
        webBuildSha256: string;
    };
    files: readonly {
        path: string;
        sha256: string;
        size: number;
    }[];
}
/** Exact shared interpreters and Host plugin used by this research candidate. */
export interface ResearchSharedRuntimeIdentity {
    nodeVersion: '24.21.0';
    pythonVersion: '3.12.14';
    pythonSha256: string;
    payloadDigest: string;
    nodeSha256: string;
    dshVersion: string;
    dshEntrySha256: string;
    hostPluginSha256: string;
    integrity: ResearchSharedIntegrity;
}
/** Main-selected shared installation roots; the page cannot supply them. */
export interface ResearchSharedRuntimeRoots {
    primaryRuntimeDirectory: string;
    dshDirectory: string;
    workspaceDirectory?: string;
}
/** Verified paths for the dedicated dsh research profile. */
export interface ResearchLaunchResources {
    directory: string;
    node: string;
    python: string;
    entry: string;
    plugin: string;
    domainEntry: string;
    staticDirectory: string;
    manifestSha256: string;
}
export interface ResearchResourcePin {
    manifestSha256: string;
    sourceCommit: string;
    sourceDigest: string;
    lockDigest: string;
}
export interface PrivateResearchRequest {
    rpcId: string;
    projectId: string;
    sessionId?: string;
    operation: 'bind' | 'capabilities' | 'submit' | 'inspect' | 'cancel' | 'answer' | 'project-close' | 'journal' | 'journal-export' | 'journal-sessions' | 'model-catalog' | 'advanced' | 'settlements' | 'goal' | 'schedules' | 'speech-transcribe';
    input: unknown;
}
//# sourceMappingURL=research-types.d.ts.map