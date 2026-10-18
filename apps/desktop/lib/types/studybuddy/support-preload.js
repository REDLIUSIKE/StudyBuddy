/** Renderer gets closed actions and validated progress, never private diagnostic or file methods. */
import { parseHarnessSupportEvent, parseHarnessSupportPreviewReceipt, parseHarnessSupportResult, parseSupportRequestId } from '@studybuddy/contracts';
import { SUPPORT_IPC } from "./support-ipc.js";
/** Assemble the app-only preload API; the caller enforces origin and main-frame exposure.
 * @param transport Electron's restricted IPC carrier.
 * @returns Support actions with no owner, token, path or arbitrary operation selector.
 */
export function createSupportPreload(transport) {
    const unwrap = async (channel, ...args) => {
        const response = await transport.invoke(channel, ...args);
        if (!response || typeof response !== 'object' || !('ok' in response))
            throw new Error('HARNESS_SUPPORT_INVALID');
        if (response.ok !== true) {
            const error = 'error' in response ? response.error : undefined;
            const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' &&
                /^[A-Z][A-Z0-9_]{0,127}$/u.test(error.code) ? error.code : 'HARNESS_SUPPORT_INVALID';
            throw Object.assign(new Error(code), { code });
        }
        if (!('data' in response))
            throw new Error('HARNESS_SUPPORT_INVALID');
        return response.data;
    };
    return {
        preview: async (range) => parseHarnessSupportPreviewReceipt(await unwrap(SUPPORT_IPC.preview, range)),
        uploadLogs: async (id, range) => parseHarnessSupportResult('uploadSupportLogs', await unwrap(SUPPORT_IPC.upload, id, range)),
        selectScreenshots: async () => parseHarnessSupportResult('stageSupportScreenshots', await unwrap(SUPPORT_IPC.screenshots)),
        submitIssue: async (id, input) => parseHarnessSupportResult('submitSupportIssue', await unwrap(SUPPORT_IPC.report, id, input)),
        getOperation: async (id) => parseHarnessSupportResult('getSupportOperation', await unwrap(SUPPORT_IPC.operation, id)),
        readPreviousExit: async () => parseHarnessSupportResult('readSupportPreviousExit', await unwrap(SUPPORT_IPC.exit)),
        subscribe(id, listener) {
            parseSupportRequestId(id);
            let active = true;
            const handle = (_event, value) => {
                if (!active)
                    return;
                try {
                    const event = parseHarnessSupportEvent(value);
                    if (event.requestId === id)
                        listener(event);
                }
                catch (_error) { /* Malformed or stale progress cannot promote a result; the unary reply still owns completion. */ }
            };
            transport.on(SUPPORT_IPC.progress, handle);
            void unwrap(SUPPORT_IPC.subscribe, id).catch((_error) => { });
            return () => {
                active = false;
                transport.off(SUPPORT_IPC.progress, handle);
                void unwrap(SUPPORT_IPC.unsubscribe, id).catch((_error) => {
                    /* Account revocation already removed the main subscription. */
                });
            };
        },
    };
}
//# sourceMappingURL=support-preload.js.map