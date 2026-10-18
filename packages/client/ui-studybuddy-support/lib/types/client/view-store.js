/** Remount-surviving form drafts; authoritative results stay in SupportController. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/** Declare support form fields and their complete mutation API. @returns One registration store definition. */
export function createSupportViewStore() {
    return defineStore({
        init: () => ({ mode: 'logs', range: 'last_24_hours', title: '', description: '' }),
        actions: {
            setMode: (d, mode) => { d.mode = mode; },
            setRange: (d, range) => { d.range = range; },
            setTitle: (d, title) => { d.title = title; },
            setDescription: (d, description) => { d.description = description; },
            reset: (d) => { Object.assign(d, { mode: 'logs', range: 'last_24_hours', title: '', description: '' }); },
        },
    });
}
//# sourceMappingURL=view-store.js.map