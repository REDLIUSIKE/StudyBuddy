import type { ReactNode } from 'react';
import type { DockLabels } from '../contract/adapter.ts';
/** What the menu offers, where it anchors, and how it closes. */
export interface TabMenuProps {
    readonly labels: DockLabels;
    /** The control that opened the menu; the menu hangs below its left edge. */
    readonly anchor: HTMLElement;
    /** Close the tab; `undefined` removes the kit's item, leaving the extras only. */
    readonly onClose: (() => void) | undefined;
    /** Dismiss without acting. */
    readonly onDismiss: () => void;
    /** Embedder items, rendered after the kit's own; absent means none. */
    readonly extras: ReactNode;
}
/** The actions menu body, anchored to the control that opened it. */
export declare function TabMenu({ labels, anchor, onClose, onDismiss, extras }: TabMenuProps): ReactNode;
//# sourceMappingURL=TabMenu.d.ts.map