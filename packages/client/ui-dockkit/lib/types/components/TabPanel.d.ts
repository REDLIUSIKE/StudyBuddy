import type { ReactNode } from 'react';
import type { LayoutState, PaneNode } from '../contract/types.ts';
import type { PaneCallbacks } from './render.ts';
/** A pane and the live layout it reads its tabs from. */
export interface TabPanelProps {
    readonly state: LayoutState;
    readonly pane: PaneNode;
    readonly callbacks: PaneCallbacks;
}
/** @param props - pane state and gestures. @returns its tab strip without a content container. */
export declare function TabStrip({ state, pane, callbacks }: TabPanelProps): ReactNode;
/** @param props - target pane and drag preview. @returns body-local drop feedback, or nothing. */
export declare function PaneDropHints({ pane, callbacks }: Pick<TabPanelProps, 'pane' | 'callbacks'>): ReactNode;
/** @param props - pane state and gestures. @returns one pane in the recursive, visibility-mounted layout. */
export declare function TabPanel({ state, pane, callbacks }: TabPanelProps): ReactNode;
//# sourceMappingURL=TabPanel.d.ts.map