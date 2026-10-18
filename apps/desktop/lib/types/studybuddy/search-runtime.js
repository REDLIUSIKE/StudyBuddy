import { createHash } from 'node:crypto';
import { parseToolSearchRequestV1, parseToolSearchResultV1 } from '@studybuddy/contracts';
/** Private original-Key search client. A lost POST is followed only by GET. */
export class StudyBuddySearchRuntime {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async execute(scope, value, signal) {
        const input = parseToolSearchRequestV1(value);
        if (!this.deps.isCurrent(scope))
            throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED');
        signal.throwIfAborted();
        const material = await this.deps.keyMaterial(scope), target = new URL(material.baseUrl);
        if (target.origin !== material.baseUrl || target.username || target.password || target.protocol !== 'https:' && !(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)))
            throw Error('STUDYBUDDY_SEARCH_TARGET_INVALID');
        if (!this.deps.isCurrent(scope))
            throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED');
        const journal = this.deps.journal(scope, input.operationId);
        const identity = { version: 1, owner: scope.accountId, operationId: input.operationId, inputSha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'), keySha256: createHash('sha256').update(material.apiKey).digest('hex'), origin: material.baseUrl };
        const old = await journal.read();
        if (old !== null) {
            let stored;
            try {
                stored = JSON.parse(old);
            }
            catch {
                throw Error('STUDYBUDDY_SEARCH_JOURNAL_INVALID');
            }
            ;
            if (JSON.stringify(stored) !== JSON.stringify(identity))
                throw Error('STUDYBUDDY_SEARCH_OPERATION_CONFLICT');
        }
        else
            await journal.write(JSON.stringify(identity));
        if (!this.deps.isCurrent(scope))
            throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED');
        const headers = { 'Authorization': 'Bearer ' + material.apiKey, 'Content-Type': 'application/json', 'X-Request-Id': input.operationId };
        const read = () => this.deps.fetch(material.baseUrl + '/v1/tools/search_pro/requests/' + input.operationId, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
        let response;
        if (old !== null)
            response = await read();
        else {
            try {
                response = await this.deps.fetch(material.baseUrl + '/v1/tools/search_pro', { method: 'POST', headers, body: JSON.stringify({ text_query: input.textQuery, limit: input.maxResults }), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(75000)]) });
            }
            catch (error) {
                if (!this.deps.isCurrent(scope))
                    throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED'); // Receipt recovery cannot dispatch or charge another query.
                try {
                    response = await read();
                }
                catch {
                    throw new Error('STUDYBUDDY_SEARCH_UNKNOWN', { cause: error });
                }
            }
        }
        for (let attempt = 0;; attempt++) {
            if (!this.deps.isCurrent(scope))
                throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED');
            if (![200, 202, 410, 502].includes(response.status))
                throw Error(response.status === 404 ? 'STUDYBUDDY_SEARCH_UNKNOWN' : 'STUDYBUDDY_SEARCH_UNAVAILABLE');
            const raw = await response.text();
            if (Buffer.byteLength(raw) > 131072)
                throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID');
            let decoded;
            try {
                decoded = JSON.parse(raw);
            }
            catch {
                throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID');
            }
            const result = this.project(decoded, input);
            if (!this.deps.isCurrent(scope))
                throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED');
            if (result.state !== 'reserved' && result.state !== 'dispatched' || attempt >= 70 || signal.aborted)
                return result;
            await new Promise(resolve => { const timer = setTimeout(resolve, 1000); timer.unref(); });
            response = await read();
        }
    }
    project(value, input) {
        if (value === null || typeof value !== 'object' || Array.isArray(value))
            throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID');
        const row = value;
        if (Object.keys(row).sort().join(',') !== 'search_results,studybuddy' || !Array.isArray(row.search_results) || row.studybuddy === null || typeof row.studybuddy !== 'object')
            throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID');
        const metadata = row.studybuddy;
        if (Object.keys(metadata).sort().join(',') !== 'charge_cny,operation_id,result_expires_at,state,truncated' || metadata.operation_id !== input.operationId)
            throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID');
        const sources = row.search_results.map(value => {
            if (value === null || typeof value !== 'object' || Array.isArray(value))
                throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID');
            const source = value;
            if (!Array.isArray(source.chunks))
                throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID');
            const chunks = source.chunks.map(value => { if (value === null || typeof value !== 'object' || !('text' in value) || typeof value.text !== 'string')
                throw Error('STUDYBUDDY_SEARCH_RESPONSE_INVALID'); return value.text; });
            return { url: source.url, chunks, ...source.title === '' || source.title === undefined ? {} : { title: source.title }, ...source.snippet === '' || source.snippet === undefined ? {} : { snippet: source.snippet }, ...source.date === '' || source.date === undefined ? {} : { publishedAt: source.date } };
        });
        return parseToolSearchResultV1({ operationId: metadata.operation_id, state: metadata.state, sources, truncated: metadata.truncated, chargeCny: metadata.charge_cny, resultExpiresAt: metadata.result_expires_at });
    }
}
//# sourceMappingURL=search-runtime.js.map