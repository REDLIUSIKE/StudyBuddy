import { SessionId } from '@deepseek-ai/dsh-session';
import { nativeJournalPage } from "./research-journal-export.js";
export class NativeResearchLineageExport {
    query;
    current;
    constructor(query, current) {
        this.query = query;
        this.current = current;
    }
    assert(binding) { if (!this.current(binding))
        throw Error('HARNESS_RESEARCH_SCOPE_REVOKED'); }
    async list(binding) {
        this.assert(binding);
        const records = await this.query.listSessions();
        this.assert(binding);
        if (records.length > 20000)
            throw Error('HARNESS_RESEARCH_EXPORT_LIMIT');
        const root = records.find(record => record.header.id === binding.sessionId);
        if (!root || !binding.authorizedRoots.includes(root.header.cwd ?? ''))
            throw Error('HARNESS_RESEARCH_EXPORT_SESSION_DENIED');
        const result = [{ id: binding.sessionId, parentSessionId: null }], seen = new Set([binding.sessionId]);
        for (let index = 0; index < result.length; index++)
            for (const record of records) {
                if (record.header.parentSession !== result[index].id || seen.has(record.header.id) || !binding.authorizedRoots.includes(record.header.cwd ?? ''))
                    continue;
                if (result.length >= 1024)
                    throw Error('HARNESS_RESEARCH_EXPORT_LIMIT');
                result.push({ id: record.header.id, parentSessionId: record.header.parentSession });
                seen.add(record.header.id);
            }
        return result;
    }
    async page(binding, id, input) {
        const admitted = (await this.list(binding)).find(row => row.id === id);
        if (!admitted)
            throw Error('HARNESS_RESEARCH_EXPORT_SESSION_DENIED');
        const snapshot = await this.query.readSession(SessionId(id));
        this.assert(binding);
        if (snapshot.session.id !== id || !binding.authorizedRoots.includes(snapshot.session.cwd ?? '') || id !== binding.sessionId && snapshot.session.parentSession !== admitted.parentSessionId)
            throw Error('HARNESS_RESEARCH_EXPORT_SESSION_DENIED');
        return nativeJournalPage({ id: SessionId(id), header: snapshot.session, snapshotEvents: () => snapshot.events }, input);
    }
}
//# sourceMappingURL=research-lineage-export.js.map