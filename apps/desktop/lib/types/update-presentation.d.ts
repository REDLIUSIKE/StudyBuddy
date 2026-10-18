/** Semantic content for the Web-localized optional Desktop status indicator. */
import type { DesktopUpdatePresentation, DesktopUpdateState } from './ipc.ts';
import type { DesktopMessages } from './locale.ts';
/**
 * Select user-facing error copy independently of raw updater diagnostics.
 * @param state Update failure and its operation.
 * @param messages Selected shell locale.
 * @returns Localized summary suitable for both a dialog and a tooltip.
 */
export declare function desktopUpdateErrorSummary(state: DesktopUpdateState, messages: DesktopMessages): string;
/**
 * @param state - Main-process updater state.
 * @returns Semantic status without localized copy, diagnostics, or installation controls.
 */
export declare function presentDesktopUpdate(state: DesktopUpdateState): DesktopUpdatePresentation;
//# sourceMappingURL=update-presentation.d.ts.map