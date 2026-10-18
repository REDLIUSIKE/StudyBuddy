/** Localized update preparation failures with separately displayed diagnostics. */
import type { DesktopUpdatePreparationFailureKind } from './ipc.ts';
/** Only explicitly safe main-process facts may be exposed as technical details. */
export declare class DesktopUpdatePreparationError extends Error {
    readonly kind: DesktopUpdatePreparationFailureKind;
    readonly technicalDetails?: string | undefined;
    /**
     * @param kind - Stable preparation cause shared by native and Web presentations.
     * @param message - Locale-owned recovery guidance.
     * @param technicalDetails - Main-owned facts, excluding raw subprocess output and credentials.
     */
    constructor(kind: DesktopUpdatePreparationFailureKind, message: string, technicalDetails?: string | undefined);
}
//# sourceMappingURL=update-error.d.ts.map