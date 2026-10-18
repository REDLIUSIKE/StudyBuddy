export interface AigcLegacySource {
    file: string;
    sha256: string;
}
export interface AigcChat {
    sessionId: string;
    label: string;
    closed: boolean;
    legacy?: AigcLegacySource;
}
export interface AigcChats {
    schemaVersion: 1;
    directory: string;
    selectedSessionId: string;
    chats: AigcChat[];
}
export declare class AigcChatStore {
    private readonly current;
    private readonly pending;
    constructor(current: () => boolean);
    private assert;
    private root;
    private serial;
    private append;
    private publish;
    private read;
    get(directory: string): Promise<AigcChats>;
    create(directory: string, legacy?: AigcLegacySource): Promise<AigcChats>;
    select(directory: string, sessionId: string): Promise<AigcChats>;
    rename(directory: string, sessionId: string, label: string): Promise<AigcChats>;
    close(directory: string, sessionId: string): Promise<AigcChats>;
}
//# sourceMappingURL=aigc-chat-store.d.ts.map