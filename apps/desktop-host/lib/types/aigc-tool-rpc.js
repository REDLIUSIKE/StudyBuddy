/** Private Host-to-Main domain calls retain native actor identity and never retry uncertain work. */
import { randomUUID } from 'node:crypto';
import { parseHarnessAigcContextV1, parseHarnessAigcToolInvocationV1 } from '@studybuddy/contracts';
export class AigcToolRpc {
    options;
    pending = new Map();
    constructor(options) {
        this.options = options;
    }
    async send(value) { await this.options.send(value); }
    invoke(context, callerSessionId, operation, toolCallId, input, signal) {
        signal.throwIfAborted();
        if (!this.options.current(context) || this.pending.size >= 128)
            return Promise.reject(Error('AIGC_SCOPE_REVOKED'));
        const wire = parseHarnessAigcContextV1({ scope: context.scope, hostGeneration: context.hostGeneration, projectId: context.projectId,
            workspaceId: context.workspaceId, sessionId: context.sessionId, lease: context.lease });
        const request = parseHarnessAigcToolInvocationV1({ schemaVersion: 1, rpcId: randomUUID(), context: wire, callerSessionId, toolCallId, operation, input });
        return new Promise((resolve, reject) => {
            const abort = () => {
                if (!this.pending.delete(request.rpcId))
                    return;
                signal.removeEventListener('abort', abort);
                reject(Error('AIGC_OPERATION_CANCELLED'));
                void this.send({ type: 'aigc-tool-cancel', rpcId: request.rpcId, context: wire }).catch(() => { });
            };
            this.pending.set(request.rpcId, { context: wire, resolve, reject, detach: () => { signal.removeEventListener('abort', abort); } });
            signal.addEventListener('abort', abort, { once: true });
            void this.send({ type: 'aigc-tool-request', request }).catch(() => {
                const pending = this.pending.get(request.rpcId);
                if (!pending)
                    return;
                this.pending.delete(request.rpcId);
                pending.detach();
                reject(Error('AIGC_DOMAIN_UNAVAILABLE'));
            });
        });
    }
    result(value) {
        if (!value || typeof value !== 'object' || !('rpcId' in value) || typeof value.rpcId !== 'string')
            return;
        const row = this.pending.get(value.rpcId);
        if (!row)
            return;
        this.pending.delete(value.rpcId);
        row.detach();
        if (!this.options.current(row.context)) {
            row.reject(Error('AIGC_SCOPE_REVOKED'));
            return;
        }
        if ('error' in value)
            row.reject(Error(typeof value.error === 'string' && /^[A-Z0-9_]{1,128}$/.test(value.error) ? value.error : 'AIGC_DOMAIN_OPERATION_FAILED'));
        else if ('data' in value)
            row.resolve(value.data);
        else
            row.reject(Error('AIGC_DOMAIN_RESPONSE_INVALID'));
    }
    revoke(projectId) {
        for (const [rpcId, row] of this.pending) {
            if (projectId !== undefined && row.context.projectId !== projectId)
                continue;
            this.pending.delete(rpcId);
            row.detach();
            row.reject(Error('AIGC_SCOPE_REVOKED'));
            void this.send({ type: 'aigc-tool-cancel', rpcId, context: row.context }).catch(() => { });
        }
    }
}
//# sourceMappingURL=aigc-tool-rpc.js.map