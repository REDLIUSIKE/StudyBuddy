/** Native command-management dialogs; only fixed installation locations reach the worker. */
import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import type { DesktopMessages } from './locale.ts';
import type { UpdateDialogOptions } from './update-dialog.ts';
/** Data required to render one command-management decision. */
export interface CommandPresentation {
    readonly managed: boolean;
    readonly available: boolean;
    readonly destination: string;
    readonly activeCommand?: string;
    readonly target?: string;
    readonly selectionUnknown?: boolean;
}
/** Shell-owned access to installed resources, locale and native dialogs. */
export interface CommandManagerOptions {
    readonly resources: string;
    readonly isPackaged: boolean;
    readonly isInstalledLocation: () => boolean;
    readonly isInstalling: () => boolean;
    readonly isQuitting: () => boolean;
    readonly messages: () => DesktopMessages;
    readonly show: (options: UpdateDialogOptions) => Promise<MessageBoxReturnValue>;
}
/**
 * Describe installation state using Desktop-owned copy.
 * @param state - Observed link or PATH selection.
 * @param messages - Current Desktop locale.
 * @param platform - Command lookup semantics of the host operating system.
 * @returns Native dialog with stable Close/Repair/Remove or Install/Cancel indices.
 */
export declare function presentCommandManagement(state: CommandPresentation, messages: DesktopMessages, platform: NodeJS.Platform): MessageBoxOptions;
/** One visible operation; updater preparation waits for its started worker to finish. */
export declare class DesktopCommandManager {
    private readonly options;
    private operation;
    /** @param options - Installed resources and shell-owned UI callbacks. */
    constructor(options: CommandManagerOptions);
    /** Open or join the command-management operation. */
    show(): Promise<void>;
    /** Wait for a command operation already started by the user. */
    idle(): Promise<void>;
    private worker;
    private inspect;
    private run;
}
//# sourceMappingURL=command-management.d.ts.map