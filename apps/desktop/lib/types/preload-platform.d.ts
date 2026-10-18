/** Marks the document root with the host platform so shared Web UI CSS can scope desktop-only rules. */
/**
 * Sets `data-platform` (e.g. `darwin`) on `<html>`, deferring to DOMContentLoaded
 * when the preload runs before the document root exists.
 */
export declare function markDocumentPlatform(): void;
/**
 * Mirrors the window's macOS and Windows fullscreen state onto `<html data-fullscreen>` so
 * CSS drops the clearance for hidden native window controls. The main
 * process sends the state on every transition and after each load.
 */
export declare function syncWindowFullscreen(): void;
//# sourceMappingURL=preload-platform.d.ts.map