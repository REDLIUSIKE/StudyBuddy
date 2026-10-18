import type { RowToastProps } from '../contract/slots.ts';
/**
 * Render an operation notice, retaining recovery actions for six seconds.
 * @param props - notice and viewing sources, dismissal and recovery callbacks, and localized copy.
 * @returns the notice on display, or null.
 */
export declare function RowActionToast({ useToast, useStore, dismissToast, undoArchive, showArchived, openForkSource, t }: RowToastProps): import("react").JSX.Element | null;
//# sourceMappingURL=RowActionToast.d.ts.map