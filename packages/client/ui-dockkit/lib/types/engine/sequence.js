import { applyOp } from "./operations.js";
/** A sequence that has recorded nothing. */
export const EMPTY_HISTORY = { entries: [], cursor: 0 };
/** Operation kinds that only move focus. */
const FOCUS_OP_TYPES = new Set(['focusTab', 'focusPane', 'restoreFocus']);
/**
 * Whether an operation only moves focus, and so merges into its neighbours' undo step.
 * @param op - the operation.
 * @returns whether its type is a `FocusOpType`.
 */
export function isFocusOp(op) {
    return FOCUS_OP_TYPES.has(op.type);
}
/** Whether the entry at `index` only moves focus. */
function isFocusEntry(history, index) {
    const entry = history.entries[index];
    return entry !== undefined && entry.ops.every(isFocusOp);
}
/**
 * Whether a step back exists.
 * @param history - the sequence so far.
 * @returns whether any entry is applied.
 */
export function canStepBack(history) {
    return history.cursor > 0;
}
/**
 * Whether a step forward exists.
 * @param history - the sequence so far.
 * @returns whether a redo branch remains.
 */
export function canStepForward(history) {
    return history.cursor < history.entries.length;
}
/**
 * The operations a sequence has recorded, redo branch included.
 * @param history - the sequence so far.
 * @returns every entry's operations, in recorded order.
 */
export function recordedOps(history) {
    return history.entries.flatMap(entry => entry.ops);
}
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
export function record(history, state, ops) {
    if (ops.length === 0)
        return { history, state };
    let next = state;
    const inverse = [];
    for (const op of ops) {
        const result = applyOp(next, op);
        next = result.state;
        // Undo runs the inverses in reverse operation order.
        inverse.unshift(...result.inverse);
    }
    const kept = history.cursor === history.entries.length
        ? history.entries
        : history.entries.slice(0, history.cursor);
    return {
        history: { entries: [...kept, { ops, inverse }], cursor: history.cursor + 1 },
        state: next,
    };
}
/**
 * Step back one intent, or one whole run of consecutive focus-only intents.
 * @param history - the sequence so far.
 * @param state - the current state.
 * @returns the stepped-back pair, or `undefined` when nothing can be undone.
 */
export function stepBack(history, state) {
    if (!canStepBack(history))
        return undefined;
    let count = 1;
    if (isFocusEntry(history, history.cursor - 1)) {
        while (isFocusEntry(history, history.cursor - 1 - count))
            count += 1;
    }
    let next = state;
    for (const entry of history.entries.slice(history.cursor - count, history.cursor).reverse()) {
        for (const op of entry.inverse)
            next = applyOp(next, op).state;
    }
    return { history: { entries: history.entries, cursor: history.cursor - count }, state: next };
}
/**
 * Step forward over the intents the matching step back undid.
 * @param history - the sequence so far.
 * @param state - the current state.
 * @returns the stepped-forward pair, or `undefined` when nothing can be redone.
 */
export function stepForward(history, state) {
    if (!canStepForward(history))
        return undefined;
    let count = 1;
    if (isFocusEntry(history, history.cursor)) {
        while (isFocusEntry(history, history.cursor + count))
            count += 1;
    }
    let next = state;
    for (const entry of history.entries.slice(history.cursor, history.cursor + count)) {
        for (const op of entry.ops)
            next = applyOp(next, op).state;
    }
    return { history: { entries: history.entries, cursor: history.cursor + count }, state: next };
}
/** Layout state plus its history cursor, held here instead of by the embedder. */
export class Sequencer {
    current;
    recorded = EMPTY_HISTORY;
    /** @param initial - state the sequence replays from; never mutated. */
    constructor(initial) {
        this.current = initial;
    }
    /** Current state. */
    get state() {
        return this.current;
    }
    /** The recorded sequence as plain data. */
    get history() {
        return this.recorded;
    }
    /** The whole recorded sequence, including a redo branch that is not applied. */
    get ops() {
        return recordedOps(this.recorded);
    }
    /** How many recorded operations are currently applied. */
    get cursor() {
        return this.recorded.cursor;
    }
    /** Whether a step back exists. */
    get canUndo() {
        return canStepBack(this.recorded);
    }
    /** Whether a step forward exists. */
    get canRedo() {
        return canStepForward(this.recorded);
    }
    /**
     * Apply and record one operation as its own entry, dropping any redo branch first.
     * @param op - the operation to record.
     * @returns the state after it.
     * @throws when the operation is invalid against the current state; the
     *   sequence is left untouched.
     */
    dispatch(op) {
        return this.dispatchAll([op]);
    }
    /**
     * Apply and record one intent's operations as one entry, dropping any redo
     * branch first.
     * @param ops - the intent's operations; none records nothing.
     * @returns the state after them.
     * @throws when an operation is invalid; the sequence is left untouched.
     */
    dispatchAll(ops) {
        const stepped = record(this.recorded, this.current, ops);
        this.recorded = stepped.history;
        this.current = stepped.state;
        return this.current;
    }
    /**
     * Step back one intent, or one whole run of consecutive focus-only intents.
     * @returns false when there is nothing to undo.
     */
    undo() {
        const stepped = stepBack(this.recorded, this.current);
        if (stepped === undefined)
            return false;
        this.recorded = stepped.history;
        this.current = stepped.state;
        return true;
    }
    /**
     * Step forward over the intents the matching undo stepped back.
     * @returns false when there is nothing to redo.
     */
    redo() {
        const stepped = stepForward(this.recorded, this.current);
        if (stepped === undefined)
            return false;
        this.recorded = stepped.history;
        this.current = stepped.state;
        return true;
    }
}
//# sourceMappingURL=sequence.js.map