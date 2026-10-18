/** Resolved shell preferences; absent fields use the defaults without rewriting existing files. */
export interface DesktopSettings {
    readonly updates: {
        readonly allowTestAuthPopupWindow: boolean;
    };
}
/**
 * Read shell settings, creating the default document exclusively when missing.
 * @param userData - Electron's userData directory, independent of DSH_HOME.
 * @returns Validated settings, or defaults when reading, creating or validating fails; changes require a restart.
 */
export declare function readDesktopSettings(userData: string): DesktopSettings;
//# sourceMappingURL=settings.d.ts.map