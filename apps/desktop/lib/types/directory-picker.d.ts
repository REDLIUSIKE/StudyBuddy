/** Window-owned workspace directory dialogs for the local Desktop renderer. */
import { type BrowserWindow } from 'electron';
/**
 * Install the application-lifetime directory picker IPC handler.
 * @param getWindow - Current local application window; shell pages and subframes cannot open dialogs.
 */
export declare function installDesktopDirectoryPicker(getWindow: () => BrowserWindow | undefined): void;
//# sourceMappingURL=directory-picker.d.ts.map