import { parseSpeechDurationSeconds } from './speech-duration.js';
const count = (v) => { if (!Number.isSafeInteger(v) || v < 0)
    invalid(); return v; };
const record = (v) => { if (v === null || typeof v !== 'object' || Array.isArray(v))
    invalid(); return v; };
const text = (v) => { if (typeof v !== 'string' || !v || v.length > 1024 || /[\u0000-\u001f]/.test(v))
    invalid(); return v; };
const nullable = (v, parse) => v === null ? null : parse(v);
const instant = (v) => { const s = text(v); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) || new Date(s).toISOString() !== s)
    invalid(); return s; };
const tokens = (v) => { const s = text(v); if (!/^(0|[1-9]\d{0,39})$/.test(s))
    invalid(); return s; };
const money = (v) => { const s = text(v); if (!/^(0|[1-9]\d{0,19})(\.\d{1,8})?$/.test(s))
    invalid(); return s; };
const list = (v, max = 4096) => { if (!Array.isArray(v) || v.length > max)
    invalid(); return v; };
function invalid() { throw new TypeError('PROFILE_MODEL_INSIGHTS_INVALID'); }
/** Official source links use DNS HTTPS origins. Keep validation isomorphic. */
function officialSource(v) {
    const source = text(v), parts = /^https:\/\/([^/?#]+)(?:[/?#][^\s\\]*)?$/i.exec(source);
    const authority = parts && /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i.exec(parts[1]);
    if (!authority || authority[1].length > 253 || !/[a-z]/i.test(authority[1]) || authority[1].split('.').some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) || authority[2] !== undefined && Number(authority[2]) > 65535)
        invalid();
    return source;
}
function usage(v) {
    const r = record(v), requests = count(r.requests), reportedRequests = count(r.reportedRequests), pendingRequests = count(r.pendingRequests), unpricedRequests = count(r.unpricedRequests);
    if (reportedRequests + pendingRequests !== requests || unpricedRequests > requests)
        invalid();
    const input = nullable(r.input, tokens), output = nullable(r.output, tokens), total = nullable(r.total, tokens);
    if ((input === null || output === null) ? total !== null : total !== String(BigInt(input) + BigInt(output)))
        invalid();
    const chargedAmount = nullable(r.chargedAmount, money), confirmedChargedAmount = money(r.confirmedChargedAmount);
    if ((unpricedRequests > 0 && chargedAmount !== null) || (unpricedRequests === 0 && chargedAmount !== confirmedChargedAmount))
        invalid();
    const nonTokenUsage = r.nonTokenUsage === undefined ? [] : list(r.nonTokenUsage, 2).map(v => {
        const q = record(v);
        if (!['character', 'second'].includes(String(q.unit)))
            invalid();
        const reported = count(q.reportedRequests), pending = count(q.pendingRequests), quantity = nullable(q.quantity, q.unit === 'character' ? tokens : parseSpeechDurationSeconds);
        if (reported + pending !== requests || (pending === 0 && quantity === null) || (pending > 0 && quantity !== null))
            invalid();
        return { unit: q.unit, quantity, reportedRequests: reported, pendingRequests: pending };
    });
    if (nonTokenUsage.length && (new Set(nonTokenUsage.map(q => q.unit)).size !== nonTokenUsage.length || [input, output, total, r.cacheRead, r.cacheWrite, r.reasoning].some(v => v !== null)))
        invalid();
    return { requests, reportedRequests, pendingRequests, input, output, total, cacheRead: nullable(r.cacheRead, tokens), cacheWrite: nullable(r.cacheWrite, tokens), reasoning: nullable(r.reasoning, tokens), chargedAmount, confirmedChargedAmount, unpricedRequests, ...(nonTokenUsage.length ? { nonTokenUsage } : {}) };
}
export function parseProfileModelUsage(v) {
    const r = record(v);
    if (!['month', '7d', '30d', 'all'].includes(String(r.period)) || r.currency !== 'CNY' || r.timeZone !== 'Asia/Shanghai')
        invalid();
    const start = nullable(r.start, instant), endExclusive = instant(r.endExclusive);
    if (start !== null && start >= endExclusive)
        invalid();
    const identity = (v) => { const x = record(v), providerId = text(x.providerId), modelId = text(x.modelId); if (x.identity !== JSON.stringify([providerId, modelId]))
        invalid(); return { identity: x.identity, providerId, modelId, modelName: text(x.modelName) }; };
    const models = list(r.models).map(identity), rows = list(r.rows).map(v => { const x = record(v); if (!['platform', 'user_api', 'unknown'].includes(String(x.funding)))
        invalid(); return { ...identity(x), funding: x.funding, usage: usage(x.usage) }; });
    if (new Set(models.map(x => x.identity)).size !== models.length || new Set(rows.map(x => x.identity + ':' + x.funding)).size !== rows.length)
        invalid();
    return { observedAt: instant(r.observedAt), period: r.period, timeZone: 'Asia/Shanghai', start, endExclusive, currency: 'CNY', models, rows, quarantinedRequests: count(r.quarantinedRequests), coverage: list(r.coverage, 32).map(text) };
}
export function parseProfileModelPrices(v) {
    const r = record(v);
    if (r.source !== 'primary_backend_active_pricing')
        invalid();
    const rows = list(r.rows).map(v => {
        const x = record(v);
        if (!['confirmed', 'unconfirmed'].includes(String(x.status)) || ![null, 'CNY'].includes(x.currency))
            invalid();
        const tiers = list(x.tiers, 64).map(v => { const t = record(v); if (!['million_tokens', 'request'].includes(String(t.unit)))
            invalid(); return { label: text(t.label), condition: text(t.condition), unit: t.unit, input: nullable(t.input, money), output: nullable(t.output, money), cacheRead: nullable(t.cacheRead, money), cacheWrite: nullable(t.cacheWrite, money), cacheWrite1h: nullable(t.cacheWrite1h, money), request: nullable(t.request, money) }; });
        const mediaPrices = x.mediaPrices === undefined ? [] : list(x.mediaPrices, 32).map(v => { const m = record(v); if (!['image', 'million_output_tokens', 'character', 'second'].includes(String(m.unit)))
            invalid(); const ratePer = m.ratePer === undefined ? undefined : count(m.ratePer); if ((m.unit === 'character' || m.unit === 'second') && (ratePer === undefined || ratePer < 1 || ratePer > 1000000000))
            invalid(); return { label: text(m.label), condition: text(m.condition), amount: money(m.amount), unit: m.unit, ...(ratePer === undefined ? {} : { ratePer }) }; });
        const priceVersion = nullable(x.priceVersion, text);
        if (mediaPrices.length && (x.mediaCurrency !== 'CNY' || priceVersion === null))
            invalid();
        if (x.mediaCurrency !== undefined && (x.mediaCurrency !== 'CNY' || mediaPrices.length === 0))
            invalid();
        if (x.status === 'confirmed' ? x.currency !== 'CNY' || priceVersion === null || tiers.length === 0 : x.currency !== null || tiers.length !== 0)
            invalid();
        let introduction;
        let catalogRevision, catalogSourceSha256;
        if (x.profile !== undefined) {
            const p = record(x.profile);
            catalogRevision = text(x.catalogRevision);
            catalogSourceSha256 = text(x.catalogSourceSha256);
            if (!/^[a-f0-9]{64}$/.test(catalogSourceSha256) || p.provider !== x.providerId || p.modelId !== x.modelId)
                invalid();
            const source = officialSource(p.source);
            introduction = { provider: text(p.provider), modelId: text(p.modelId), name: text(p.name), summary: text(p.summary), tags: list(p.tags, 16).map(text), inputs: list(p.inputs, 16).map(text), outputs: list(p.outputs, 16).map(text), source };
        }
        else if (x.catalogRevision !== undefined || x.catalogSourceSha256 !== undefined)
            invalid();
        return { identity: text(x.identity), providerId: text(x.providerId), providerName: text(x.providerName), modelId: text(x.modelId), modelName: text(x.modelName), status: x.status, currency: x.currency, priceVersion, configurationVersion: nullable(x.configurationVersion, text), tiers, ...(mediaPrices.length ? { mediaCurrency: 'CNY', mediaPrices } : {}), ...(introduction ? { profile: introduction, catalogRevision: catalogRevision, catalogSourceSha256: catalogSourceSha256 } : {}) };
    });
    if (new Set(rows.map(x => x.identity)).size !== rows.length)
        invalid();
    return { observedAt: instant(r.observedAt), source: 'primary_backend_active_pricing', rows };
}
//# sourceMappingURL=profile-model-insights.js.map