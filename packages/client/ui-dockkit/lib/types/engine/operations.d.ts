/**
 * The operation engine: one pure `applyOp` that returns the next state plus the
 * operations that undo it. No React, no DOM, no ambient state — replaying the
 * same operations over the same initial state always yields the same result,
 * because every id an operation creates travels inside the operation.
 *
 * Interaction limits (pane count, drag preview coalescing) are not enforced
 * here; they belong to the interaction layer (`constraints.ts` and the UI).
 */
import type { ApplyResult, LayoutOp, LayoutState } from '../contract/types.ts';
/**
 * Apply one operation.
 * @param state - state the operation reads; never mutated.
 * @param op - the operation, carrying every id it creates.
 * @returns the next state and the operations that undo it, applied in order.
 * @throws when the operation addresses missing nodes or breaks a model rule.
 */
export declare function applyOp(state: LayoutState, op: LayoutOp): ApplyResult;
/**
 * Fold operations forward, discarding inverses.
 * @param state - starting state.
 * @param ops - operations in recorded order.
 * @returns the state after every operation.
 */
export declare function replay(state: LayoutState, ops: readonly LayoutOp[]): LayoutState;
//# sourceMappingURL=operations.d.ts.map