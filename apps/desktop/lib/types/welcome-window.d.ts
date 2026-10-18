import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import type { DesktopLocale } from './locale.ts';
import { type WelcomeOperations } from './welcome-api.ts';
/**
 * Resolve the fixed-size welcome window's native material and controls.
 * @param platform - operating system hosting Electron.
 * @param locale - shell-owned localized copy.
 * @returns sandboxed window options with a locale-only preload.
 */
export declare function welcomeWindowOptions(platform: NodeJS.Platform, locale: DesktopLocale): BrowserWindowConstructorOptions;
/**
 * Open the process's sole welcome window with desktop-owned operations.
 * Replaces IPC ownership immediately; the caller closes the previous native window.
 * @param locale - shell-owned localized copy.
 * @param operations - credential write and this-launch-only skip actions.
 * @returns the visible window; a failed load destroys it before rejecting.
 */
export declare function openWelcomeWindow(locale: DesktopLocale, operations: WelcomeOperations): Promise<BrowserWindow>;
//# sourceMappingURL=welcome-window.d.ts.map