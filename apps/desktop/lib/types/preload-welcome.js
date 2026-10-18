/** Localized welcome copy and write-only credential actions. */
import { contextBridge, ipcRenderer } from 'electron';
import { exposeStudyBuddy } from "./studybuddy/preload.js";
exposeStudyBuddy();
import { resolveDesktopLocale } from "./locale.js";
import { WELCOME_IPC } from "./welcome-api.js";
const prefix = '--dsh-welcome-locale=';
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
if (locale === undefined)
    throw new Error('desktop welcome: missing window locale');
const api = {
    ...resolveDesktopLocale(locale),
    analytics: async (eventName, attributes) => {
        if (await api.analyticsEnabled())
            await ipcRenderer.invoke(WELCOME_IPC.analytics, eventName, attributes);
    },
    analyticsEnabled: () => ipcRenderer.invoke(WELCOME_IPC.analyticsEnabled),
    takeNotice: () => ipcRenderer.invoke(WELCOME_IPC.takeNotice),
    startSignIn: () => ipcRenderer.invoke(WELCOME_IPC.start),
    cancelSignIn: (id) => ipcRenderer.invoke(WELCOME_IPC.cancel, id),
    copySignInLink: (id) => ipcRenderer.invoke(WELCOME_IPC.copyLink, id),
    onAccountState: (listener) => {
        const receive = (_event, state) => { listener(state); };
        ipcRenderer.on(WELCOME_IPC.state, receive);
        return () => { ipcRenderer.removeListener(WELCOME_IPC.state, receive); };
    },
    saveApiKey: (value) => ipcRenderer.invoke(WELCOME_IPC.saveApiKey, value),
    skip: () => ipcRenderer.invoke(WELCOME_IPC.skip),
};
contextBridge.exposeInMainWorld('dshWelcome', api);
//# sourceMappingURL=preload-welcome.js.map