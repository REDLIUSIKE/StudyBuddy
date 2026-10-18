/**
 * Linear operation history over `applyOp`. Recording is total — every operation
 * lands in the sequence, focus moves included — and grouped by intent: the
 * operations one gesture or command produced form one entry, so stepping lands
 * on a point the user actually stopped at. Stepping is coarser still across
 * focus: a run of consecutive focus-only entries undoes and redoes as one step.
 *
 * Redoing re-applies the recorded operations; undoing applies the inverses that
 * were captured when they ran, so both directions stay exact. A new entry after
 * an undo drops the redo branch.
 *
 * Two shapes, one implementation. `record`/`stepBack`/`stepForward` are pure
 * functions over a plain `History`, which is what an embedder holding its layout
 * in an external store needs; `Sequencer` is a thin mutable wrapper over exactly
 * those functions, for an embedder that would rather hold the state here.
 */
import type { LayoutOp, LayoutState } from '../contract/types.ts';
/** One recorded intent: its operations, and the operations that undo them all. */
export interface HistoryEntry {
    readonly ops: readonly LayoutOp[];
    /** Already ordered for application: the last operation's inverse comes first. */
    readonly inverse: readonly LayoutOp[];
}
/** A recorded sequence and how much of it is applied. Plain data, safe to store. */
export interface History {
    readonly entries: readonly HistoryEntry[];
    /** How many entries are applied; entries beyond it are the redo branch. */
    readonly cursor: number;
}
/** A sequence that has recorded nothing. */
export declare const EMPTY_HISTORY: History;
/** A history and the state it produced, returned together so neither can drift. */
export interface HistoryStep {
    readonly history: History;
    readonly state: LayoutState;
}
/**
 * Whether an operation only moves focus, and so merges into its neighbours' undo step.
 * @param op - the operation.
 * @returns whether its type is a `FocusOpType`.
 */
export declare function isFocusOp(op: LayoutOp): boolean;
/**
 * Whether a step back exists.
 * @param history - the sequence so far.
 * @returns whether any entry is applied.
 */
export declare function canStepBack(history: History): boolean;
/**
 * Whether a step forward exists.
 * @param history - the sequence so far.
 * @returns whether a redo branch remains.
 */
export declare function canStepForward(history: History): boolean;
/**
 * The operations a sequence has recorded, redo branch included.
 * @param history - the sequence so far.
 * @returns every entry's operations, in recorded order.
 */
export declare function recordedOps(history: History): readonly LayoutOp[];
/**
 * Apply one intent's operations and record them as one entry, dropping any redo
 * branch first. An intent with no operations records nothing.
 * @param history - the sequence so far.
 * @param state - the state the operations apply to.
 * @param ops - the intent's operations, in application order.
 * @returns the extended history and the state after the operations.
 * @throws when an operation is invalid against the state it reaches; nothing is
 *   recorded.
 */
export declare function record(history: History, state: LayoutState, ops: readonly LayoutOp[]): HistoryStep;
/**
 * Step back one intent, or one whole run of consecutive focus-only intents.
 * @param history - the sequence so far.
 * @param state - the current state.
 * @returns the stepped-back pair, or `undefined` when nothing can be undone.
 */
export declare function stepBack(history: History, state: LayoutState): HistoryStep | undefined;
/**
 * Step forward over the intents the matching step back undid.
 * @param history - the sequence so far.
 * @param state - the current state.
 * @returns the stepped-forward pair, or `undefined` when nothing can be redone.
 */
export declare function stepForward(history: History, state: LayoutState): HistoryStep | undefined;
/** Layout state plus its history cursor, held here instead of by the embedder. */
export declare class Sequencer {
    private current;
    private recorded;
    /** @param initial - state the sequence replays from; never mutated. */
    constructor(initial: LayoutState);
    /** Current state. */
    get state(): LayoutState;
    /** The recorded sequence as plain data. */
    get history(): History;
    /** The whole recorded sequence, including a redo branch that is not applied. */
    get ops(): readonly LayoutOp[];
    /** How many recorded operations are currently applied. */
    get cursor(): number;
    /** Whether a step back exists. */
    get canUndo(): boolean;
    /** Whether a step forward exists. */
    get canRedo(): boolean;
    /**
     * Apply and record one operation as its own entry, dropping any redo branch first.
     * @param op - the operation to record.
     * @returns the state after it.
     * @throws when the operation is invalid against the current state; the
     *   sequence is left untouched.
     */
    dispatch(op: LayoutOp): LayoutState;
    /**
     * Apply and record one intent's operations as one entry, dropping any redo
     * branch first.
     * @param ops - the intent's operations; none records nothing.
     * @returns the state after them.
     * @throws when an operation is invalid; the sequence is left untouched.
     */
    dispatchAll(ops: readonly LayoutOp[]): LayoutState;
    /**
     * Step back one intent, or one whole run of consecutive focus-only intents.
     * @returns false when there is nothing to undo.
     */
    undo(): boolean;
    /**
     * Step forward over the intents the matching undo stepped back.
     * @returns false when there is nothing to redo.
     */
    redo(): boolean;
}
//# sourceMappingURL=sequence.d.ts.map