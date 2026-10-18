export interface VideoScope { accountGeneration: string; workspaceId: string; projectId: string; sessionId: string }
export type VideoRevision = string;
export interface VideoArtifact { relativePath: string; sha256: string; mime: string }
export type VideoEdit = { kind: 'replace-file'; relativePath: string; text: string } | { kind: 'film-ops'; ops: import('../ops.mjs').Op[] };
export interface VideoProjectSnapshot { revision: VideoRevision; document: string; assets: unknown[]; problems: string[] }
export const VIDEO_DOMAIN_VERSION: 1;
export function validateVideoScope(value: unknown): VideoScope;
export function validateVideoEdit(value: unknown): VideoEdit;
