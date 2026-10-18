export type ResearchPageAction = {
    kind: 'open-project' | 'list-chats' | 'new-chat';
    projectId: string;
} | {
    kind: 'select-chat' | 'close-chat';
    projectId: string;
    sessionId: string;
} | {
    kind: 'reference';
    projectId: string;
    path: string;
} | {
    kind: 'draft';
    projectId: string;
    text: string;
    references: string[];
} | {
    kind: 'show-models' | 'show-projects';
} | {
    kind: 'open-service-site';
    url: string;
};
/** Relative sandbox reference grammar shared by closed action validation. */
export declare function isResearchReference(value: unknown): value is string;
/** Parse the entire action before any binding, file read or native notification. */
export declare function parseResearchPageAction(value: unknown): ResearchPageAction;
//# sourceMappingURL=research-actions.d.ts.map