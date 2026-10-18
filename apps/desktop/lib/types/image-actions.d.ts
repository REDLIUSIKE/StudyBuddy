/** Native image context menu. Pixels stay in Chromium; exports follow the native download chooser. */
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import type { DesktopImageTarget } from '@deepseek-ai/dsh-client-ui-tool';
import type { DesktopMessages } from './locale.ts';
export interface ImageActionHost {
    window(): BrowserWindow | undefined;
    scope(): string;
    messages(): DesktopMessages;
    verify(owner: BrowserWindow, target: DesktopImageTarget): Promise<boolean>;
    popup(owner: BrowserWindow, template: MenuItemConstructorOptions[]): void;
    reveal(path: string): void;
    fileExists(path: string): boolean;
    downloadsDirectory(): string;
}
/** Bounded, process-local knowledge of explicitly downloaded images. */
export declare class DesktopImageActions {
    private readonly host;
    private disposed;
    private readonly exports;
    private readonly pending;
    private readonly sessions;
    constructor(host: ImageActionHost);
    /** Open exactly five actions for a currently decoded image in the owned main document. */
    open(value: unknown): Promise<void>;
    private readonly download;
    private observeDownloads;
    private key;
    private isTarget;
    dispose(): void;
}
/** Recheck the actual pointer target before showing a menu and before native actions. */
export declare function verifyImageTarget(owner: BrowserWindow, target: DesktopImageTarget): Promise<boolean>;
//# sourceMappingURL=image-actions.d.ts.map