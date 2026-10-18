/** Detached native logs retain authoritative parent relationships, including disposed helpers. */
import type { SessionHeader, SessionEvent } from '@deepseek-ai/dsh-session';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { ResearchProjectBinding } from './research-session-execution.ts';
interface Query {
    listSessions(): Promise<{
        header: SessionHeader;
    }[]>;
    readSession(id: SessionId): Promise<{
        session: SessionHeader;
        events: SessionEvent[];
    }>;
}
type Binding = Pick<ResearchProjectBinding, 'sessionId' | 'authorizedRoots'>;
export declare class NativeResearchLineageExport {
    private readonly query;
    private readonly current;
    constructor(query: Query, current: (binding: Binding) => boolean);
    private assert;
    list(binding: Binding): Promise<{
        id: string;
        parentSessionId: string | null;
    }[]>;
    page(binding: Binding, id: string, input: unknown): Promise<{
        nativeSessionId: string;
        endSeq: number;
        dataBase64: string;
        sha256: string;
        next?: import("./research-journal-export.ts").NativeJournalCursor;
    }>;
}
export {};
//# sourceMappingURL=research-lineage-export.d.ts.map