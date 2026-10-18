import type { ReactNode } from 'react';
import type { DockIntents, DockLabels, TabMenuExtras, TabRenderer } from '../contract/adapter.ts';
import type { LayoutState, PaneId, TabId } from '../contract/types.ts';
import type { HalvesFit } from '../engine/geometry.ts';
import { type TabRetention } from './TabLayout.tsx';
/** What the docked surface needs: the layout, its limits, and the outward contracts. */
export interface DockSurfaceProps {
    readonly state: LayoutState;
    /**
     * Whether another pane may still be created: the pane budget. Width is the
     * kit's own concern — a pane too narrow for two working halves keeps its
     * split control disabled with `labels.splitPaneNarrow` (see README).
     */
    readonly canSplit: boolean;
    /** Hide a blocked split control — pane budget spent or pane too narrow — instead of rendering it disabled; defaults to false. */
    readonly hideSplitWhenBlocked?: boolean;
    /** Body drop geometry: all edge bands, or left/right halves with whole-pane moves once splitting is unavailable. */
    readonly dropZones?: 'edges' | 'horizontal';
    /** Smallest share a divider may leave a pane; defaults to the kit's fraction. */
    readonly minPaneFraction?: number;
    /**
     * Whether a pane's strip draws the add control. Called per docked pane on
     * every render; omit to draw one in every pane. `false` leaves the strip's
     * end controls where they are and the chips as the only shrinking part.
     */
    readonly canAddTab?: (paneId: PaneId) => boolean;
    /**
     * Whether a tab draws its close control and its menu's close item. Called
     * per rendered chip on every render; omit to keep every tab closable.
     * `false` removes both routes without moving the chip: the close control
     * paints over the title's end rather than beside it, so the chip is the same
     * width either way. The menu still opens and carries the embedder's items.
     */
    readonly canCloseTab?: (tabId: TabId) => boolean;
    readonly intents: DockIntents;
    readonly labels: DockLabels;
    readonly renderTab: TabRenderer;
    /**
     * What a tab's chip shows as its title; omit to show the record's `title`
     * text. An embedder-internal seam: the Sidebar dispatches it to a per-kind
     * slot, and nothing outside that embedder is expected to supply it.
     */
    readonly renderTabTitle?: TabRenderer;
    /** Extra items for a tab's context menu; omit for the kit's own item only. */
    readonly renderTabMenuItems?: TabMenuExtras;
    /**
     * Surface-wide controls, drawn at the far end of the top-right pane's tab
     * strip so the surface needs no header of its own. The kit places them; what
     * they do is the embedder's.
     */
    readonly chrome?: ReactNode;
    /**
     * Called with the room rule's latest readings whenever they change, so an
     * embedder driving splits programmatically can honour the same rule the
     * split control does. A pane absent from the map has not been measured.
     */
    readonly onRoom?: (fits: ReadonlyMap<PaneId, HalvesFit>) => void;
}
/** Recursive docked layout; floating content is rendered separately by FloatLayer. */
export declare function DockSurface(props: DockSurfaceProps): ReactNode;
/** Horizontal Sidebar layout with stable tab containers across docking and floating. */
export type DockLayoutProps = DockSurfaceProps & TabRetention;
/**
 * Render one pane or two horizontal panes, and their floats, in one stable content tree.
 * @param props - layout, gestures and lazy body-retention policy.
 * @returns the layout; the containing ancestors must not clip or establish a fixed-position containing block.
 */
export declare function DockLayout(props: DockLayoutProps): ReactNode;
//# sourceMappingURL=DockSurface.d.ts.map