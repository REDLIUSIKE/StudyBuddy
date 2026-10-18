/** Product-window preference IPC and native menu interception during physical-key dispatch/recording. */
import { type BrowserWindow, type MenuItemConstructorOptions, type WebContents } from 'electron';
import type { ShortcutPlatform } from '@deepseek-ai/dsh-client-shortcuts/protocol';
import type { DesktopBrowserLeaseId } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types';
/**
 * Install application-owned configuration handlers and attach each product window's input lifecycle.
 * @param getWindow - current product window.
 * @param userData - Electron-resolved device preference directory.
 * @param platform - local device platform.
 * @param updateMenu - rebuild the application menu when the close accelerator or availability changes.
 * @param overlayInput - Current shell-owned input blocking state for the product window.
 * @returns menu construction, editor key delivery, window attachment, and teardown operations.
 */
export declare function installDesktopShortcuts(getWindow: () => BrowserWindow | undefined, userData: string, platform: ShortcutPlatform, updateMenu: () => void, overlayInput: (window: BrowserWindow) => {
    readonly revision: number;
    readonly blocked: boolean;
}): {
    fileMenu(labels: {
        fileMenu: string;
        closePage: string;
    }): MenuItemConstructorOptions;
    /**
     * Send a native Edit action to the editor without matching user shortcuts.
     * @param keyCode - edit key.
     * @param modifiers - edit modifiers.
     */
    sendEditingKey(keyCode: string, modifiers: Array<'control'>): void;
    attach(window: BrowserWindow): void;
    /**
     * Intercept an approved browser guest's keys until its lease ends.
     * @param window - owning product window.
     * @param guest - approved browser contents.
     * @param name - main-issued lease used as the webview element name.
     * @returns idempotent listener disposer.
     */
    attachGuest(window: BrowserWindow, guest: WebContents, name: DesktopBrowserLeaseId): () => void;
    dispose(): void;
};
//# sourceMappingURL=keyboard.d.ts.map