export interface ResearchIntent {
    id: string;
    projectId: string;
    sessionId: string;
    text: string;
    references: string[];
    createdAt: string;
}
/** Serialized account-owned storage; acknowledgement identifies one native intake. */
export declare class ResearchIntentStore {
    private readonly root;
    private readonly current;
    private chain;
    private readonly file;
    constructor(root: string, current: () => boolean);
    private assert;
    private serial;
    private read;
    private write;
    /** Persist one explicit prepared prompt before notifying the native UI. */
    append(projectId: string, sessionId: string, text: string, references: string[]): Promise<ResearchIntent>;
    /** Restore only prompts for one exact owned project and native Session. */
    list(projectId: string, sessionId: string): Promise<ResearchIntent[]>;
    /** Remove an acknowledged intake; unknown identities cannot change storage. */
    acknowledge(id: string): Promise<void>;
}
//# sourceMappingURL=research-intents.d.ts.map