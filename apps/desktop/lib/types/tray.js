/** Windows system tray: the always-present way back to a hidden window and the explicit quit entry. */
import { Menu, nativeImage, Tray } from 'electron';
/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
    options;
    tray;
    /** @param options - Icon path, locale reader, and the open and quit actions. */
    constructor(options) {
        this.options = options;
        const tray = new Tray(nativeImage.createFromPath(options.iconPath));
        this.tray = tray;
        tray.on('click', () => { options.open(); });
        this.relabel();
    }
    /** Rebuild the tooltip and context menu in the current locale. */
    relabel() {
        const tray = this.tray;
        if (tray === undefined)
            return;
        const { messages } = this.options.locale();
        tray.setToolTip(messages.aboutProduct);
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: messages.openApplication, click: () => { this.options.open(); } },
            { type: 'separator' },
            { label: messages.quitApplication, click: () => { this.options.quit(); } },
        ]));
    }
    /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
    dispose() {
        const tray = this.tray;
        this.tray = undefined;
        tray?.destroy();
    }
}
//# sourceMappingURL=tray.js.map