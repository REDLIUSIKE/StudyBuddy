import type { ReactNode } from 'react';
import type { DockIntents } from '../contract/adapter.ts';
import type { LayoutState, TabRecord } from '../contract/types.ts';
import type { SizePreview } from './PaneTree.tsx';
import type { PaneCallbacks } from './render.ts';
/** Host policy for lazily retaining a tab body without reparenting it. */
export interface TabRetention {
    /** Whether a visited body survives hiding; omitted means visibility-mounted. */
    readonly keepMounted?: (tab: TabRecord) => boolean;
    /** Whether this layout's Session is on screen; defaults to true. */
    readonly active?: boolean;
}
interface LayoutProps extends TabRetention {
    readonly state: LayoutState;
    readonly callbacks: PaneCallbacks;
    readonly preview: SizePreview | undefined;
    readonly intents: DockIntents;
}
/**
 * One or two horizontal panes; CSS resolves content sizes from track fractions.
 * @param props - committed layout, gesture preview and body retention policy.
 * @returns stable tab containers, including floating tabs.
 * @throws if the docked tree is not one pane or two horizontal panes.
 */
export declare function TabLayout(props: LayoutProps): ReactNode;
export {};
//# sourceMappingURL=TabLayout.d.ts.map