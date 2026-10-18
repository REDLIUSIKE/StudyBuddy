/** React-free support workflow; the original main/native services own all durable results. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { randomUUID } from '@deepseek-ai/dsh-util-crypto';
const initial = (available, scope) => ({ scope, available, busy: false, previewBusy: false,
    preview: null, operation: { state: 'idle' }, screenshots: [], errorCode: null, copied: null, update: null, issueUnconfirmed: false });
const same = (a, b) => a?.accountId === b?.accountId && a?.generation === b?.generation;
const errorCode = (error) => error && typeof error === 'object' && 'code' in error &&
    typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/u.test(error.code) ? error.code : 'SUPPORT_REQUEST_FAILED';
/** Account-owned observable and command owner; closing its Settings presentation does not restart requests. */
export class SupportController {
    host;
    #state;
    #epoch = 0;
    #previewRevision = 0;
    #disposed = false;
    #detach;
    #range;
    #resetDraft;
    constructor(host) {
        this.host = host;
        this.#state = createSnapshotStore(initial(Boolean(host?.support), null));
    }
    getSnapshot = () => this.#state.getSnapshot();
    subscribe = (listener) => this.#state.subscribe(listener);
    #patch(value) { this.#state.set({ ...this.getSnapshot(), ...value }); }
    /** Bind the registration's declared view-store reset, not a second business store. */
    bindDraftReset(reset) { this.#resetDraft = reset; }
    /** Replace the account generation and clear every previous draft, selection and result. */
    setScope(scope) {
        if (same(this.getSnapshot().scope, scope))
            return;
        this.#epoch++;
        this.#previewRevision++;
        this.#detach?.();
        this.#detach = undefined;
        this.#range = undefined;
        this.#state.set(initial(Boolean(this.host?.support), scope));
        this.#resetDraft?.();
    }
    /** Explicit preview does not create a log upload or a problem report. */
    preview = async (range) => {
        if (!this.host?.support || !this.getSnapshot().scope || this.#disposed)
            return;
        const epoch = this.#epoch, revision = ++this.#previewRevision;
        this.#patch({ previewBusy: true, errorCode: null });
        try {
            const preview = await this.host.support.preview(range);
            if (epoch === this.#epoch && revision === this.#previewRevision)
                this.#patch({ preview, previewBusy: false });
        }
        catch (error) {
            if (epoch === this.#epoch && revision === this.#previewRevision)
                this.#patch({ previewBusy: false, errorCode: errorCode(error) });
        }
    };
    #id(range, issue) {
        const operation = this.getSnapshot().operation;
        if (!issue && operation.state === 'failed' && operation.flow === 'logs' && range === this.#range)
            return operation.requestId;
        // This id is opaque workflow correlation. Main still derives all authorization.
        return randomUUID();
    }
    async #run(range, input) {
        const api = this.host?.support;
        if (!api || !this.getSnapshot().scope || this.#disposed || this.getSnapshot().busy)
            return;
        if (this.getSnapshot().issueUnconfirmed)
            return;
        const epoch = this.#epoch, requestId = this.#id(range, Boolean(input));
        this.#range = range;
        this.#patch({ busy: true, copied: null, errorCode: null, operation: { state: 'running', requestId,
                flow: input ? 'issue' : 'logs', phase: 'preparing' } });
        try {
            this.#detach = api.subscribe(requestId, (event) => {
                if (epoch === this.#epoch)
                    this.#patch({ operation: event.operation });
            });
            const operation = input ? await api.submitIssue(requestId, { ...input,
                screenshotSelectionIds: this.getSnapshot().screenshots.map(row => row.selectionId) }) : await api.uploadLogs(requestId, range);
            if (epoch === this.#epoch)
                this.#patch({ operation, ...(input ? { screenshots: [],
                        issueUnconfirmed: operation.state === 'submission_unconfirmed' } : {}) });
        }
        catch (error) {
            if (epoch === this.#epoch)
                this.#patch({ errorCode: input ? 'SUPPORT_SUBMISSION_UNCONFIRMED' : errorCode(error),
                    ...(input ? { issueUnconfirmed: true } : {}) });
        }
        finally {
            if (epoch === this.#epoch) {
                this.#detach?.();
                this.#detach = undefined;
                this.#patch({ busy: false });
            }
        }
    }
    /** Upload selected logs only; a failed frozen native attempt keeps its workflow id. */
    uploadLogs = (range) => this.#run(range);
    /** Submit once; a report with an uncertain creation receipt is never automatically repeated. */
    submitIssue = (input) => this.#run(input.range, input);
    /** Select optional screenshots through Main's picker and the existing native registry. */
    selectScreenshots = async () => {
        if (!this.host?.support || this.getSnapshot().busy || !this.getSnapshot().scope || this.#disposed)
            return;
        const epoch = this.#epoch;
        try {
            const screenshots = await this.host.support.selectScreenshots();
            if (epoch === this.#epoch)
                this.#patch({ screenshots, errorCode: null });
        }
        catch (error) {
            if (epoch === this.#epoch)
                this.#patch({ errorCode: errorCode(error) });
        }
    };
    /** Copy only a server-confirmed reference from the current operation. */
    copyReference = async (reference) => {
        const operation = this.getSnapshot().operation, epoch = this.#epoch;
        const confirmed = operation.state !== 'idle' && 'log' in operation && operation.log.publicCode === reference ||
            operation.state === 'available' && operation.flow === 'issue' && operation.issue.publicCode === reference;
        if (!confirmed || this.#disposed)
            return;
        try {
            await navigator.clipboard.writeText(reference);
            if (epoch === this.#epoch)
                this.#patch({ copied: reference });
        }
        catch (_error) {
            if (epoch === this.#epoch)
                this.#patch({ copied: null, errorCode: 'SUPPORT_COPY_FAILED' });
        }
    };
    /** Reuse the existing StudyBuddy update check without opening an installer. */
    checkUpdates = async () => {
        if (!this.host || this.#disposed)
            return;
        const epoch = this.#epoch;
        try {
            const update = await this.host.checkUpdates();
            if (epoch === this.#epoch)
                this.#patch({ update: update.message });
        }
        catch (_error) {
            if (epoch === this.#epoch)
                this.#patch({ errorCode: 'SUPPORT_UPDATE_FAILED' });
        }
    };
    /** Plugin teardown removes subscriptions; it does not promise deletion of a remote upload. */
    dispose() {
        this.#disposed = true;
        this.#epoch++;
        this.#detach?.();
        this.#resetDraft = undefined;
        this.#state.set(initial(false, null));
    }
}
//# sourceMappingURL=support-controller.js.map