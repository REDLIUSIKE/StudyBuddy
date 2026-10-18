import { changesSummaryUrl, isChangesSummary } from "../changes.js";
import { HostReadStore } from "./host-read-store.js";
/** One browser plugin's summary reads; a summary or a missing answer is kept until the connection is replaced. */
export class ChangesSummaryStore extends HostReadStore {
    constructor() {
        super({
            loading: 'loading',
            failed: 'missing',
            retryable: () => false,
            decode: async (response) => {
                if (!response.ok)
                    return 'missing';
                const value = await response.json();
                return isChangesSummary(value) ? value : 'missing';
            },
        });
    }
    /**
     * Read one summary once; a later read of the same coordinates returns the cached state.
     * @param sessionId - viewed Session.
     * @param seq - the announcing event's sequence.
     * @returns after the state is published.
     */
    load(sessionId, seq) {
        return this.loadUrl(changesSummaryUrl(sessionId, seq));
    }
}
//# sourceMappingURL=changes-summary.js.map