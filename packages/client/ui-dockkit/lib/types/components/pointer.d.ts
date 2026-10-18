/** The three window listeners one gesture installs. */
export interface PointerFollowers {
    readonly move: (event: PointerEvent) => void;
    readonly up: (event: PointerEvent) => void;
    readonly cancel: () => void;
}
/**
 * Take ownership of the pointer for the rest of the gesture.
 * @param element - the element the gesture started on.
 * @param pointerId - the pointer to capture.
 */
export declare function capturePointer(element: HTMLElement, pointerId: number): void;
/**
 * Capture the pointer, then follow it on the window until release or cancel.
 * Only that pointer's events count: a second finger or a pen beside the mouse
 * neither moves nor ends the gesture. The listeners remove themselves before
 * `up` or `cancel` runs; the returned callback ends the gesture early, for an
 * unmount or a superseding press.
 * @param element - the element the gesture started on.
 * @param pointerId - the pointer to capture and follow.
 * @param followers - listeners for move, release, and cancel.
 * @returns detach callback removing the three listeners.
 */
export declare function followPointer(element: HTMLElement, pointerId: number, followers: PointerFollowers): () => void;
/** What one gesture does while it lasts and when it settles. */
export interface GestureFollowers {
    readonly move: (event: PointerEvent) => void;
    /** The release. The gesture has already ended, and its preview reset, when this runs. */
    readonly up: (event: PointerEvent) => void;
}
/**
 * Start a gesture from the element a press landed on.
 * @param element - the pressed element; the pointer is captured on it.
 * @param pointerId - the pressing pointer.
 * @param followers - what the gesture does.
 */
export type BeginGesture = (element: HTMLElement, pointerId: number, followers: GestureFollowers) => void;
/**
 * One pointer gesture at a time for a component. A gesture ends on release, on
 * cancel, or when a new press supersedes it; `reset` runs at each of those ends
 * so the component clears its preview. Unmounting mid-gesture removes the
 * listeners without resetting anything.
 * @param reset - clears the component's gesture preview.
 * @returns the gesture starter, called from a pointer-down handler.
 */
export declare function useGesture(reset: () => void): BeginGesture;
//# sourceMappingURL=pointer.d.ts.map