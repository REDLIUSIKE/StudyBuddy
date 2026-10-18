/**
 * The band above the prompt as the host draws it for one session: renders
 * through the mods' `ui.render` hooks, keeps the latest tree with its button
 * callbacks held host-side, redraws when a `$.state` value a render read
 * changes or a mod asks, and hands watchers each new generation.
 * @module
 */
import type { UiNode } from './elements.ts';
import type { SurfaceSnapshot, UiRenderInput } from './types.ts';
export type { SurfaceSnapshot } from './types.ts';
/** What the table needs from the host. */
export interface SurfaceHost {
    /** Columns the band reports to `ui.render` as `bodyColumns` and `viewport.columns`. */
    readonly columns: number;
    /** Rows the band reports as `maxRows`. */
    readonly rows: number;
    /** Raise `ui.render` for one session through the mods and return the tree. */
    render(sessionId: string, input: UiRenderInput): Promise<UiNode>;
    /** Run one button's callback inside the session; the host owns the invocation and its reporting. */
    runAction(sessionId: string, callback: () => unknown): Promise<void>;
    /** Receives diagnostics: invalid trees, failed presses. */
    report(line: string): void;
}
/**
 * Bands by session id.
 */
export declare class SurfaceTable {
    private readonly host;
    private readonly bands;
    private disposed;
    constructor(host: SurfaceHost);
    /**
     * The latest snapshot of a session's band, drawing it first when nothing was drawn yet.
     * @param sessionId - the session.
     * @returns the current generation.
     */
    current(sessionId: string): Promise<SurfaceSnapshot>;
    /**
     * Watch a session's band: the current snapshot first, then every redraw, until the signal aborts.
     * @param sessionId - the session.
     * @param signal - ends the watch.
     * @returns the snapshots.
     */
    watch(sessionId: string, signal: AbortSignal): AsyncIterable<SurfaceSnapshot>;
    /**
     * Redraw a session's band through the mods and notify watchers when the tree changed.
     * @param sessionId - the session.
     * @returns settles once the redraw landed.
     */
    refresh(sessionId: string): Promise<void>;
    /**
     * Run the callback a button holds and redraw. A press from an earlier
     * generation is ignored: the button it names may no longer exist.
     * @param sessionId - the session.
     * @param generation - the generation the client saw.
     * @param actionId - the id the serialized Button carried.
     * @returns the snapshot after the press.
     */
    press(sessionId: string, generation: number, actionId: string): Promise<SurfaceSnapshot>;
    /**
     * Note a `$.state` read: during a render it subscribes the band to the slot.
     * @param sessionId - the session the state belongs to.
     * @param slot - the `<plugin>\u0000<key>` slot.
     */
    stateRead(sessionId: string, slot: string): void;
    /**
     * Note a `$.state` write: a subscribed band redraws.
     * @param sessionId - the session the state belongs to.
     * @param slot - the `<plugin>\u0000<key>` slot.
     */
    stateWritten(sessionId: string, slot: string): void;
    /**
     * Forget a session's band: its watch streams end and no further pass renders it.
     * @param sessionId - the disposed session.
     */
    forget(sessionId: string): void;
    /** Stop drawing: every band is forgotten and its watch streams end. */
    dispose(): void;
    private bandOf;
    private renderOnce;
}
//# sourceMappingURL=surfaces.d.ts.map