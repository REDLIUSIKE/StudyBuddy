/** Mirrors the Web UI's theme source into Electron's native theme so native chrome and Platform login pages follow the app palette. */
/**
 * Watches `html[data-ds-theme-source]` and forwards each value to the main
 * process, which sets `nativeTheme.themeSource`. Native chrome and renderer
 * `prefers-color-scheme` queries on every platform then follow the app's
 * theme preference instead of the OS appearance while `system` keeps
 * following the OS; the macOS sidebar vibrancy material is one such consumer.
 * The main process reads the same value back as `shouldUseDarkColors` when a
 * Platform login link needs the resolved palette.
 */
export declare function syncNativeTheme(): void;
//# sourceMappingURL=preload-theme.d.ts.map