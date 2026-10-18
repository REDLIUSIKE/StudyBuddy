/** Shared settings viewing state for its mouse and command entry points. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Declare the settings dialog state and its complete mutation API.
 * @returns one root-scoped store handle for the settings shell.
 */
export function createSettingsShellStore() {
    return defineStore({
        init: () => ({ open: false, activeId: undefined }),
        actions: {
            open: (d) => { d.open = true; },
            close: (d) => { d.open = false; d.activeId = undefined; },
            select: (d, id) => { d.activeId = id; },
            openSection: (d, id) => { d.activeId = id; d.open = true; },
        },
    });
}
//# sourceMappingURL=shell-store.js.map