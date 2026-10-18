/** An origin-scoped product API with summary-only responses. */
import { contextBridge, ipcRenderer } from 'electron';
import { STUDYBUDDY_IPC } from "./types.js";
import { COMMUNITY_IPC } from "./community-types.js";
import { AIGC_IPC } from "./aigc-types.js";
import { RESEARCH_IPC } from "./research-types.js";
import { VIDEO_IPC } from "./video-types.js";
import { createSupportPreload } from "./support-preload.js";
export function exposeStudyBuddy() {
    if (location.protocol !== 'dsh-app:' || !process.isMainFrame
        || !(location.hostname === 'app' || (location.hostname === 'shell' && location.pathname === '/welcome.html')))
        return;
    const api = {
        status: () => ipcRenderer.invoke(STUDYBUDDY_IPC.status),
        start: () => ipcRenderer.invoke(STUDYBUDDY_IPC.start),
        cancel: () => ipcRenderer.invoke(STUDYBUDDY_IPC.cancel),
        logout: () => ipcRenderer.invoke(STUDYBUDDY_IPC.logout),
        checkUpdates: () => ipcRenderer.invoke(STUDYBUDDY_IPC.updates),
        subscribe(listener) {
            const handle = (_event, state) => { listener(state); };
            ipcRenderer.on(STUDYBUDDY_IPC.state, handle);
            return () => { ipcRenderer.off(STUDYBUDDY_IPC.state, handle); };
        },
    };
    if (location.hostname === 'app') {
        const unwrap = async (operation) => {
            const response = await operation;
            if (!response.ok)
                throw Object.assign(new Error(response.error.code), response.error);
            return response.data;
        };
        Object.assign(api, {
            capabilities: { completeOpen: (id) => unwrap(ipcRenderer.invoke('studybuddy:capability-open', id)), openProject: (id) => unwrap(ipcRenderer.invoke('studybuddy:capability-project-open', id)) },
            prompts: { invoke: (method, args) => unwrap(ipcRenderer.invoke('studybuddy:prompts', method, args)) },
            support: createSupportPreload(ipcRenderer),
            video: {
                available: () => unwrap(ipcRenderer.invoke(VIDEO_IPC.available)),
                acquire: () => unwrap(ipcRenderer.invoke(VIDEO_IPC.acquire)),
                release: (lease) => unwrap(ipcRenderer.invoke(VIDEO_IPC.release, lease)),
                setTheme: (lease, theme) => unwrap(ipcRenderer.invoke(VIDEO_IPC.theme, lease, theme)),
                setVisible: (lease, visible) => unwrap(ipcRenderer.invoke(VIDEO_IPC.visible, lease, visible)),
                acknowledgeReference: (id) => unwrap(ipcRenderer.invoke(VIDEO_IPC.acknowledgeReference, id)),
                subscribeInvalid: (listener) => { const handle = (_event, lease) => { if (typeof lease === 'string')
                    listener(lease); }; ipcRenderer.on(VIDEO_IPC.invalid, handle); return () => { ipcRenderer.off(VIDEO_IPC.invalid, handle); }; },
                subscribeAction: (listener) => { const handle = (_event, notice) => listener(notice); ipcRenderer.on(VIDEO_IPC.action, handle); return () => { ipcRenderer.off(VIDEO_IPC.action, handle); }; },
            },
            research: {
                acknowledgeIntent: (id) => unwrap(ipcRenderer.invoke(RESEARCH_IPC.acknowledgeIntent, id)),
                acquire: () => unwrap(ipcRenderer.invoke(RESEARCH_IPC.acquire)),
                release: (lease) => unwrap(ipcRenderer.invoke(RESEARCH_IPC.release, lease)),
                setTheme: (lease, theme) => unwrap(ipcRenderer.invoke(RESEARCH_IPC.theme, lease, theme)),
                setVisible: (lease, visible) => unwrap(ipcRenderer.invoke(RESEARCH_IPC.visible, lease, visible)),
                subscribeInvalid: (listener) => {
                    const handle = (_event, lease) => { if (typeof lease === 'string')
                        listener(lease); };
                    ipcRenderer.on(RESEARCH_IPC.invalid, handle);
                    return () => { ipcRenderer.off(RESEARCH_IPC.invalid, handle); };
                },
                subscribeAction: (listener) => {
                    const handle = (_event, notice) => listener(notice);
                    ipcRenderer.on(RESEARCH_IPC.action, handle);
                    return () => { ipcRenderer.off(RESEARCH_IPC.action, handle); };
                },
            },
            aigc: {
                subscribeAction: (listener) => { const handle = (_event, value) => listener(value); ipcRenderer.on(AIGC_IPC.action, handle); return () => { ipcRenderer.off(AIGC_IPC.action, handle); }; },
                interactionReady: (id, visible = true) => unwrap(ipcRenderer.invoke(AIGC_IPC.interactionReady, id, visible)),
                acquire: () => unwrap(ipcRenderer.invoke(AIGC_IPC.acquire)),
                release: (lease) => unwrap(ipcRenderer.invoke(AIGC_IPC.release, lease)),
                setTheme: (lease, theme) => unwrap(ipcRenderer.invoke(AIGC_IPC.theme, lease, theme)),
                setVisible: (lease, visible) => unwrap(ipcRenderer.invoke(AIGC_IPC.visible, lease, visible)),
                subscribeInvalid: (listener) => {
                    const handle = (_event, lease) => { if (typeof lease === 'string')
                        listener(lease); };
                    ipcRenderer.on(AIGC_IPC.invalid, handle);
                    return () => { ipcRenderer.off(AIGC_IPC.invalid, handle); };
                },
            },
            community: {
                acquire: (target) => unwrap(ipcRenderer.invoke(COMMUNITY_IPC.acquire, target)),
                release: (lease) => unwrap(ipcRenderer.invoke(COMMUNITY_IPC.release, lease)),
                setTheme: (lease, theme) => unwrap(ipcRenderer.invoke(COMMUNITY_IPC.theme, lease, theme)),
                setVisible: (lease, visible) => unwrap(ipcRenderer.invoke(COMMUNITY_IPC.visible, lease, visible)),
                subscribeInvalid: (listener) => {
                    const handle = (_event, lease) => { if (typeof lease === 'string')
                        listener(lease); };
                    ipcRenderer.on(COMMUNITY_IPC.invalid, handle);
                    return () => { ipcRenderer.off(COMMUNITY_IPC.invalid, handle); };
                },
                subscribeNavigation: (listener) => {
                    const handle = (_event, notice) => listener(notice);
                    ipcRenderer.on(COMMUNITY_IPC.navigation, handle);
                    return () => { ipcRenderer.off(COMMUNITY_IPC.navigation, handle); };
                },
            },
            business: { invoke: (method, args) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.business, method, args)) },
            embedded: {
                acquire: (target) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedAcquire, target)),
                release: (lease) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedRelease, lease)),
                setTheme: (lease, theme) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedTheme, lease, theme)),
                subscribeInvalid: (listener) => {
                    const handle = (_event, lease) => { if (typeof lease === 'string')
                        listener(lease); };
                    ipcRenderer.on(STUDYBUDDY_IPC.embeddedInvalid, handle);
                    return () => { ipcRenderer.off(STUDYBUDDY_IPC.embeddedInvalid, handle); };
                },
            },
            tools: {
                acquire: (target) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsAcquire, target)),
                resize: (lease, bounds) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsResize, lease, bounds)),
                setVisible: (lease, visible) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsVisible, lease, visible)),
                setTheme: (lease, theme) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsTheme, lease, theme)),
                release: (lease) => unwrap(ipcRenderer.invoke(STUDYBUDDY_IPC.toolsRelease, lease)),
                subscribeInvalid: (listener) => {
                    const callback = (_event, lease) => listener(lease);
                    ipcRenderer.on(STUDYBUDDY_IPC.toolsInvalid, callback);
                    return () => { ipcRenderer.off(STUDYBUDDY_IPC.toolsInvalid, callback); };
                },
            },
            subscribeNavigation: (listener) => {
                const callback = (_event, notice) => listener(notice);
                ipcRenderer.on(STUDYBUDDY_IPC.toolNavigation, callback);
                return () => { ipcRenderer.off(STUDYBUDDY_IPC.toolNavigation, callback); };
            },
        });
    }
    contextBridge.exposeInMainWorld('studybuddy', api);
}
//# sourceMappingURL=preload.js.map