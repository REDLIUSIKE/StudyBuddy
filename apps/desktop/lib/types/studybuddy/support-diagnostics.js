/** Controlled operational events enter the existing support logger, never Session transcripts. */
import { createHash } from 'node:crypto';
import { HARNESS_DIAGNOSTIC_SOURCES, parseClientLogEvent } from '@studybuddy/contracts';
const events = ['harness_started', 'harness_authenticated', 'harness_scope_revoked', 'harness_bridge_failed',
    'harness_window_failed', 'harness_host_started', 'harness_host_terminated', 'harness_update_failed',
    'harness_support_started', 'harness_support_completed', 'harness_support_failed', 'harness_module_acquired',
    'harness_module_failed', 'harness_module_released', 'harness_previous_exit_unclean'];
const object = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const keys = (row, required, optional = []) => required.every(key => Object.hasOwn(row, key)) && Object.keys(row).every(key => required.includes(key) || optional.includes(key));
const same = (a, b) => a?.accountId === b?.accountId && a?.generation === b?.generation;
const scalar = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function attributed(value, scope, source) {
    if (!object(value) || !keys(value, ['scope', 'event']) || !object(value.scope) ||
        !keys(value.scope, ['accountId', 'generation']) ||
        value.scope.accountId !== scope.accountId || value.scope.generation !== scope.generation || !object(value.event) ||
        !keys(value.event, ['source', 'eventName', 'outcome'], ['errorCode', 'durationMs', 'fields']))
        throw new TypeError('HARNESS_DIAGNOSTICS_INVALID');
    const event = value.event;
    if (event.source !== source || typeof event.eventName !== 'string' || !events.includes(event.eventName) ||
        !['started', 'succeeded', 'failed', 'cancelled', 'observed'].includes(String(event.outcome)) ||
        event.errorCode !== undefined && typeof event.errorCode !== 'string' || event.durationMs !== undefined && !scalar(event.durationMs))
        throw new TypeError('HARNESS_DIAGNOSTICS_INVALID');
    const fields = event.fields === undefined ? undefined : decodeFields(event.fields);
    return { source, eventName: event.eventName, outcome: event.outcome,
        ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
        ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }), ...(fields === undefined ? {} : { fields }) };
}
function decodeFields(value) {
    if (!object(value) || !keys(value, [], ['attempt', 'exitCode', 'signalObserved']) ||
        value.attempt !== undefined && !scalar(value.attempt) || value.exitCode !== undefined &&
        (typeof value.exitCode !== 'number' || !Number.isSafeInteger(value.exitCode)) ||
        value.signalObserved !== undefined && typeof value.signalObserved !== 'boolean')
        throw new TypeError('HARNESS_DIAGNOSTICS_INVALID');
    return { ...(value.attempt === undefined ? {} : { attempt: value.attempt }),
        ...(value.exitCode === undefined ? {} : { exitCode: value.exitCode }),
        ...(value.signalObserved === undefined ? {} : { signalObserved: value.signalObserved }) };
}
/** Create a bounded adapter over existing app-owned diagnostics.
 * @param deps Trusted metadata, current account and private native transport.
 * @returns A process-owned collector whose pending work is discarded on account revocation.
 */
export function createSupportDiagnostics(deps) {
    let owner;
    let disposed = false;
    let epoch = 0;
    let pending = Promise.resolve();
    const queue = [];
    const confirmed = new Set();
    const overflow = new Set();
    const coverage = new Map();
    const clear = () => { epoch++; owner = deps.readScope(); queue.length = 0; confirmed.clear(); overflow.clear(); coverage.clear(); };
    const current = () => { const actual = deps.readScope(); if (!same(owner, actual))
        clear(); return actual; };
    const record = (event) => {
        const scope = current();
        if (disposed || !scope)
            return;
        try {
            const errorCode = event.errorCode === undefined ? null
                : /^(?:AUTH|NATIVE|LOG|SUPPORT|HARNESS|HOST|UPDATE|STUDYBUDDY)_[A-Z0-9_]{1,100}$/u.test(event.errorCode)
                    ? event.errorCode : 'HARNESS_OPERATION_FAILED';
            const row = parseClientLogEvent({ schemaVersion: 1, ...deps.metadata,
                occurredAt: (deps.now?.() ?? new Date()).toISOString(),
                level: event.outcome === 'failed' ? 'error' : 'info', eventName: event.eventName, component: event.source,
                operationId: null, requestId: null, routeId: null, outcome: event.outcome, errorCode, durationMs: event.durationMs ?? null,
                fields: { ...event.fields } });
            const hash = createHash('sha256').update(JSON.stringify(row)).digest('hex');
            if (confirmed.has(hash) || queue.some(item => item.hash === hash))
                return;
            if (queue.length >= 256 || confirmed.size >= 250000) {
                overflow.add(event.source);
                coverage.set(event.source, 'failed');
                return;
            }
            queue.push({ scope: { ...scope }, source: event.source, row, hash });
        }
        catch (_error) { // Invalid operational metadata must not stop the user's original operation.
            coverage.set(event.source, 'failed');
        }
    };
    return {
        record,
        async collect() {
            const scope = current();
            const generation = epoch;
            if (disposed || !scope)
                return;
            for (const source of HARNESS_DIAGNOSTIC_SOURCES) {
                const reader = deps.readers?.[source];
                if (!reader)
                    continue;
                try {
                    const values = await reader();
                    if (disposed || generation !== epoch || !same(scope, current()))
                        return;
                    if (values.length > 256)
                        throw new TypeError('HARNESS_DIAGNOSTICS_LIMIT');
                    const accepted = values.map(value => attributed(value, scope, source));
                    accepted.forEach(record);
                }
                catch (_error) { // Failed or unattributed sources remain explicit; no raw report is imported.
                    if (!disposed && generation === epoch && same(scope, current()))
                        coverage.set(source, 'failed');
                }
            }
        },
        flush() {
            current();
            const generation = epoch;
            const work = async () => {
                if (disposed || generation !== epoch)
                    return;
                for (const source of HARNESS_DIAGNOSTIC_SOURCES) {
                    const scope = current();
                    if (!scope || disposed || generation !== epoch)
                        return;
                    const items = queue.filter(item => item.source === source && same(item.scope, scope));
                    if (!items.length)
                        continue;
                    items.forEach((item) => { const index = queue.indexOf(item); if (index >= 0)
                        queue.splice(index, 1); });
                    try {
                        const result = await deps.transport(scope, { source, events: items.map(item => item.row) });
                        if (disposed || generation !== epoch || !same(scope, current()))
                            return;
                        if (result.recorded + result.duplicates !== items.length)
                            throw new TypeError('HARNESS_DIAGNOSTICS_INVALID');
                        items.forEach(item => confirmed.add(item.hash));
                        coverage.set(source, overflow.has(source) ? 'failed' : 'present');
                    }
                    catch (_error) { // Keep the same rows for an explicit later flush; native deduplication handles a lost receipt.
                        if (!disposed && generation === epoch && same(scope, current())) {
                            coverage.set(source, 'failed');
                            queue.unshift(...items.slice(0, Math.max(0, 256 - queue.length)));
                        }
                    }
                }
            };
            pending = pending.then(work, work);
            return pending;
        },
        coverage() { current(); return HARNESS_DIAGNOSTIC_SOURCES.map(source => ({ source, state: coverage.get(source) ?? 'unavailable' })); },
        revoke: clear,
        dispose() { disposed = true; clear(); },
    };
}
//# sourceMappingURL=support-diagnostics.js.map