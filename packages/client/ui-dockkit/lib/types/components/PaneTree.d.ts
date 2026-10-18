import type { ReactNode } from 'react';
import type { LayoutState, NodeId, SplitId } from '../contract/types.ts';
import type { PaneCallbacks } from './render.ts';
/** Fractions a live divider drag is previewing for one split. */
export interface SizePreview {
    readonly splitId: SplitId;
    readonly sizes: readonly number[];
}
/** One subtree of the docked layout. */
export interface PaneTreeProps {
    readonly state: LayoutState;
    readonly nodeId: NodeId;
    readonly callbacks: PaneCallbacks;
    readonly preview: SizePreview | undefined;
}
/** Render a split or pane node and everything under it. */
export declare function PaneTree({ state, nodeId, callbacks, preview }: PaneTreeProps): ReactNode;
//# sourceMappingURL=PaneTree.d.ts.map