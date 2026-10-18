export interface ResearchChat {
    sessionId: string;
    label: string;
    closed: boolean;
}
export interface ResearchChats {
    schemaVersion: 3;
    selectedSessionId: string | null;
    chats: ResearchChat[];
}
/** Serialize mutations per manifest and fence every commit with the original account generation. */
export declare class ResearchChatStore {
    private readonly current;
    private readonly pending;
    constructor(current: () => boolean);
    private assert;
    private serial;
    private read;
    private write;
    /** Get the persistent selected identity, creating the first manifest only when absent. */
    get(file: string): Promise<ResearchChats>;
    private append;
    /** Create a new tab identity, without prompting or changing a model selection. */
    create(file: string): Promise<ResearchChats>;
    /** Select only a Session already recorded in this project's owned manifest. */
    select(file: string, sessionId: string): Promise<ResearchChats>;
    /** Hide a tab and retain its history; the last close leaves no active Session. */
    close(file: string, sessionId: string): Promise<ResearchChats>;
}
//# sourceMappingURL=research-chat-store.d.ts.map