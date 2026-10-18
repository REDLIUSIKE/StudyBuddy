/**
 * One native Platform view for the whole account feature. The Account settings
 * page, the frame-wide quota notice, and the desktop onboarding recharge step
 * request a page here instead of mounting their own container, because the
 * Desktop host owns a single WebContentsView and its `open` destroys whatever
 * was showing before.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/**
 * Create the plugin-scoped request channel shared by the account surfaces and
 * the one host that renders their pages. The snapshot store supplies the
 * observable and isolates a throwing subscriber from the rest.
 * @returns the request channel.
 */
export function createPlatformPages() {
    const store = createSnapshotStore(null);
    let owner;
    let token = null;
    return {
        getSnapshot: () => store.getSnapshot(),
        subscribe: listener => store.subscribe(listener),
        open(page, onClose) {
            const previous = owner;
            const own = {};
            token = own;
            owner = onClose;
            store.set({ page });
            // The newer request is already installed, so the retired owner's release
            // cannot clear it.
            previous?.('superseded');
            return () => {
                if (token !== own)
                    return;
                token = null;
                owner = undefined;
                store.set(null);
            };
        },
        close() {
            if (store.getSnapshot() === null)
                return;
            const retiring = owner;
            token = null;
            owner = undefined;
            store.set(null);
            retiring?.('returned');
        },
        dispose() {
            token = null;
            owner = undefined;
            if (store.getSnapshot() === null)
                return;
            store.set(null);
        },
    };
}
//# sourceMappingURL=platform-pages.js.map