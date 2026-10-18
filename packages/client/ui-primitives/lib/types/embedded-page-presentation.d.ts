import type { EmbeddedPageController } from './embedded-page-controller.ts';
import { readEmbeddedSurfaceTheme } from './embedded-surface-geometry.ts';
/** Retain a page across panel changes; conceal its interactive layer under foreground overlays. */
export declare class EmbeddedPagePresentation<T extends string> {
    #private;
    private readonly controller;
    private readonly label;
    private readonly style?;
    private readonly menus;
    constructor(controller: EmbeddedPageController<T>, label: () => string, style?: string | undefined, menus?: 'hide' | 'cover');
    /**
     * Prepare the retained guest through navigation, including concurrent foreground entry.
     * @returns Resolves after navigation and owned styling; rejects on failure or scope replacement.
     */
    prepare: () => Promise<void>;
    attach: (container: HTMLElement) => (() => void);
    private syncLease;
    private createGuest;
    theme: typeof readEmbeddedSurfaceTheme;
    private queue;
    private place;
    private removeGuest;
    dispose(): void;
}
//# sourceMappingURL=embedded-page-presentation.d.ts.map