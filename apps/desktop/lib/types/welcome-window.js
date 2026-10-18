/** Native welcome window and its presentation-only renderer. */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { WELCOME_IPC } from "./welcome-api.js";
/**
 * Resolve the fixed-size welcome window's native material and controls.
 * @param platform - operating system hosting Electron.
 * @param locale - shell-owned localized copy.
 * @returns sandboxed window options with a locale-only preload.
 */
export function welcomeWindowOptions(platform, locale) {
    return {
        width: 600,
        height: 700,
        useContentSize: true,
        center: true,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        title: locale.messages.welcomeTitle,
        backgroundColor: platform === 'darwin' || platform === 'win32' ? '#00000000' : '#FFFFFF',
        ...(platform === 'darwin' ? {
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: 21, y: 21 },
            vibrancy: 'menu',
            visualEffectState: 'active',
        } : {}),
        ...(platform === 'win32' ? {
            titleBarStyle: 'hidden',
            titleBarOverlay: { color: '#00000000', symbolColor: '#0F1115', height: 42 },
            backgroundMaterial: 'acrylic',
        } : {}),
        webPreferences: {
            preload: fileURLToPath(new URL('./preload-welcome.cjs', import.meta.url)),
            additionalArguments: [`--dsh-welcome-locale=${locale.id}`],
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
    };
}
let disposeActiveHandlers;
/**
 * Open the process's sole welcome window with desktop-owned operations.
 * Replaces IPC ownership immediately; the caller closes the previous native window.
 * @param locale - shell-owned localized copy.
 * @param operations - credential write and this-launch-only skip actions.
 * @returns the visible window; a failed load destroys it before rejecting.
 */
export async function openWelcomeWindow(locale, operations) {
    const options = welcomeWindowOptions(process.platform, locale);
    const window = new BrowserWindow(options);
    disposeActiveHandlers?.();
    let active = true;
    const disposeHandlers = () => {
        if (!active)
            return;
        active = false;
        for (const channel of [
            WELCOME_IPC.analyticsEnabled, WELCOME_IPC.analytics, WELCOME_IPC.takeNotice, WELCOME_IPC.saveApiKey,
            WELCOME_IPC.skip, WELCOME_IPC.start, WELCOME_IPC.cancel, WELCOME_IPC.copyLink,
        ]) {
            ipcMain.removeHandler(channel);
        }
        disposeActiveHandlers = undefined;
    };
    disposeActiveHandlers = disposeHandlers;
    const assertSender = (event) => {
        if (!active || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
            throw new Error('desktop welcome: rejected action from an unowned frame');
        }
    };
    ipcMain.handle(WELCOME_IPC.analyticsEnabled, (event) => {
        assertSender(event);
        return operations.analyticsEnabled();
    });
    ipcMain.handle(WELCOME_IPC.analytics, async (event, eventName, attributes) => {
        assertSender(event);
        if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes))
            throw new Error('desktop welcome: invalid analytics attributes');
        if (eventName === 'auth_page_click' && 'button_name' in attributes && Object.keys(attributes).length === 1
            && (attributes.button_name === 'sign_in' || attributes.button_name === 'api-key')) {
            await operations.analytics?.(eventName, { button_name: attributes.button_name });
        }
        else if ((eventName === 'auth_page_view' || eventName === 'api_key_save_click') && Object.keys(attributes).length === 0) {
            await operations.analytics?.(eventName, {});
        }
        else
            throw new Error('desktop welcome: invalid analytics event');
    });
    ipcMain.handle(WELCOME_IPC.takeNotice, async (event) => { assertSender(event); return operations.takeNotice(); });
    ipcMain.handle(WELCOME_IPC.saveApiKey, async (event, value) => {
        assertSender(event);
        if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value))
            return { ok: false };
        return operations.saveApiKey(value);
    });
    ipcMain.handle(WELCOME_IPC.skip, async (event) => {
        assertSender(event);
        await operations.skip();
    });
    ipcMain.handle(WELCOME_IPC.start, async (event) => { assertSender(event); return operations.startSignIn(); });
    ipcMain.handle(WELCOME_IPC.cancel, async (event, id) => {
        assertSender(event);
        if (typeof id !== 'string')
            throw new Error('desktop welcome: invalid attempt');
        return operations.cancelSignIn(id);
    });
    ipcMain.handle(WELCOME_IPC.copyLink, async (event, id) => {
        assertSender(event);
        if (typeof id !== 'string')
            throw new Error('desktop welcome: invalid attempt');
        return operations.copySignInLink(id);
    });
    window.once('closed', disposeHandlers);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => { event.preventDefault(); });
    try {
        await window.loadFile(join(app.getAppPath(), 'renderer', 'welcome.html'));
    }
    catch (error) {
        disposeHandlers();
        if (!window.isDestroyed())
            window.destroy();
        throw error;
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Another window can replace ownership during loadFile.
    if (active && !window.isDestroyed()) {
        window.show();
        void operations.analytics?.('auth_page_view', {});
    }
    return window;
}
//# sourceMappingURL=welcome-window.js.map