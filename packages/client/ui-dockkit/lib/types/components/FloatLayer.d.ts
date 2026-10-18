import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { DockIntents, DockLabels, TabRenderer } from '../contract/adapter.ts';
import type { FloatRect, LayoutState, PaneId, TabId, TabRecord } from '../contract/types.ts';
/** The layout whose `floats` this layer draws. */
export interface FloatLayerProps {
    readonly state: LayoutState;
    readonly intents: DockIntents;
    readonly labels: DockLabels;
    readonly renderTab: TabRenderer;
    /** Whether a floating tab offers its close control; defaults to true. Called per tab on every render. */
    readonly canCloseTab?: (tabId: TabId) => boolean;
    /** The panel header's title content; omit to show the record's `title` text (see `DockSurfaceProps`). */
    readonly renderTabTitle?: TabRenderer;
}
/**
 * Shared move/resize gestures; changing layout mode never owns the content DOM.
 * @param state - committed layout and float stacking order.
 * @param intents - gesture settlements.
 * @returns the current preview and focus/gesture callbacks.
 */
export declare function useFloatGestures(state: LayoutState, intents: DockIntents): {
    preview: {
        paneId: PaneId;
        rect: FloatRect;
    } | undefined;
    raise: (paneId: PaneId) => void;
    drag: (mode: "move" | "resize", paneId: PaneId, event: ReactPointerEvent<HTMLElement>) => void;
};
/**
 * Header-only controls, usable above either retained or visibility-mounted bodies.
 * @param props - owning pane/tab, localized labels and gesture callbacks.
 * @returns the float header without a content container.
 */
export declare function FloatHeader({ paneId, tab, labels, intents, renderTabTitle, canCloseTab, drag }: {
    readonly paneId: PaneId;
    readonly tab: TabRecord;
    readonly labels: DockLabels;
    readonly intents: DockIntents;
    readonly renderTabTitle: TabRenderer | undefined;
    readonly canCloseTab: ((id: TabId) => boolean) | undefined;
    readonly drag: ReturnType<typeof useFloatGestures>['drag'];
}): ReactNode;
/** Every floating panel, in z order. */
export declare function FloatLayer({ state, intents, labels, renderTab, renderTabTitle, canCloseTab }: FloatLayerProps): ReactNode;
//# sourceMappingURL=FloatLayer.d.ts.map