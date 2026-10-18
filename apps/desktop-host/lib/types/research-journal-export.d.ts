import type { Session } from '@deepseek-ai/dsh-session';
export interface NativeJournalCursor {
    seq: number;
    offset: number;
}
export declare function nativeJournalPage(session: Pick<Session, 'id' | 'header' | 'snapshotEvents'>, input: unknown): {
    nativeSessionId: string;
    endSeq: number;
    dataBase64: string;
    sha256: string;
    next?: NativeJournalCursor;
};
//# sourceMappingURL=research-journal-export.d.ts.map