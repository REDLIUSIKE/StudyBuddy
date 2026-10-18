/** How the shell installs the one window drag watcher. */
export interface WindowDragRecallOptions {
    /** Document whose marked rows are watched. */
    readonly document: Document;
    /**
     * Schedules one frame callback and returns its canceller. The callback runs
     * asynchronously, as `requestAnimationFrame` does.
     */
    readonly scheduleFrame?: (frame: () => void) => () => void;
    /**
     * Watches one row's border box and calls `changed` whenever it resizes, returning
     * a disposer. Defaults to a `ResizeObserver`; a document without one watches no
     * boxes and relies on the DOM changes alone.
     */
    readonly watchBox?: (row: Element, changed: () => void) => () => void;
}
/**
 * Watch the window's marked drag rows and pulse the recall mark whenever their
 * geometry can have moved. Installs nothing outside the darwin platform, where no
 * app-region rule exists.
 * @param options - the document to watch and the two scheduling seams.
 * @returns a disposer that stops watching, drops any pending frame, and clears the mark.
 */
export declare function installWindowDragRecall(options: WindowDragRecallOptions): () => void;
//# sourceMappingURL=recall.d.ts.map