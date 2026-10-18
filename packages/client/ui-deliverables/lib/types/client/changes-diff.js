import { changesDiffUrl, isChangesDiff } from "../changes.js";
import { HostReadStore } from "./host-read-store.js";
/** One browser plugin's comparison reads; a failed read is the one state a later request replaces. */
export class ChangesDiffStore extends HostReadStore {
    constructor() {
        super({
            loading: 'loading',
            failed: 'error',
            retryable: state => state === 'error',
            decode: async (response) => {
                if (response.status === 404)
                    return 'missing';
                if (!response.ok)
                    return 'error';
                const value = await response.json();
                return isChangesDiff(value) ? value : 'error';
            },
        });
    }
    /**
     * Read one comparison; a cached comparison or a missing one is kept, a failed one is read again.
     * @param sessionId - viewed Session.
     * @param seq - the announcing event's sequence.
     * @param index - the file's index in the summary.
     * @returns after the state is published.
     */
    load(sessionId, seq, index) {
        return this.loadUrl(changesDiffUrl(sessionId, seq, index));
    }
}
//# sourceMappingURL=changes-diff.js.map